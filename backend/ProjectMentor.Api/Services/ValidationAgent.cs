using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

public sealed class ValidationAgent(ProjectMentorDbContext db)
{
    public async Task RunAsync(WorkflowContext context, CancellationToken cancellationToken)
    {
        var step = AgentSupport.StartStep(context.Run, AgentName.ValidationAgent, 4, new { milestoneCount = context.Plan.Count });
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rules = new[]
        {
            ("required_phases", RoadmapRules.AllRequiredPhases(context.Plan), "All required phases are present."),
            ("valid_dates", RoadmapRules.DatesWithinWindow(context.Plan, today, context.Intake.Deadline), "Milestone dates are within the intake window."),
            ("expected_shape", RoadmapRules.HasExpectedShape(context.Plan), "The plan has the expected structured shape.")
        };

        foreach (var rule in rules)
        {
            db.ValidationResults.Add(new ValidationResult
            {
                Id = Guid.NewGuid(), WorkflowRunId = context.Run.Id, RuleName = rule.Item1,
                Passed = rule.Item2, Details = rule.Item3, CheckedAt = DateTimeOffset.UtcNow
            });
            if (!rule.Item2) context.ValidationErrors.Add(rule.Item1);
        }

        context.ValidationPassed = rules.All(rule => rule.Item2) && context.AnalysisPassed;
        AgentSupport.AddToolCall(db, step, "deterministic_validator", new { rules = rules.Select(rule => rule.Item1) }, new { passed = context.ValidationPassed });
        AgentSupport.CompleteStep(db, step, new { passed = context.ValidationPassed, errors = context.ValidationErrors });
        await db.SaveChangesAsync(cancellationToken);
    }
}
