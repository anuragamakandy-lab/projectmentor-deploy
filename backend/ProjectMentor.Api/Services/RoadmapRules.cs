using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Deterministic roadmap rules shared by the Analysis and Validation agents — pure functions with
/// no database or LLM dependency, so they can be unit-tested as the agent-evaluation "golden case".
/// </summary>
public static class RoadmapRules
{
    /// <summary>Every required project phase is present in the plan.</summary>
    public static bool AllRequiredPhases(IReadOnlyList<PlannedMilestone> plan) =>
        Enum.GetValues<MilestonePhase>().All(phase => plan.Any(m => m.Phase == phase));

    /// <summary>Every milestone falls after today and before the deadline.</summary>
    public static bool DatesWithinWindow(IReadOnlyList<PlannedMilestone> plan, DateOnly today, DateOnly deadline) =>
        plan.All(m => m.DueDate > today && m.DueDate < deadline);

    /// <summary>The plan finishes before the deadline.</summary>
    public static bool EndsBeforeDeadline(IReadOnlyList<PlannedMilestone> plan, DateOnly deadline) =>
        plan.Count > 0 && plan[^1].DueDate < deadline;

    /// <summary>The plan has the expected structured shape: six phases, each with a title.</summary>
    public static bool HasExpectedShape(IReadOnlyList<PlannedMilestone> plan) =>
        plan.Count == 6 && plan.All(m => !string.IsNullOrWhiteSpace(m.Title));
}
