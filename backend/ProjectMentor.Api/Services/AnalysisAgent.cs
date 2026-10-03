using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

public sealed class AnalysisAgent(ProjectMentorDbContext db)
{
    public async Task RunAsync(WorkflowContext context, CancellationToken cancellationToken)
    {
        var step = AgentSupport.StartStep(context.Run, AgentName.AnalysisAgent, 3, new { milestoneCount = context.Plan.Count });
        var coversAllPhases = RoadmapRules.AllRequiredPhases(context.Plan);
        var endsBeforeDeadline = RoadmapRules.EndsBeforeDeadline(context.Plan, context.Intake.Deadline);
        context.AnalysisPassed = coversAllPhases && endsBeforeDeadline;
        AgentSupport.AddToolCall(db, step, "roadmap_rule_checker", new { context.Intake.Deadline }, new { coversAllPhases, endsBeforeDeadline });
        AgentSupport.CompleteStep(db, step, new { passed = context.AnalysisPassed, coversAllPhases, endsBeforeDeadline });
        await db.SaveChangesAsync(cancellationToken);
    }
}
