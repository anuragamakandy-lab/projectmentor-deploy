using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Api.Services.Ai;

namespace ProjectMentor.Api.Controllers;

/// <summary>AI Mock Viva — practise a project viva with the Viva Examiner agent.</summary>
[ApiController]
[Authorize(Roles = "Student")]
[Route("api/viva")]
public sealed class VivaController(VivaService viva, ProjectInsightService insights, ProjectMentor.Data.ProjectMentorDbContext db) : ControllerBase
{
    /// <summary>Examiner characters published by admins.</summary>
    [HttpGet("characters")]
    public async Task<ActionResult<IReadOnlyList<VivaCharacterView>>> Characters(CancellationToken ct) => Ok(await viva.CharactersAsync(false, ct));

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<VivaSessionListItem>>> List(CancellationToken ct) =>
        Ok(await viva.ListAsync(User.GetUserId(), ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<VivaSessionResponse>> Get(Guid id, CancellationToken ct)
    {
        var session = await viva.GetAsync(User.GetUserId(), id, ct);
        return session is null ? NotFound() : Ok(session);
    }

    // Pre-fill the project-details form from one of the student's roadmaps.
    [HttpGet("prefill/{roadmapRequestId:guid}")]
    public async Task<ActionResult<VivaDetails>> Prefill(Guid roadmapRequestId, CancellationToken ct)
    {
        // Only approved (accepted) roadmaps can pre-fill a viva.
        if (!db.Roadmaps.Any(r => r.RoadmapRequestId == roadmapRequestId && r.StudentId == User.GetUserId() && r.Status == ProjectMentor.Data.RoadmapStatus.Accepted))
            return NotFound("Only approved roadmaps can be used for a mock viva.");
        var details = await insights.VivaPrefillAsync(User.GetUserId(), roadmapRequestId, ct) ?? await viva.PrefillAsync(User.GetUserId(), roadmapRequestId, ct);
        return details is null ? NotFound() : Ok(details);
    }

    [HttpPost]
    public async Task<ActionResult<VivaSessionResponse>> Start(StartVivaRequest body, CancellationToken ct)
    {
        try { return Ok(await viva.StartAsync(User.GetUserId(), body, ct)); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("{id:guid}/answer")]
    public async Task<ActionResult<VivaSessionResponse>> Answer(Guid id, VivaAnswerRequest body, CancellationToken ct)
    {
        try
        {
            var session = await viva.AnswerAsync(User.GetUserId(), id, body, ct);
            return session is null ? NotFound() : Ok(session);
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (InvalidOperationException ex) { return Conflict(ex.Message); }
        catch (AiUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, ex.Message); }
    }

    [HttpPost("{id:guid}/finish")]
    public async Task<ActionResult<VivaSessionResponse>> Finish(Guid id, CancellationToken ct)
    {
        var session = await viva.FinishAsync(User.GetUserId(), id, ct);
        return session is null ? NotFound() : Ok(session);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct) =>
        await viva.DeleteAsync(User.GetUserId(), id, ct) ? NoContent() : NotFound();
}
