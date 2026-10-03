using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;

namespace ProjectMentor.Api.Controllers;

[ApiController]
[Authorize(Roles = "Student")]
[Route("api/roadmap-requests")]
public sealed class RoadmapRequestsController(WorkflowService workflow, ReportService reports, ChatService chat, ProjectInsightService insights,
    ProjectMentor.Data.ProjectMentorDbContext db) : ControllerBase
{
    // Mentor chat — full state for the chat page: messages, project card and suggested questions.
    // The first visit creates the welcome message with the project summary.
    [HttpGet("{id:guid}/assistant")]
    public async Task<ActionResult<ChatResponse>> Assistant(Guid id, CancellationToken cancellationToken) =>
        await chat.OpenAsync(User.GetUserId(), id, cancellationToken) is { } r ? Ok(r) : NotFound();

    // Summary shown after the roadmap is accepted (created on accept; rebuilt here if missing).
    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<ProjectMentor.Api.Services.RoadmapSummary>> Summary(Guid id, [FromQuery] bool refresh, CancellationToken cancellationToken)
    {
        var roadmap = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
            db.Roadmaps.Where(r => r.RoadmapRequestId == id && r.StudentId == User.GetUserId() && r.Status == ProjectMentor.Data.RoadmapStatus.Accepted), cancellationToken);
        if (roadmap is null) return NotFound();
        if (roadmap.SummaryJson is { } saved && !refresh)
            return Ok(System.Text.Json.JsonSerializer.Deserialize<ProjectMentor.Api.Services.RoadmapSummary>(saved, RoadmapMapper.Json));
        var summary = await insights.BuildSummaryAsync(User.GetUserId(), id, cancellationToken);
        if (summary is null) return NotFound();
        if (!summary.IsFallback)
        {
            roadmap.SummaryJson = System.Text.Json.JsonSerializer.Serialize(summary, RoadmapMapper.Json);
            await db.SaveChangesAsync(cancellationToken);
        }
        return Ok(summary);
    }

    // Mentor chat — read the saved transcript.
    [HttpGet("{id:guid}/chat")]
    public async Task<ActionResult<IReadOnlyList<ChatMessage>>> ChatHistory(Guid id, CancellationToken cancellationToken)
    {
        var history = await chat.GetHistoryAsync(User.GetUserId(), id, cancellationToken);
        return history is null ? NotFound() : Ok(history);
    }

    // Mentor chat — send a message (or kick off), persist it, get the mentor's reply.
    [HttpPost("{id:guid}/chat")]
    public async Task<ActionResult<ChatResponse>> Chat(Guid id, ChatRequest body, CancellationToken cancellationToken)
    {
        try
        {
            var reply = await chat.SendAsync(User.GetUserId(), id, body?.Message, cancellationToken);
            return reply is null ? NotFound() : Ok(reply);
        }
        catch (ProjectMentor.Api.Services.Ai.AiUnavailableException exception)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, exception.Message);
        }
    }

    // Download a detailed Markdown report for an accepted roadmap.
    [HttpGet("{id:guid}/report")]
    public async Task<IActionResult> Report(Guid id, CancellationToken cancellationToken)
    {
        var report = await reports.BuildAsync(User.GetUserId(), id, cancellationToken);
        if (report is null) return NotFound();
        return File(report.Value.Pdf, "application/pdf", report.Value.FileName);
    }

    [HttpPost]
    public async Task<ActionResult<CreateRoadmapRequestResponse>> Create(IntakeRequest intake, CancellationToken cancellationToken)
    {
        try
        {
            var request = await workflow.CreateAsync(User.GetUserId(), intake, cancellationToken);
            var roadmap = request.Roadmaps.SingleOrDefault();
            return Ok(new CreateRoadmapRequestResponse(request.Id, request.Status.ToString(), roadmap?.Id));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return UnprocessableEntity(exception.Message);
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RoadmapResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var request = await workflow.GetAsync(User.GetUserId(), id, cancellationToken);
        if (request is null) return NotFound();
        var roadmap = request.Roadmaps.OrderByDescending(x => x.Version).FirstOrDefault();
        return Ok(roadmap is null
            ? new RoadmapResponse(Guid.Empty, "None", request.Status.ToString(), [], request.Title)
            : RoadmapMapper.Map(request, roadmap));
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<RoadmapRequestSummary>>> List(CancellationToken cancellationToken)
    {
        var requests = await workflow.ListAsync(User.GetUserId(), cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var summaries = requests.Select(r =>
        {
            var projectType = r.Answers.FirstOrDefault(a => a.Question.Code == "project_type")?.AnswerValue.RootElement.GetString() ?? "";
            var deadline = r.Answers.FirstOrDefault(a => a.Question.Code == "deadline")?.AnswerValue.RootElement.GetString() ?? "";
            var displayTitle = !string.IsNullOrWhiteSpace(r.Title)
                ? r.Title
                : $"{projectType} project — due {deadline}";

            var roadmap = r.Roadmaps.OrderByDescending(x => x.Version).FirstOrDefault();
            var milestones = roadmap?.Milestones ?? [];
            var total = milestones.Count;
            var done = milestones.Count(m => m.Status == ProjectMentor.Data.MilestoneStatus.Done);
            var overdue = milestones.Count(m => m.Status != ProjectMentor.Data.MilestoneStatus.Done && m.DueDate < today);
            var percent = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total);

            return new RoadmapRequestSummary(
                r.Id, displayTitle, r.Status.ToString(), projectType,
                DateOnly.TryParse(deadline, out var d) ? d : DateOnly.MinValue, r.CreatedAt,
                roadmap?.Status.ToString() ?? "None", total, done, percent, overdue);
        }).ToList();
        return Ok(summaries);
    }

    // Path A step 1 — create a draft (no planning yet) so ideas can be suggested first.
    [HttpPost("draft")]
    public async Task<ActionResult<CreateRoadmapRequestResponse>> Draft(IntakeRequest intake, CancellationToken cancellationToken)
    {
        try
        {
            var request = await workflow.DraftCreateAsync(User.GetUserId(), intake, cancellationToken);
            return Ok(new CreateRoadmapRequestResponse(request.Id, request.Status.ToString(), null));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    // Path A step 2 — ask the Idea agent for suggestions (or a reshuffle via Exclude).
    [HttpPost("{id:guid}/ideas")]
    public async Task<ActionResult<SuggestIdeasResponse>> Ideas(Guid id, SuggestIdeasRequest body, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await workflow.SuggestIdeasAsync(User.GetUserId(), id, body?.Exclude ?? [], cancellationToken));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ProjectMentor.Api.Services.Ai.AiUnavailableException exception)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, exception.Message);
        }
    }

    // Path A step 3 (and Path B) — lock in a chosen idea and run the planning workflow.
    [HttpPost("{id:guid}/plan")]
    public async Task<ActionResult<CreateRoadmapRequestResponse>> Plan(Guid id, ChooseIdeaRequest? body, CancellationToken cancellationToken)
    {
        try
        {
            var request = await workflow.PlanAsync(User.GetUserId(), id, body, cancellationToken);
            var roadmap = request.Roadmaps.SingleOrDefault();
            return Ok(new CreateRoadmapRequestResponse(request.Id, request.Status.ToString(), roadmap?.Id));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return UnprocessableEntity(exception.Message);
        }
    }

    [HttpPut("{id:guid}/title")]
    public async Task<IActionResult> Rename(Guid id, RenameRequest body, CancellationToken cancellationToken)
        => await workflow.RenameAsync(User.GetUserId(), id, body?.Title, cancellationToken, body?.Description) ? NoContent() : NotFound();

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
        => await workflow.DeleteAsync(User.GetUserId(), id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("{id:guid}/execution")]
    public async Task<ActionResult<ExecutionSummaryResponse>> Execution(Guid id, CancellationToken cancellationToken)
    {
        var summary = await workflow.GetExecutionAsync(User.GetUserId(), id, cancellationToken);
        return summary is null ? NotFound() : Ok(summary);
    }

    [HttpGet("current")]
    public async Task<ActionResult<RoadmapResponse>> GetCurrent(CancellationToken cancellationToken)
    {
        var request = await workflow.GetLatestAsync(User.GetUserId(), cancellationToken);
        if (request is null) return NoContent();
        var roadmap = request.Roadmaps.OrderByDescending(x => x.Version).FirstOrDefault();
        return Ok(roadmap is null
            ? new RoadmapResponse(Guid.Empty, "None", request.Status.ToString(), [], request.Title)
            : RoadmapMapper.Map(request, roadmap));
    }
}

internal static class RoadmapMapper
{
    public static readonly System.Text.Json.JsonSerializerOptions Json = new() { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

    public static bool IsOverdue(ProjectMentor.Data.Milestone m) =>
        m.Status != ProjectMentor.Data.MilestoneStatus.Done && m.DueDate < DateOnly.FromDateTime(DateTime.Now);

    public static MilestoneResponse Milestone(ProjectMentor.Data.Milestone m) =>
        new(m.Id, m.Phase.ToString(), m.Title, m.Description, m.DueDate, m.Status.ToString(),
            m.Resources.Select(link => new ResourceResponse(link.Resource.Id, link.Resource.Title, link.Resource.Url, link.Resource.Topic)).ToList(),
            IsOverdue(m), m.EstimatedHours);

    public static RoadmapResponse Map(ProjectMentor.Data.RoadmapRequest request, ProjectMentor.Data.Roadmap roadmap) =>
        new(roadmap.Id, roadmap.Status.ToString(), request.Status.ToString(), roadmap.Milestones.OrderBy(x => x.OrderIndex).Select(Milestone).ToList(),
            request.Title,
            roadmap.SummaryJson is { } s ? System.Text.Json.JsonSerializer.Deserialize<ProjectMentor.Api.Services.RoadmapSummary>(s, Json) : null,
            request.Description, roadmap.AcceptedAt);
}
