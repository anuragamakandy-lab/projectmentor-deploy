using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Mock viva sessions — persistence and flow around the <see cref="VivaAgent"/>.
/// Every method is ownership-checked: a student only ever sees their own sessions.
/// </summary>
public sealed class VivaService(ProjectMentorDbContext db, VivaAgent agent)
{
    private const int MaxFollowUps = 2;
    private static readonly string[] Stages = ["Proposal", "Progress", "Final"];
    private static readonly string[] Difficulties = ["Friendly", "Standard", "Strict"];
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<VivaSessionListItem>> ListAsync(Guid studentId, CancellationToken ct) =>
        await db.VivaSessions.AsNoTracking()
            .Where(s => s.StudentId == studentId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new VivaSessionListItem(s.Id, s.Title, s.Stage, s.Difficulty, s.Status, s.CreatedAt, s.ScorePercent,
                s.Questions.Count(q => q.AnsweredAt != null), s.Questions.Count))
            .ToListAsync(ct);

    public async Task<VivaSessionResponse?> GetAsync(Guid studentId, Guid id, CancellationToken ct)
    {
        var session = await Load(studentId, id, ct);
        return session is null ? null : await MapAsync(session, ct);
    }

    public async Task<VivaSessionResponse> StartAsync(Guid studentId, StartVivaRequest body, CancellationToken ct)
    {
        if (body?.Details is null || string.IsNullOrWhiteSpace(body.Details.Title))
            throw new ArgumentException("Please give your project a title.");

        if (body.RoadmapRequestId is { } rid &&
            !await db.RoadmapRequests.AnyAsync(r => r.Id == rid && r.StudentId == studentId, ct))
            throw new ArgumentException("That roadmap was not found.");

        var stage = Stages.Contains(body.Stage) ? body.Stage! : "Final";
        var difficulty = Difficulties.Contains(body.Difficulty) ? body.Difficulty! : "Standard";
        var count = Math.Clamp(body.QuestionCount ?? 6, 3, 10);

        var fullName = await db.Users.Where(u => u.Id == studentId).Select(u => u.FullName).SingleOrDefaultAsync(ct) ?? "there";
        var firstName = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? fullName;

        // The examiner character chosen by the student (published by an admin) decides the name, style and language.
        var character = body.CharacterId is { } cid
            ? await db.VivaCharacters.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cid && c.IsPublished, ct)
            : await db.VivaCharacters.AsNoTracking().Where(c => c.IsPublished).OrderBy(c => c.SortOrder).FirstOrDefaultAsync(ct);
        if (body.Difficulty is null && character is not null) difficulty = character.Style;
        var language = character?.Language ?? "en-GB";
        var plan = await agent.PlanAsync(body.Details, stage, difficulty, count, firstName, ct, character?.Name ?? "Dr. Mentor", language);

        var session = new VivaSession
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            RoadmapRequestId = body.RoadmapRequestId,
            Title = body.Details.Title.Trim().Length > 300 ? body.Details.Title.Trim()[..300] : body.Details.Title.Trim(),
            Stage = stage,
            Difficulty = difficulty,
            Status = "InProgress",
            Greeting = plan.Greeting,
            CharacterId = character?.Id,
            Language = language,
            Details = JsonSerializer.SerializeToDocument(body.Details, Json),
        };
        var seq = 0;
        foreach (var q in plan.Questions)
            session.Questions.Add(new VivaQuestion { Id = Guid.NewGuid(), Sequence = seq++, Topic = q.Topic, Text = q.Question, LookingFor = q.LookingFor });

        db.VivaSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return await MapAsync(session, ct);
    }

    /// <summary>Mark one answer, optionally insert a follow-up question right after it, return the updated session.</summary>
    public async Task<VivaSessionResponse?> AnswerAsync(Guid studentId, Guid id, VivaAnswerRequest body, CancellationToken ct)
    {
        var session = await Load(studentId, id, ct, tracking: true);
        if (session is null) return null;
        if (session.Status == "Completed") throw new InvalidOperationException("This viva is already finished.");

        var question = session.Questions.SingleOrDefault(q => q.Id == body.QuestionId)
            ?? throw new ArgumentException("That question is not part of this viva.");
        if (question.AnsweredAt is not null) return await MapAsync(session, ct); // idempotent: double-submits are harmless

        var details = ReadDetails(session);
        var followUpsUsed = session.Questions.Count(q => q.IsFollowUp);
        var allowFollowUp = !question.IsFollowUp && followUpsUsed < MaxFollowUps && session.Difficulty != "Friendly";

        var answer = body.Answer?.Trim() ?? "";
        var examiner = await ExaminerNameAsync(session, ct);
        var eval = await agent.EvaluateAsync(details, session.Stage, session.Difficulty, question.Text, question.LookingFor, answer, allowFollowUp, ct, examiner, session.Language);

        question.Answer = answer.Length > 6000 ? answer[..6000] : answer;
        question.Score = eval.Score;
        question.Verdict = eval.Verdict;
        question.Reaction = eval.Reaction;
        question.Feedback = eval.Feedback;
        question.Strengths = [.. eval.Strengths];
        question.Improvements = [.. eval.Improvements];
        question.ModelAnswer = eval.ModelAnswer;
        question.DurationSeconds = body.DurationSeconds is >= 0 and < 3600 ? body.DurationSeconds : null;
        question.AnsweredAt = DateTimeOffset.UtcNow;

        if (eval.FollowUp is not null)
        {
            foreach (var later in session.Questions.Where(q => q.Sequence > question.Sequence)) later.Sequence++;
            var followUp = new VivaQuestion
            {
                Id = Guid.NewGuid(), VivaSessionId = session.Id, Sequence = question.Sequence + 1, Topic = question.Topic,
                Text = eval.FollowUp, LookingFor = question.LookingFor, IsFollowUp = true
            };
            // Add via the DbSet only: EF marks it Added and fixes up session.Questions itself.
            // (Adding to the collection with a pre-set Id would be treated as an UPDATE.)
            db.VivaQuestions.Add(followUp);
        }

        await db.SaveChangesAsync(ct);
        return await MapAsync(session, ct);
    }

    /// <summary>Close the viva: score unanswered questions as 0 and write the examiner's summary.</summary>
    public async Task<VivaSessionResponse?> FinishAsync(Guid studentId, Guid id, CancellationToken ct)
    {
        var session = await Load(studentId, id, ct, tracking: true);
        if (session is null) return null;
        if (session.Status == "Completed") return await MapAsync(session, ct);

        // Unanswered questions are dropped from the final mark rather than counted as zero if the student ends early.
        var answered = session.Questions.Where(q => q.AnsweredAt is not null).OrderBy(q => q.Sequence).ToList();
        var unanswered = session.Questions.Where(q => q.AnsweredAt is null).ToList();
        db.VivaQuestions.RemoveRange(unanswered);
        foreach (var q in unanswered) session.Questions.Remove(q);

        var percent = answered.Count == 0 ? 0 : (int)Math.Round(answered.Sum(q => q.Score ?? 0) * 100.0 / (answered.Count * 10));
        var summary = await agent.SummariseAsync(ReadDetails(session),
            answered.Select(q => (q.Topic, q.Text, q.Score ?? 0, q.Feedback)).ToList(), percent, ct, await ExaminerNameAsync(session, ct), session.Language);

        session.ScorePercent = percent;
        session.Summary = JsonSerializer.SerializeToDocument(summary, Json);
        session.Status = "Completed";
        session.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await MapAsync(session, ct);
    }

    public async Task<bool> DeleteAsync(Guid studentId, Guid id, CancellationToken ct) =>
        await db.VivaSessions.Where(s => s.Id == id && s.StudentId == studentId).ExecuteDeleteAsync(ct) > 0;

    /// <summary>Pre-fill the viva form from one of the student's roadmaps (intake answers, milestones, mentor chat).</summary>
    public async Task<VivaDetails?> PrefillAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        var request = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
            .Include(r => r.Answers).ThenInclude(a => a.Question)
            .Include(r => r.Roadmaps).ThenInclude(r => r.Milestones)
            .SingleOrDefaultAsync(r => r.Id == requestId && r.StudentId == studentId, ct);
        if (request is null) return null;

        string? Val(string code)
        {
            var el = request.Answers.FirstOrDefault(a => a.Question.Code == code)?.AnswerValue.RootElement;
            return el is null ? null : el.Value.ValueKind == JsonValueKind.String ? el.Value.GetString() : el.Value.GetRawText();
        }

        var roadmap = request.Roadmaps.OrderByDescending(r => r.Version).FirstOrDefault();
        var milestones = roadmap?.Milestones.OrderBy(m => m.OrderIndex).ToList() ?? [];
        var progress = milestones.Count == 0 ? null :
            string.Join("; ", milestones.Select(m => $"{m.Title} ({(m.Status == MilestoneStatus.Done ? "done" : m.Status == MilestoneStatus.InProgress ? "in progress" : "not started")})"));

        var chat = await db.ChatTurns.AsNoTracking()
            .Where(t => t.RoadmapRequestId == requestId && t.Role == "user")
            .OrderBy(t => t.Sequence).Select(t => t.Content).ToListAsync(ct);
        var notes = chat.Count == 0 ? null : "From my mentor chat: " + string.Join(" ", chat);

        int? team = int.TryParse(Val("team_size"), out var t) ? t : null;
        var title = string.IsNullOrWhiteSpace(request.Title) ? $"{Val("project_type")} project" : request.Title!;

        return new VivaDetails(title, ProjectType: Val("project_type"), TeamSize: team,
            OtherTech: Val("technologies_known"), Progress: progress, Notes: notes is { Length: > 3000 } ? notes[..3000] : notes);
    }

    // ---------- helpers ----------

    private Task<VivaSession?> Load(Guid studentId, Guid id, CancellationToken ct, bool tracking = false)
    {
        var query = db.VivaSessions.Include(s => s.Questions).Where(s => s.Id == id && s.StudentId == studentId);
        return (tracking ? query : query.AsNoTracking()).SingleOrDefaultAsync(ct);
    }

    private static VivaDetails ReadDetails(VivaSession s) =>
        s.Details.Deserialize<VivaDetails>(Json) ?? new VivaDetails(s.Title);

    async Task<VivaSessionResponse> MapAsync(VivaSession s, CancellationToken ct)
    {
        var c = s.CharacterId is { } id ? await db.VivaCharacters.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct) : null;
        return Map(s) with { Language = s.Language, Character = c is null ? null : View(c) };
    }

    private static VivaSessionResponse Map(VivaSession s) => new(
        s.Id, s.Title, s.Stage, s.Difficulty, s.Status, s.Greeting, s.CreatedAt, s.CompletedAt, s.ScorePercent, s.RoadmapRequestId,
        ReadDetails(s),
        s.Questions.OrderBy(q => q.Sequence).Select(q => new VivaQuestionResponse(
            q.Id, q.Sequence, q.Topic, q.Text, q.IsFollowUp, q.AnsweredAt is not null, q.Answer, q.Score, q.Verdict, q.Reaction,
            q.Feedback, q.Strengths, q.Improvements, q.ModelAnswer, q.DurationSeconds)).ToList(),
        s.Summary?.Deserialize<VivaSummary>(Json));

    async Task<string> ExaminerNameAsync(VivaSession s, CancellationToken ct) =>
        s.CharacterId is { } id ? await db.VivaCharacters.Where(c => c.Id == id).Select(c => c.Name).FirstOrDefaultAsync(ct) ?? "Dr. Mentor" : "Dr. Mentor";

    /// <summary>Published characters for students to choose from.</summary>
    public async Task<IReadOnlyList<VivaCharacterView>> CharactersAsync(bool includeHidden, CancellationToken ct)
    {
        var usage = await db.VivaSessions.Where(v => v.CharacterId != null).GroupBy(v => v.CharacterId!.Value)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return (await db.VivaCharacters.AsNoTracking().Where(c => includeHidden || c.IsPublished).OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync(ct))
            .Select(c => View(c, usage.GetValueOrDefault(c.Id))).ToList();
    }

    public static VivaCharacterView View(VivaCharacter c, int sessions = 0) => new(c.Id, c.Name, c.Tagline, c.Preset, c.Gender, c.SkinTone, c.HairColor,
        c.HairStyle, c.OutfitColor, c.AccentColor, c.Glasses, c.FacialHair, c.Language, c.Rate, c.Pitch, c.Style, c.IsPublished, c.SortOrder, sessions);

    static readonly string[] Languages = ["en-GB", "en-US", "en-IN"];
    static readonly string[] HairStyles = ["short", "side", "long", "bun", "bald", "curly"];

    public async Task<VivaCharacterView> SaveCharacterAsync(Guid? id, SaveVivaCharacterRequest b, CancellationToken ct)
    {
        var name = b.Name?.Trim() ?? "";
        if (name.Length is < 2 or > 40) throw new ArgumentException("Give the character a name (2 to 40 characters).");
        if (!Languages.Contains(b.Language)) throw new ArgumentException("Choose a language.");
        if (!HairStyles.Contains(b.HairStyle)) throw new ArgumentException("Choose a hair style.");
        if (b.Gender is not ("male" or "female")) throw new ArgumentException("Choose male or female.");
        if (!Difficulties.Contains(b.Style)) throw new ArgumentException("Choose an examiner style.");
        foreach (var color in new[] { b.SkinTone, b.HairColor, b.OutfitColor, b.AccentColor })
            if (color is null || !System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$")) throw new ArgumentException("Colours must look like #a1b2c3.");
        var c = id is null ? null : await db.VivaCharacters.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException();
        if (c is null)
        {
            c = new VivaCharacter { Id = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow, SortOrder = (await db.VivaCharacters.Select(x => (int?)x.SortOrder).MaxAsync(ct) ?? 0) + 1 };
            db.VivaCharacters.Add(c);
        }
        c.Name = name;
        c.Tagline = string.IsNullOrWhiteSpace(b.Tagline) ? null : b.Tagline.Trim()[..Math.Min(160, b.Tagline.Trim().Length)];
        c.Preset = string.IsNullOrWhiteSpace(b.Preset) ? "custom" : b.Preset.Trim()[..Math.Min(30, b.Preset.Trim().Length)];
        c.Gender = b.Gender; c.SkinTone = b.SkinTone; c.HairColor = b.HairColor; c.HairStyle = b.HairStyle;
        c.OutfitColor = b.OutfitColor; c.AccentColor = b.AccentColor; c.Glasses = b.Glasses; c.FacialHair = b.FacialHair && b.Gender == "male";
        c.Language = b.Language; c.Rate = Math.Clamp(b.Rate, 0.6, 1.4); c.Pitch = Math.Clamp(b.Pitch, 0.6, 1.4);
        c.Style = b.Style; c.IsPublished = b.IsPublished; c.UpdatedAt = DateTimeOffset.UtcNow;
        if (!c.IsPublished && !await db.VivaCharacters.AnyAsync(x => x.IsPublished && x.Id != c.Id, ct))
            throw new ArgumentException("Keep at least one character published so students can take a viva.");
        await db.SaveChangesAsync(ct);
        return View(c);
    }

    public async Task<bool> DeleteCharacterAsync(Guid id, CancellationToken ct)
    {
        if (!await db.VivaCharacters.AnyAsync(x => x.Id != id && x.IsPublished, ct))
            throw new InvalidOperationException("This is the last published character. Publish another one first.");
        return await db.VivaCharacters.Where(x => x.Id == id).ExecuteDeleteAsync(ct) > 0;
    }

    public async Task<AdminVivaStats> StatsAsync(CancellationToken ct)
    {
        var all = await db.VivaSessions.AsNoTracking().Select(v => new { v.Status, v.ScorePercent, v.StudentId }).ToListAsync(ct);
        var done = all.Where(v => v.Status == "Completed").ToList();
        return new AdminVivaStats(all.Count, done.Count, done.Count == 0 ? null : (int)Math.Round(done.Average(v => v.ScorePercent ?? 0)),
            all.Select(v => v.StudentId).Distinct().Count(), await CharactersAsync(true, ct));
    }

    /// <summary>The original examiner, created once so existing vivas keep working.</summary>
    public static async Task SeedCharactersAsync(ProjectMentorDbContext db)
    {
        if (await db.VivaCharacters.AnyAsync()) return;
        db.VivaCharacters.Add(new VivaCharacter
        {
            Id = Guid.NewGuid(), Name = "Dr. Mentor", Tagline = "Calm and fair. Asks about your design decisions.", Preset = "mentor", Gender = "male",
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow, SortOrder = 1,
        });
        await db.SaveChangesAsync();
    }
}
