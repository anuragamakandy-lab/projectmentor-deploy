using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services.Ai;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

public sealed class WorkflowService(
    ProjectMentorDbContext db,
    IdeaAgent ideaAgent,
    PlannerAgent planner,
    ResourceAgent resourceAgent,
    AnalysisAgent analysisAgent,
    ValidationAgent validationAgent)
{
    private static readonly IReadOnlyDictionary<string, Guid> QuestionIds = new Dictionary<string, Guid>
    {
        ["year_of_study"] = Guid.Parse("20000000-0000-0000-0000-000000000001"),
        ["project_type"] = Guid.Parse("20000000-0000-0000-0000-000000000003"),
        ["deadline"] = Guid.Parse("20000000-0000-0000-0000-000000000004"),
        ["hours_per_week"] = Guid.Parse("20000000-0000-0000-0000-000000000005"),
        ["team_size"] = Guid.Parse("20000000-0000-0000-0000-000000000006"),
        ["technologies_known"] = Guid.Parse("20000000-0000-0000-0000-000000000007"),
        ["least_confident"] = Guid.Parse("20000000-0000-0000-0000-000000000008")
    };

    // -- Path B (student already has an idea): create the request and plan immediately. --
    public async Task<RoadmapRequest> CreateAsync(Guid studentId, IntakeRequest intake, CancellationToken cancellationToken)
    {
        Validate(intake);
        var request = NewRequest(studentId, intake);
        db.RoadmapRequests.Add(request);
        db.QuestionAnswers.AddRange(BuildAnswers(request.Id, intake));
        var run = NewRun(request.Id);
        db.AgentWorkflowRuns.Add(run);
        await db.SaveChangesAsync(cancellationToken);

        await ExecuteWorkflowAsync(new WorkflowContext { Run = run, Request = request, Intake = intake }, studentId, cancellationToken);
        return request;
    }

    // -- Path A step 1: create a draft request WITHOUT planning, so ideas can be suggested first. --
    public async Task<RoadmapRequest> DraftCreateAsync(Guid studentId, IntakeRequest intake, CancellationToken cancellationToken)
    {
        Validate(intake);
        var request = NewRequest(studentId, intake);
        request.Status = RoadmapRequestStatus.Submitted;
        db.RoadmapRequests.Add(request);
        db.QuestionAnswers.AddRange(BuildAnswers(request.Id, intake));
        await db.SaveChangesAsync(cancellationToken);
        return request;
    }

    // -- Path A step 2: ask the Idea agent for suggestions for an owned request. --
    public async Task<SuggestIdeasResponse> SuggestIdeasAsync(Guid studentId, Guid requestId, IReadOnlyList<string> exclude, CancellationToken cancellationToken)
    {
        var request = await db.RoadmapRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, cancellationToken)
            ?? throw new KeyNotFoundException("Roadmap request not found.");

        if (!ideaAgent.Available)
            return new SuggestIdeasResponse(false, [], "Idea suggestions need an AI key. Ask an admin to add GEMINI_API_KEY, or enter your own project idea.");

        var intake = await ReadIntakeAsync(request, cancellationToken);
        var ideas = await ideaAgent.SuggestAsync(intake, exclude ?? [], cancellationToken);
        return new SuggestIdeasResponse(true, ideas, null);
    }

    // -- Path A step 3 (and Path B alt): lock in a chosen idea, then run the planning workflow. --
    public async Task<RoadmapRequest> PlanAsync(Guid studentId, Guid requestId, ChooseIdeaRequest? choice, CancellationToken cancellationToken)
    {
        var request = await db.RoadmapRequests
            .Include(x => x.Roadmaps)
            .SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, cancellationToken)
            ?? throw new KeyNotFoundException("Roadmap request not found.");

        if (request.Roadmaps.Any(r => r.Status is RoadmapStatus.Accepted or RoadmapStatus.PendingApproval))
            throw new InvalidOperationException("This request already has a roadmap.");
        // After "Ask for changes" the old plan is kept as history and a new version is planned.
        foreach (var old in request.Roadmaps) old.Status = RoadmapStatus.Superseded;

        if (!string.IsNullOrWhiteSpace(choice?.Title))
            request.Title = choice.Title.Trim();
        if (!string.IsNullOrWhiteSpace(choice?.Summary))
            request.Description = choice.Summary.Trim().Length > 2000 ? choice.Summary.Trim()[..2000] : choice.Summary.Trim();

        request.Status = RoadmapRequestStatus.Planning;
        var run = NewRun(request.Id);
        db.AgentWorkflowRuns.Add(run);
        await db.SaveChangesAsync(cancellationToken);

        var intake = await ReadIntakeAsync(request, cancellationToken);

        // Fold any saved mentor-chat answers into the summary so the Planner personalises on them.
        var chatAnswers = await db.ChatTurns.AsNoTracking()
            .Where(t => t.RoadmapRequestId == requestId && t.Role == "user")
            .OrderBy(t => t.Sequence).Select(t => t.Content).ToListAsync(cancellationToken);
        var summary = string.Join("\n", new[] { choice?.Summary, chatAnswers.Count > 0 ? "Student's chat notes: " + string.Join(" · ", chatAnswers) : null }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        await ExecuteWorkflowAsync(new WorkflowContext { Run = run, Request = request, Intake = intake, IdeaSummary = string.IsNullOrWhiteSpace(summary) ? null : summary }, studentId, cancellationToken);
        return request;
    }

    // Shared planning pipeline: Planner -> Resource -> Analysis -> Validation, then pause for approval.
    private async Task ExecuteWorkflowAsync(WorkflowContext context, Guid studentId, CancellationToken cancellationToken)
    {
        var request = context.Request;
        var run = context.Run;
        try
        {
            await planner.RunAsync(context, cancellationToken);
            context.Roadmap = new Roadmap
            {
                Id = Guid.NewGuid(), RoadmapRequestId = request.Id, StudentId = studentId, Version = request.Roadmaps.Count + 1,
                Status = RoadmapStatus.PendingApproval, GeneratedAt = DateTimeOffset.UtcNow,
                Milestones = context.Plan.Select((item, index) => new Milestone
                {
                    Id = Guid.NewGuid(), Phase = item.Phase, Title = item.Title, Description = item.Description,
                    OrderIndex = index + 1, DueDate = item.DueDate, Status = MilestoneStatus.NotStarted,
                    EstimatedHours = item.EstimatedHours
                }).ToList()
            };
            request.Roadmaps.Add(context.Roadmap);
            db.Roadmaps.Add(context.Roadmap);
            request.Status = RoadmapRequestStatus.PendingApproval;
            await db.SaveChangesAsync(cancellationToken);

            await resourceAgent.RunAsync(context, cancellationToken);
            await analysisAgent.RunAsync(context, cancellationToken);
            await validationAgent.RunAsync(context, cancellationToken);

            if (!context.ValidationPassed)
            {
                request.Status = RoadmapRequestStatus.Failed;
                run.Status = WorkflowRunStatus.Failed;
                run.CompletedAt = DateTimeOffset.UtcNow;
                context.Roadmap.Status = RoadmapStatus.Rejected;
                await db.SaveChangesAsync(cancellationToken);
                throw new InvalidOperationException($"Workflow validation failed: {string.Join(", ", context.ValidationErrors)}");
            }

            run.Status = WorkflowRunStatus.PausedForApproval;
            run.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (run.Status != WorkflowRunStatus.Failed)
            {
                run.Status = WorkflowRunStatus.Failed;
                run.CompletedAt = DateTimeOffset.UtcNow;
                request.Status = RoadmapRequestStatus.Failed;
                await db.SaveChangesAsync(cancellationToken);
            }
            throw;
        }
    }

    public async Task<RoadmapRequest?> GetAsync(Guid studentId, Guid requestId, CancellationToken cancellationToken) =>
        await db.RoadmapRequests.AsSplitQuery()
            .Include(x => x.Roadmaps).ThenInclude(x => x.Milestones).ThenInclude(x => x.Resources).ThenInclude(x => x.Resource)
            .Include(x => x.WorkflowRuns)
            .SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, cancellationToken);

    public async Task<RoadmapRequest?> GetLatestAsync(Guid studentId, CancellationToken cancellationToken) =>
        await db.RoadmapRequests.AsSplitQuery()
            .Include(x => x.Roadmaps).ThenInclude(x => x.Milestones).ThenInclude(x => x.Resources).ThenInclude(x => x.Resource)
            .Include(x => x.WorkflowRuns)
            .Where(x => x.StudentId == studentId)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<ExecutionSummaryResponse?> GetExecutionAsync(Guid studentId, Guid requestId, CancellationToken cancellationToken)
    {
        var run = await db.AgentWorkflowRuns.AsNoTracking().AsSplitQuery()
            .Where(r => r.RoadmapRequestId == requestId && r.RoadmapRequest.StudentId == studentId)
            .Include(r => r.Steps).ThenInclude(s => s.ToolCalls)
            .Include(r => r.ValidationResults)
            .Include(r => r.ApprovalDecisions)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (run is null) return null;

        var steps = run.Steps.OrderBy(s => s.StepOrder).Select(s => new AgentStepResponse(
            s.AgentName.ToString(), s.StepOrder, s.Status.ToString(), s.StartedAt, s.CompletedAt,
            Duration(s.StartedAt, s.CompletedAt), s.OutputPayload?.RootElement.GetRawText(),
            s.ToolCalls.Select(t => new ToolCallResponse(t.ToolName, t.Success, t.ErrorMessage)).ToList()
        )).ToList();

        var validations = run.ValidationResults.Select(v => new ValidationCheckResponse(v.RuleName, v.Passed, v.Details)).ToList();
        var approval = run.ApprovalDecisions.OrderByDescending(a => a.DecidedAt)
            .Select(a => new ApprovalDecisionResponse(a.Decision.ToString(), a.Comment, a.DecidedAt)).FirstOrDefault();

        return new ExecutionSummaryResponse(run.Id, run.Objective, run.Status.ToString(), run.StartedAt, run.CompletedAt,
            Duration(run.StartedAt, run.CompletedAt), steps, validations, approval, await AgentStoriesAsync(requestId, run, cancellationToken));
    }

    /// <summary>Plain-language, project-specific description of how each of the four agents built this roadmap.</summary>
    private async Task<IReadOnlyList<AgentStory>> AgentStoriesAsync(Guid requestId, AgentWorkflowRun run, CancellationToken ct)
    {
        var request = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
            .Include(r => r.Roadmaps).ThenInclude(r => r.Milestones).ThenInclude(m => m.Resources).ThenInclude(x => x.Resource)
            .FirstAsync(r => r.Id == requestId, ct);
        var intake = await ReadIntakeAsync(request, ct);
        var roadmap = request.Roadmaps.OrderByDescending(r => r.Version).FirstOrDefault();
        var ms = roadmap?.Milestones.OrderBy(m => m.OrderIndex).ToList() ?? [];
        var title = string.IsNullOrWhiteSpace(request.Title) ? "your project" : $"\"{request.Title}\"";
        string Status(AgentName a) => run.Steps.FirstOrDefault(s => s.AgentName == a)?.Status.ToString() ?? "Pending";
        var usedAi = run.Steps.SelectMany(s => s.ToolCalls).Any(t => t.ToolName == "llm_project_planner");
        var start = DateOnly.FromDateTime(run.StartedAt.UtcDateTime);
        var weeks = Math.Max(1, (intake.Deadline.DayNumber - start.DayNumber) / 7);
        var resources = ms.SelectMany(m => m.Resources.Select(r => (Milestone: m.Title, r.Resource.Title, r.Resource.IsFree))).ToList();
        var analysis = run.Steps.FirstOrDefault(s => s.AgentName == AgentName.AnalysisAgent)?.OutputPayload?.RootElement;
        bool Flag(string name) => analysis is { } a && a.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.True;
        var rules = run.ValidationResults.ToList();
        var names = new Dictionary<string, string> { ["required_phases"] = "all six phases are present", ["valid_dates"] = "every date is between today and the deadline", ["expected_shape"] = "the plan has six titled milestones" };

        return
        [
            new("Planner", "Planner", "Turns your answers into a dated, step-by-step plan.", Status(AgentName.Planner),
                ms.Count == 0 ? $"Planning {title} did not finish." :
                $"Planned {ms.Count} milestones for {title}, a year {intake.Year} {intake.ProjectType} project, over about {weeks} week{(weeks == 1 ? "" : "s")} until {intake.Deadline:d MMM yyyy}, sized to {intake.HoursPerWeek:0.#} hours a week" +
                $"{(intake.TeamSize is > 1 ? $" for a team of {intake.TeamSize}" : "")}. {(usedAi ? "The AI wrote titles and tasks specific to your idea" : "It used the standard project template because the AI was busy")}.",
                ms.Select(m => $"{m.Phase}: {m.Title} (due {m.DueDate:d MMM}{(m.EstimatedHours is > 0 ? $", about {m.EstimatedHours:0} h" : "")})").ToList()),
            new("ResourceAgent", "Resource Agent", "Picks learning resources from the library for each milestone.", Status(AgentName.ResourceAgent),
                resources.Count == 0 ? $"No resources were attached to {title}." :
                $"Attached {resources.Count} resources to {title}, matching each milestone's phase and the words in its title, and preferring free ones ({resources.Count(r => r.IsFree)} of {resources.Count} are free)" +
                $"{(string.IsNullOrWhiteSpace(intake.Technologies) ? "" : $". You said you know {intake.Technologies}, so the build tasks lean on those")}.",
                resources.GroupBy(r => r.Milestone).Select(g => $"{g.Key}: {string.Join(", ", g.Select(x => x.Title))}").ToList()),
            new("AnalysisAgent", "Analysis Agent", "Checks the plan is realistic for your deadline.", Status(AgentName.AnalysisAgent),
                $"Checked that {title} covers every phase from idea to deployment ({(Flag("coversAllPhases") ? "yes" : "no")}) and that the last milestone" +
                $"{(ms.Count > 0 ? $" ({ms[^1].DueDate:d MMM})" : "")} finishes before your deadline of {intake.Deadline:d MMM} ({(Flag("endsBeforeDeadline") ? "yes" : "no")}).",
                [Flag("coversAllPhases") ? "All phases covered: Title, Design, Build, Documentation, Presentation, Deployment" : "Some phases are missing",
                 Flag("endsBeforeDeadline") ? $"Finishes {(ms.Count > 0 ? intake.Deadline.DayNumber - ms[^1].DueDate.DayNumber : 0)} day(s) before the deadline" : "Runs past the deadline"]),
            new("ValidationAgent", "Validation Agent", "Runs strict pass/fail rules before you see the plan.", Status(AgentName.ValidationAgent),
                rules.Count == 0 ? "Validation did not run." : rules.All(r => r.Passed)
                    ? $"All {rules.Count} rules passed for {title}, so the plan was released for you to review."
                    : $"{rules.Count(r => !r.Passed)} rule(s) failed for {title}, so the plan was held back.",
                rules.Select(r => $"{(r.Passed ? "Passed" : "Failed")}: {names.GetValueOrDefault(r.RuleName, r.RuleName)}").ToList()),
        ];
    }

    private static int? Duration(DateTimeOffset? start, DateTimeOffset? end) =>
        start is not null && end is not null ? (int)(end.Value - start.Value).TotalMilliseconds : null;

    public async Task<IReadOnlyList<RoadmapRequest>> ListAsync(Guid studentId, CancellationToken cancellationToken) =>
        await db.RoadmapRequests.AsSplitQuery()
            .Include(x => x.Answers).ThenInclude(x => x.Question)
            .Include(x => x.Roadmaps).ThenInclude(x => x.Milestones)
            .Where(x => x.StudentId == studentId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

    // Rename a roadmap request (edit the project title).
    public async Task<bool> RenameAsync(Guid studentId, Guid requestId, string? title, CancellationToken cancellationToken, string? description = null)
    {
        var request = await db.RoadmapRequests.SingleOrDefaultAsync(r => r.Id == requestId && r.StudentId == studentId, cancellationToken);
        if (request is null) return false;
        request.Title = string.IsNullOrWhiteSpace(title) ? null : title.Trim();
        if (!string.IsNullOrWhiteSpace(description)) request.Description = description.Trim()[..Math.Min(2000, description.Trim().Length)];
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    // Delete a roadmap request and everything under it. Restrict-linked rows (approvals, roadmaps,
    // runs) are removed explicitly; the database cascades the rest (milestones, steps, answers…).
    public async Task<bool> DeleteAsync(Guid studentId, Guid requestId, CancellationToken cancellationToken)
    {
        var owned = await db.RoadmapRequests.AnyAsync(r => r.Id == requestId && r.StudentId == studentId, cancellationToken);
        if (!owned) return false;

        var runIds = db.AgentWorkflowRuns.Where(r => r.RoadmapRequestId == requestId).Select(r => r.Id);
        await db.ApprovalDecisions.Where(a => runIds.Contains(a.WorkflowRunId)).ExecuteDeleteAsync(cancellationToken);
        await db.Roadmaps.Where(r => r.RoadmapRequestId == requestId).ExecuteDeleteAsync(cancellationToken);
        await db.AgentWorkflowRuns.Where(r => r.RoadmapRequestId == requestId).ExecuteDeleteAsync(cancellationToken);
        await db.RoadmapRequests.Where(r => r.Id == requestId).ExecuteDeleteAsync(cancellationToken);
        return true;
    }

    // --- helpers ---

    private static void Validate(IntakeRequest intake)
    {
        if (intake.Deadline < DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2))
            throw new ArgumentException("Choose a deadline at least 2 days from today so the milestones fit before it.");
        if (intake.Year is < 1 or > 4 || string.IsNullOrWhiteSpace(intake.ProjectType) || intake.HoursPerWeek <= 0)
            throw new ArgumentException("Year, project type, and hours per week are invalid.");
    }

    private static RoadmapRequest NewRequest(Guid studentId, IntakeRequest intake) => new()
    {
        Id = Guid.NewGuid(), StudentId = studentId, Status = RoadmapRequestStatus.Planning, Title = intake.Title,
        Description = string.IsNullOrWhiteSpace(intake.Description) ? null : intake.Description.Trim()[..Math.Min(2000, intake.Description.Trim().Length)]
    };

    private static AgentWorkflowRun NewRun(Guid requestId) => new()
    {
        Id = Guid.NewGuid(), RoadmapRequestId = requestId, Objective = "Generate and validate a student project roadmap.",
        Status = WorkflowRunStatus.Running, StartedAt = DateTimeOffset.UtcNow
    };

    private static IEnumerable<QuestionAnswer> BuildAnswers(Guid requestId, IntakeRequest intake)
    {
        yield return Answer(requestId, QuestionIds["year_of_study"], intake.Year);
        yield return Answer(requestId, QuestionIds["project_type"], intake.ProjectType);
        yield return Answer(requestId, QuestionIds["deadline"], intake.Deadline);
        yield return Answer(requestId, QuestionIds["hours_per_week"], intake.HoursPerWeek);
        if (intake.TeamSize is > 0)
            yield return Answer(requestId, QuestionIds["team_size"], intake.TeamSize.Value);
        if (!string.IsNullOrWhiteSpace(intake.Technologies))
            yield return Answer(requestId, QuestionIds["technologies_known"], intake.Technologies.Trim());
        if (!string.IsNullOrWhiteSpace(intake.LeastConfident))
            yield return Answer(requestId, QuestionIds["least_confident"], intake.LeastConfident.Trim());
    }

    // Rebuild the intake from the stored answers so idea/plan steps use one source of truth.
    private async Task<IntakeRequest> ReadIntakeAsync(RoadmapRequest request, CancellationToken cancellationToken)
    {
        var answers = await db.QuestionAnswers.AsNoTracking()
            .Where(a => a.RoadmapRequestId == request.Id)
            .ToListAsync(cancellationToken);

        JsonElement? Val(string code) => answers.FirstOrDefault(a => a.QuestionId == QuestionIds[code])?.AnswerValue.RootElement;

        var year = Val("year_of_study")?.GetInt32() ?? 1;
        var projectType = Val("project_type")?.GetString() ?? "web";
        var deadlineRaw = Val("deadline")?.GetString();
        var deadline = DateOnly.TryParse(deadlineRaw, out var d) ? d : DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30);
        var hours = Val("hours_per_week")?.GetDecimal() ?? 8m;
        int? teamSize = Val("team_size") is { ValueKind: JsonValueKind.Number } ts ? ts.GetInt32() : null;
        var technologies = Val("technologies_known")?.GetString();
        var leastConfident = Val("least_confident")?.GetString();

        return new IntakeRequest(year, projectType, deadline, hours, request.Title, teamSize, technologies, leastConfident);
    }

    private static QuestionAnswer Answer<T>(Guid requestId, Guid questionId, T value) => new()
    {
        Id = Guid.NewGuid(), RoadmapRequestId = requestId, QuestionId = questionId,
        AnswerValue = JsonDocument.Parse(JsonSerializer.Serialize(value))
    };
}
