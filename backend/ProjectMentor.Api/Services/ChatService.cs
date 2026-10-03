using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services.Ai;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>Everything we know about one student project, gathered from the intake, the chosen idea, the roadmap and the chat.</summary>
public sealed record ProjectFacts(
    string Title, string? Description, string ProjectType, int Year, DateOnly Deadline, decimal HoursPerWeek, int? TeamSize,
    string? Technologies, string? LeastConfident, string Status, IReadOnlyList<Milestone> Milestones, IReadOnlyList<ChatTurn> Chat)
{
    public int Done => Milestones.Count(m => m.Status == MilestoneStatus.Done);
    public IEnumerable<Milestone> Overdue => Milestones.Where(m => m.Status != MilestoneStatus.Done && m.DueDate < DateOnly.FromDateTime(DateTime.Now));
    public Milestone? Next => Milestones.Where(m => m.Status != MilestoneStatus.Done).OrderBy(m => m.DueDate).FirstOrDefault();

    /// <summary>Plain-text brief given to the AI so every answer is about THIS project.</summary>
    public string Brief()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Project title: {Title}");
        if (!string.IsNullOrWhiteSpace(Description)) sb.AppendLine($"Idea / description: {Description}");
        sb.AppendLine($"Type: {ProjectType} project · Year of study: {Year} · Deadline: {Deadline:d MMM yyyy} ({Math.Max(0, Deadline.DayNumber - DateOnly.FromDateTime(DateTime.Now).DayNumber)} days left)");
        sb.AppendLine($"Time available: {HoursPerWeek:0.#} hours/week · Team size: {TeamSize?.ToString() ?? "not given"}");
        if (!string.IsNullOrWhiteSpace(Technologies)) sb.AppendLine($"Technologies the student knows: {Technologies}");
        if (!string.IsNullOrWhiteSpace(LeastConfident)) sb.AppendLine($"Least confident in: {LeastConfident}");
        sb.AppendLine(Milestones.Count == 0
            ? "Roadmap: NOT generated yet. The student is still shaping the idea with you before generating the roadmap."
            : $"Roadmap status: {(Status == "Accepted" ? "accepted and in progress" : Status == "PendingApproval" ? "generated, waiting for the student to review and accept" : Status)}");
        if (Milestones.Count > 0)
        {
            sb.AppendLine($"Milestones ({Done}/{Milestones.Count} done):");
            foreach (var m in Milestones.OrderBy(m => m.OrderIndex))
                sb.AppendLine($"- {m.Title} [{m.Phase}] due {m.DueDate:d MMM} · {m.Status}{(Overdue.Contains(m) ? " · OVERDUE" : "")}");
        }
        return sb.ToString();
    }
}

/// <summary>
/// The roadmap mentor chatbot. It knows the student's project (intake, idea, roadmap, progress) and remembers the whole
/// conversation for that roadmap. A new chat opens with a summary of the project and three suggested questions;
/// after that it answers whatever the student asks, directly, and offers three new follow-up suggestions.
/// </summary>
public sealed class ChatService(ProjectMentorDbContext db, LlmClient llm)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    public bool Available => llm.IsConfigured;

    public async Task<ProjectFacts?> FactsAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        var r = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
            .Include(x => x.Answers).ThenInclude(a => a.Question)
            .Include(x => x.Roadmaps).ThenInclude(x => x.Milestones)
            .SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, ct);
        if (r is null) return null;
        string? Val(string code)
        {
            var el = r.Answers.FirstOrDefault(a => a.Question.Code == code)?.AnswerValue.RootElement;
            return el is null ? null : el.Value.ValueKind == JsonValueKind.String ? el.Value.GetString() : el.Value.GetRawText();
        }
        var roadmap = r.Roadmaps.Where(x => x.Status != RoadmapStatus.Superseded).OrderByDescending(x => x.Version).FirstOrDefault();
        var chat = await db.ChatTurns.AsNoTracking().Where(t => t.RoadmapRequestId == requestId).OrderBy(t => t.Sequence).ToListAsync(ct);
        return new ProjectFacts(
            string.IsNullOrWhiteSpace(r.Title) ? "Untitled project" : r.Title!, r.Description, Val("project_type") ?? "software",
            int.TryParse(Val("year_of_study"), out var y) ? y : 3,
            DateOnly.TryParse(Val("deadline"), out var d) ? d : DateOnly.FromDateTime(DateTime.Now).AddDays(60),
            decimal.TryParse(Val("hours_per_week"), System.Globalization.CultureInfo.InvariantCulture, out var h) ? h : 8,
            int.TryParse(Val("team_size"), out var t) ? t : null, Val("technologies_known"), Val("least_confident"),
            roadmap?.Status.ToString() ?? r.Status.ToString(), roadmap?.Milestones.OrderBy(m => m.OrderIndex).ToList() ?? [], chat);
    }

    /// <summary>Stored transcript for a roadmap (null if the request isn't the student's).</summary>
    public async Task<IReadOnlyList<ChatMessage>?> GetHistoryAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        if (!await db.RoadmapRequests.AnyAsync(r => r.Id == requestId && r.StudentId == studentId, ct)) return null;
        return await LoadTurns(requestId, ct);
    }

    /// <summary>Full chat state: messages, the project summary card and suggestions (opening the chat for the first time creates the welcome).</summary>
    public async Task<ChatResponse?> OpenAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        var facts = await FactsAsync(studentId, requestId, ct);
        if (facts is null) return null;
        if (facts.Chat.Count == 0) return await SendAsync(studentId, requestId, null, ct);
        var lastSuggestions = Suggestions(facts, null);
        return new ChatResponse(facts.Chat[^1].Content, facts.Milestones.Count > 0 || facts.Chat.Count(c => c.Role == "user") >= 3,
            await LoadTurns(requestId, ct), lastSuggestions, SummaryCard(facts));
    }

    /// <summary>Append the student's message (if any), get the mentor's reply, persist both, return the full transcript.</summary>
    public async Task<ChatResponse?> SendAsync(Guid studentId, Guid requestId, string? userMessage, CancellationToken ct)
    {
        var facts = await FactsAsync(studentId, requestId, ct);
        if (facts is null) return null;
        var turns = facts.Chat.ToList();
        var nextSeq = turns.Count == 0 ? 0 : turns[^1].Sequence + 1;
        var message = userMessage?.Trim();
        if (message?.Length > 3000) message = message[..3000];

        if (!string.IsNullOrWhiteSpace(message))
        {
            var userTurn = new ChatTurn { Id = Guid.NewGuid(), RoadmapRequestId = requestId, Role = "user", Content = message, Sequence = nextSeq++ };
            db.ChatTurns.Add(userTurn);
            turns.Add(userTurn);
        }
        else if (turns.Count > 0)
        {
            // Re-opening an existing chat never adds a second welcome.
            return new ChatResponse(turns[^1].Content, true, await LoadTurns(requestId, ct), Suggestions(facts, null), SummaryCard(facts));
        }

        string reply;
        List<string> suggestions;
        var ready = facts.Milestones.Count > 0 || turns.Count(t => t.Role == "user") >= 3;

        if (!llm.IsConfigured)
        {
            reply = turns.Count == 0 ? Welcome(facts)
                : "The AI mentor is not available right now (an admin needs to add the Gemini API key in System settings). Your message is saved, and you can still generate and follow your roadmap.";
            suggestions = Suggestions(facts, message);
        }
        else
        {
            var system =
                "You are ProjectMentor, a friendly, expert software-project mentor for university students. You are supportive, honest and practical, " +
                "like a good supervisor. You KNOW the student's project details below and must use them in every answer (refer to the project by name, " +
                "its users, features, deadline and milestones). You remember the whole conversation.\n" +
                "Rules:\n" +
                "1. ALWAYS answer the student's actual question directly and completely first. Never dodge a question or reply only with another question.\n" +
                "2. Give concrete, correct, step-by-step guidance (tools, commands, examples) when they ask how to do something. If you do not know a specific product, say so and explain the general approach.\n" +
                "3. If something important is missing for the plan (e.g. target users, key features, data, tech stack, scope), you may ask ONE short follow-up question at the END.\n" +
                "4. Keep answers focused: usually 80-220 words. Use short paragraphs and '-' bullet lists; **bold** key terms. No headings.\n" +
                "5. Be encouraging but realistic about the deadline and scope.\n" +
                "Return ONLY JSON: {\"reply\": string, \"suggestions\": [3 short questions the student might ask you next, specific to this project, max 8 words each]}.\n\n" +
                "PROJECT DETAILS:\n" + facts.Brief();

            var llmTurns = new List<(string, string)>();
            if (turns.Count == 0)
                llmTurns.Add(("user", "Start the conversation: greet me, give a short summary of my project details as a bullet list (title, type, deadline, time, team, " +
                                      "technologies, and milestones if any), say how you can help, and suggest 3 important first questions to ask you (e.g. about stakeholders, scope, tech stack)."));
            else
                foreach (var t in turns.TakeLast(40)) llmTurns.Add((t.Role, t.Content));

            try
            {
                var raw = await llm.CompleteJsonAsync(system, string.Join("\n\n", llmTurns.Select(t => (t.Item1 == "user" ? "STUDENT: " : "MENTOR: ") + t.Item2)) +
                    "\n\nWrite the MENTOR's next reply.", ct, 0.6);
                var parsed = JsonSerializer.Deserialize<AiReply>(raw, Json);
                // The first message is always the clear project summary; the AI adds project-specific suggestions.
                reply = turns.Count == 0 || string.IsNullOrWhiteSpace(parsed?.Reply) ? Welcome(facts) : parsed!.Reply!.Trim();
                suggestions = parsed?.Suggestions?.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).Take(3).ToList() ?? [];
                if (suggestions.Count == 0) suggestions = Suggestions(facts, message);
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException)
            {
                reply = turns.Count == 0 ? Welcome(facts) : "Sorry, I could not reach the AI just now. Please send your question again in a moment.";
                suggestions = Suggestions(facts, message);
            }
        }

        db.ChatTurns.Add(new ChatTurn { Id = Guid.NewGuid(), RoadmapRequestId = requestId, Role = "assistant", Content = reply, Sequence = nextSeq });
        await db.SaveChangesAsync(ct);
        return new ChatResponse(reply, ready, await LoadTurns(requestId, ct), suggestions, SummaryCard(facts));
    }

    sealed record AiReply(string? Reply, List<string>? Suggestions);

    static string Welcome(ProjectFacts f)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Hi! I'm your ProjectMentor. Here is what I know about **{f.Title}**:");
        sb.AppendLine();
        sb.AppendLine($"- **Type:** {f.ProjectType} project (year {f.Year})");
        sb.AppendLine($"- **Deadline:** {f.Deadline:d MMMM yyyy}");
        sb.AppendLine($"- **Time:** about {f.HoursPerWeek:0.#} hours a week{(f.TeamSize is > 1 ? $", team of {f.TeamSize}" : "")}");
        if (!string.IsNullOrWhiteSpace(f.Technologies)) sb.AppendLine($"- **You know:** {f.Technologies}");
        if (f.Milestones.Count > 0) sb.AppendLine($"- **Roadmap:** {f.Done} of {f.Milestones.Count} milestones done{(f.Next is { } n ? $", next: {n.Title} ({n.DueDate:d MMM})" : "")}");
        if (!string.IsNullOrWhiteSpace(f.Description)) sb.AppendLine($"- **Idea:** {f.Description.Split('\n')[0]}");
        sb.AppendLine();
        sb.Append(f.Milestones.Count == 0
            ? "Tell me more about your idea, or ask me anything: stakeholders, features, tech stack or scope. When you are ready, generate your roadmap. Here are 3 good questions to start with:"
            : "Ask me anything about your next milestone, design, testing or your report. Here are 3 good questions to start with:");
        return sb.ToString();
    }

    static List<string> Suggestions(ProjectFacts f, string? last)
    {
        var list = new List<string>();
        if (f.Overdue.Any()) list.Add($"How do I catch up on {f.Overdue.First().Title}?");
        if (f.Milestones.Count == 0)
        {
            list.Add("Who are the stakeholders in this project?");
            list.Add("What features should my first version have?");
            list.Add("Which tech stack suits this project?");
        }
        else
        {
            if (f.Next is { } n) list.Add($"How should I start \"{n.Title}\"?");
            list.Add("Who are the stakeholders in this project?");
            list.Add("How should I design the database?");
            list.Add("How do I test this project properly?");
        }
        return list.Where(s => !string.Equals(s, last, StringComparison.OrdinalIgnoreCase)).Distinct().Take(3).ToList();
    }

    static ChatSummary SummaryCard(ProjectFacts f) => new(
        f.Title, f.Description, f.ProjectType, f.Deadline, f.HoursPerWeek, f.TeamSize, f.Technologies, f.Status,
        f.Milestones.Count, f.Done, f.Overdue.Count(), f.Next?.Title, f.Next?.DueDate);

    private async Task<IReadOnlyList<ChatMessage>> LoadTurns(Guid requestId, CancellationToken ct) =>
        (await db.ChatTurns.AsNoTracking().Where(t => t.RoadmapRequestId == requestId)
            .OrderBy(t => t.Sequence).ToListAsync(ct))
            .Select(t => new ChatMessage(t.Role, t.Content)).ToList();
}

/// <summary>
/// AI helpers that work from the project facts: the summary shown after accepting a roadmap, the professional
/// "Concerns and solutions" report section written from the chat, and the mock viva pre-fill.
/// Every method has a rule-based fallback so it still works without an AI key.
/// </summary>
public sealed class ProjectInsightService(ChatService chat, LlmClient llm, ProjectMentorDbContext db)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ---------------------------------------------------------------- roadmap summary (after accept)

    public async Task<RoadmapSummary?> BuildSummaryAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        var f = await chat.FactsAsync(studentId, requestId, ct);
        if (f is null || f.Milestones.Count == 0) return null;
        RoadmapSummary? ai = null;
        if (llm.IsConfigured)
        {
            try
            {
                var raw = await llm.CompleteJsonAsync(
                    "You write a short, encouraging summary of a student's accepted project roadmap. Plain text, no markdown. Return ONLY JSON: " +
                    "{\"overview\": string (2-3 sentences: what they will build and how the plan gets them there), " +
                    "\"phases\": [{\"name\": string, \"dates\": string, \"focus\": string}] (group the milestones into 3-6 phases), " +
                    "\"firstSteps\": [3 concrete things to do this week], \"tips\": [3 tips specific to this project and deadline], " +
                    "\"risks\": [2-3 main risks with a short mitigation each]}",
                    f.Brief() + "\nChat notes: " + string.Join(" | ", f.Chat.Where(c => c.Role == "user").TakeLast(15).Select(c => c.Content)), ct, 0.5);
                ai = JsonSerializer.Deserialize<RoadmapSummary>(raw, Json);
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException) { }
        }
        if (ai is { Overview.Length: > 10 }) return ai;

        var phases = f.Milestones.GroupBy(m => m.Phase).Select(g => new SummaryPhase(g.Key.ToString(),
            $"{g.Min(m => m.DueDate):d MMM} – {g.Max(m => m.DueDate):d MMM}", string.Join(", ", g.Select(m => m.Title)))).ToList();
        return new RoadmapSummary(
            $"Your roadmap for {f.Title} has {f.Milestones.Count} milestones spread across {phases.Count} phases, finishing before {f.Deadline:d MMMM yyyy}. Work through them in order and mark each one done as you go.",
            phases,
            [$"Start \"{f.Milestones[0].Title}\" (due {f.Milestones[0].DueDate:d MMM}).", "Block fixed study hours in your weekly timetable.", "Set up a Git repository and a shared folder for your report."],
            [$"Aim for {f.HoursPerWeek:0.#} focused hours every week rather than last-minute bursts.", "Keep notes and screenshots as you work: they become your report.", "Ask the mentor chatbot whenever you are stuck."],
            ["Scope creep: build the core features first, extras later.", "Late testing: test each feature as soon as it works."]) { IsFallback = true };
    }

    // ---------------------------------------------------------------- concerns and solutions (report)

    public async Task<IReadOnlyList<Concern>> ConcernsAsync(ProjectFacts f, CancellationToken ct)
    {
        var questions = f.Chat.Where(c => c.Role == "user").Select(c => c.Content).ToList();
        if (questions.Count == 0) return [];
        if (llm.IsConfigured)
        {
            try
            {
                var transcript = string.Join("\n", f.Chat.TakeLast(60).Select(c => (c.Role == "user" ? "Student: " : "Mentor: ") + c.Content));
                var raw = await llm.CompleteJsonAsync(
                    "You turn a student-mentor conversation into the \"Concerns and solutions\" section of a formal project report. " +
                    "Do NOT copy the questions and answers. Group related questions into 3-7 concerns. For each concern write, in formal third-person academic English: " +
                    "a short title, a paragraph explaining the concern and why it matters for this project, and a detailed paragraph describing the agreed solution or approach " +
                    "(concrete steps, tools and decisions). Plain text, no markdown. Return ONLY JSON: {\"concerns\": [{\"title\": string, \"description\": string, \"solution\": string}]}",
                    f.Brief() + "\nCONVERSATION:\n" + transcript, ct, 0.4);
                var parsed = JsonSerializer.Deserialize<ConcernList>(raw, Json);
                if (parsed?.Concerns is { Count: > 0 } list) return list;
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException) { }
        }
        // Fallback: one concern per student question, rewritten neutrally, with the mentor's answer as the solution.
        var result = new List<Concern>();
        for (var i = 0; i < f.Chat.Count && result.Count < 7; i++)
        {
            if (f.Chat[i].Role != "user") continue;
            var answer = i + 1 < f.Chat.Count && f.Chat[i + 1].Role == "assistant" ? f.Chat[i + 1].Content : "To be discussed with the supervisor.";
            var q = f.Chat[i].Content.Trim();
            result.Add(new Concern(q.Length > 70 ? q[..70] + "…" : q, $"During planning, the student raised the following concern: {q}", answer.Replace("**", "")));
        }
        return result;
    }

    sealed record ConcernList(List<Concern>? Concerns);

    // ---------------------------------------------------------------- mock viva pre-fill

    public async Task<VivaDetails?> VivaPrefillAsync(Guid studentId, Guid requestId, CancellationToken ct)
    {
        var f = await chat.FactsAsync(studentId, requestId, ct);
        if (f is null) return null;
        var techs = f.Technologies ?? "";
        var progress = f.Milestones.Count == 0 ? null :
            $"{f.Done} of {f.Milestones.Count} milestones done. " + string.Join("; ", f.Milestones.Select(m => $"{m.Title} ({(m.Status == MilestoneStatus.Done ? "done" : m.Status == MilestoneStatus.InProgress ? "in progress" : "not started")})"));
        var basic = new VivaDetails(f.Title, ProjectType: f.ProjectType, TeamSize: f.TeamSize, OtherTech: string.IsNullOrWhiteSpace(techs) ? null : techs,
            Progress: progress, Problem: f.Description, Features: f.Milestones.Count == 0 ? null : string.Join("; ", f.Milestones.Where(m => m.Phase == MilestonePhase.Build).Select(m => m.Title)));
        if (!llm.IsConfigured) return basic;
        try
        {
            var raw = await llm.CompleteJsonAsync(
                "Fill a mock-viva preparation form for a student's software project using ONLY the information given (project details, roadmap milestones, mentor chat). " +
                "Write in first person as the student, short and specific (1-3 sentences or a comma-separated list per field). If something is not known, make a sensible, " +
                "clearly typical suggestion for this kind of project that the student can edit, never leave a field empty except yourRole for solo projects. " +
                "Return ONLY JSON with these string fields: problem, targetUsers, objectives, features, frontend, backend, database, architecture, security, testing, " +
                "deployment, challenges, limitations, futureWork, yourRole.",
                f.Brief() + "\nMENTOR CHAT:\n" + string.Join("\n", f.Chat.TakeLast(40).Select(c => (c.Role == "user" ? "Student: " : "Mentor: ") + c.Content)), ct, 0.4);
            var ai = JsonSerializer.Deserialize<VivaDetails>(raw, Json);
            if (ai is null) return basic;
            return ai with
            {
                Title = f.Title, ProjectType = f.ProjectType, TeamSize = f.TeamSize, Progress = progress,
                OtherTech = basic.OtherTech, Module = null, Novelty = null, DataModel = null, Notes = null,
                YourRole = f.TeamSize is > 1 ? ai.YourRole : "I built the whole project on my own.",
            };
        }
        catch (Exception ex) when (ex is AiUnavailableException or JsonException) { return basic; }
    }
}

public sealed record SummaryPhase(string Name, string Dates, string Focus);
public sealed record RoadmapSummary(string Overview, IReadOnlyList<SummaryPhase>? Phases, IReadOnlyList<string>? FirstSteps, IReadOnlyList<string>? Tips, IReadOnlyList<string>? Risks)
{
    /// <summary>True for the rule-based version (AI busy); it is shown but not saved, so the AI version is tried again later.</summary>
    public bool IsFallback { get; init; }
}
public sealed record Concern(string Title, string Description, string Solution);
