using ProjectMentor.Api.Services;
using ProjectMentor.Data;
using Xunit;

namespace ProjectMentor.Tests.AgentEvaluation;

/// <summary>
/// Agent-evaluation "golden case" — asserts the deterministic roadmap rules the Analysis and
/// Validation agents rely on. A well-formed 6-phase plan must pass; broken plans (missing a phase,
/// a date past the deadline, the wrong shape) must be rejected. No LLM or database involved.
/// </summary>
public class RoadmapGoldenCaseTests
{
    private static readonly DateOnly Today = new(2026, 1, 1);
    private static readonly DateOnly Deadline = new(2026, 3, 1);

    private static readonly MilestonePhase[] AllPhases =
        [MilestonePhase.Title, MilestonePhase.Design, MilestonePhase.Build, MilestonePhase.Documentation, MilestonePhase.Presentation, MilestonePhase.Deployment];

    private static List<PlannedMilestone> GoldenPlan() =>
        AllPhases.Select((phase, i) =>
            new PlannedMilestone(phase, $"{phase} milestone", "Concrete tasks.", Today.AddDays((i + 1) * 7), 8m)).ToList();

    [Fact]
    public void Golden_plan_passes_every_rule()
    {
        var plan = GoldenPlan();

        Assert.True(RoadmapRules.AllRequiredPhases(plan));
        Assert.True(RoadmapRules.DatesWithinWindow(plan, Today, Deadline));
        Assert.True(RoadmapRules.EndsBeforeDeadline(plan, Deadline));
        Assert.True(RoadmapRules.HasExpectedShape(plan));
    }

    [Fact]
    public void Missing_a_phase_fails_required_phases_and_shape()
    {
        var plan = GoldenPlan();
        plan.RemoveAt(plan.Count - 1); // drop Deployment

        Assert.False(RoadmapRules.AllRequiredPhases(plan));
        Assert.False(RoadmapRules.HasExpectedShape(plan)); // only 5 milestones
    }

    [Fact]
    public void A_milestone_past_the_deadline_fails_date_checks()
    {
        var plan = GoldenPlan();
        plan[^1] = plan[^1] with { DueDate = Deadline.AddDays(10) };

        Assert.False(RoadmapRules.DatesWithinWindow(plan, Today, Deadline));
        Assert.False(RoadmapRules.EndsBeforeDeadline(plan, Deadline));
    }

    [Fact]
    public void A_blank_title_fails_expected_shape()
    {
        var plan = GoldenPlan();
        plan[0] = plan[0] with { Title = "  " };

        Assert.False(RoadmapRules.HasExpectedShape(plan));
    }
}
