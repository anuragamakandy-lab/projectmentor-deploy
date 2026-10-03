using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

[ApiController]
[Authorize(Roles = "Student")]
[Route("api/roadmaps")]
public sealed class RoadmapsController(ProjectMentorDbContext db, ProjectInsightService insights) : ControllerBase
{
    [HttpPost("{id:guid}/accept")]
    public async Task<ActionResult<RoadmapResponse>> Accept(Guid id, ApprovalRequest request, CancellationToken cancellationToken)
    {
        var roadmap = await LoadOwnedRoadmap(id, cancellationToken);
        if (roadmap is null) return NotFound();
        if (roadmap.Status != RoadmapStatus.PendingApproval) return Conflict("This roadmap is not awaiting approval.");

        var run = await db.AgentWorkflowRuns.Where(x => x.RoadmapRequestId == roadmap.RoadmapRequestId).OrderByDescending(x => x.StartedAt).FirstAsync(cancellationToken);
        roadmap.Status = RoadmapStatus.Accepted;
        roadmap.AcceptedAt = DateTimeOffset.UtcNow;
        roadmap.RoadmapRequest.Status = RoadmapRequestStatus.Accepted;
        run.Status = WorkflowRunStatus.Completed;
        db.ApprovalDecisions.Add(new ApprovalDecision { Id = Guid.NewGuid(), WorkflowRunId = run.Id, StudentId = roadmap.StudentId, Decision = ApprovalDecisionType.Accepted, Comment = request.Comment, DecidedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(cancellationToken);
        // The summary the student reads right after accepting (and at the top of the roadmap afterwards).
        var summary = await insights.BuildSummaryAsync(roadmap.StudentId, roadmap.RoadmapRequestId, cancellationToken);
        if (summary is { IsFallback: false })
        {
            roadmap.SummaryJson = System.Text.Json.JsonSerializer.Serialize(summary, RoadmapMapper.Json);
            await db.SaveChangesAsync(cancellationToken);
        }
        return Ok(RoadmapMapper.Map(roadmap.RoadmapRequest, roadmap));
    }

    [HttpPost("{id:guid}/request-revision")]
    public async Task<ActionResult<RoadmapResponse>> RequestRevision(Guid id, ApprovalRequest request, CancellationToken cancellationToken)
    {
        var roadmap = await LoadOwnedRoadmap(id, cancellationToken);
        if (roadmap is null) return NotFound();
        if (roadmap.Status != RoadmapStatus.PendingApproval) return Conflict("This roadmap is not awaiting approval.");

        var run = await db.AgentWorkflowRuns.Where(x => x.RoadmapRequestId == roadmap.RoadmapRequestId).OrderByDescending(x => x.StartedAt).FirstAsync(cancellationToken);
        roadmap.Status = RoadmapStatus.Draft;
        roadmap.RoadmapRequest.Status = RoadmapRequestStatus.RevisionRequested;
        db.ApprovalDecisions.Add(new ApprovalDecision { Id = Guid.NewGuid(), WorkflowRunId = run.Id, StudentId = roadmap.StudentId, Decision = ApprovalDecisionType.RevisionRequested, Comment = request.Comment, DecidedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(RoadmapMapper.Map(roadmap.RoadmapRequest, roadmap));
    }

    // Progress tracking — move a milestone through NotStarted → InProgress → Blocked → Done.
    [HttpPut("milestones/{milestoneId:guid}/status")]
    public async Task<ActionResult<MilestoneResponse>> UpdateMilestoneStatus(Guid milestoneId, MilestoneStatusUpdateRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<MilestoneStatus>(request.Status, ignoreCase: true, out var newStatus))
            return BadRequest($"Invalid status. Use one of: {string.Join(", ", Enum.GetNames<MilestoneStatus>())}.");

        var milestone = await db.Milestones
            .Include(m => m.Roadmap)
            .Include(m => m.Resources).ThenInclude(r => r.Resource)
            .SingleOrDefaultAsync(m => m.Id == milestoneId && m.Roadmap.StudentId == User.GetUserId(), cancellationToken);
        if (milestone is null) return NotFound();
        if (milestone.Roadmap.Status != RoadmapStatus.Accepted)
            return Conflict("You can only update milestones on an accepted roadmap.");

        if (milestone.Status != newStatus)
        {
            db.MilestoneStatusHistory.Add(new MilestoneStatusHistory
            {
                Id = Guid.NewGuid(), MilestoneId = milestone.Id, OldStatus = milestone.Status,
                NewStatus = newStatus, ChangedById = User.GetUserId(), ChangedAt = DateTimeOffset.UtcNow
            });
            milestone.Status = newStatus;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Ok(RoadmapMapper.Milestone(milestone));
    }

    private async Task<Roadmap?> LoadOwnedRoadmap(Guid id, CancellationToken cancellationToken) =>
        await db.Roadmaps.AsSplitQuery().Include(x => x.RoadmapRequest).Include(x => x.Milestones).ThenInclude(x => x.Resources).ThenInclude(x => x.Resource)
            .SingleOrDefaultAsync(x => x.Id == id && x.StudentId == User.GetUserId(), cancellationToken);
}
