using System.Text.Json;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

public sealed class WorkflowContext
{
    public required AgentWorkflowRun Run { get; init; }
    public required RoadmapRequest Request { get; init; }
    public required IntakeRequest Intake { get; init; }
    /// <summary>Summary of the chosen idea (Path A), so the Planner can personalise the roadmap.</summary>
    public string? IdeaSummary { get; set; }
    public List<PlannedMilestone> Plan { get; } = [];
    public Roadmap? Roadmap { get; set; }
    public bool AnalysisPassed { get; set; }
    public bool ValidationPassed { get; set; }
    public List<string> ValidationErrors { get; } = [];
}

public sealed record PlannedMilestone(MilestonePhase Phase, string Title, string Description, DateOnly DueDate, decimal EstimatedHours);

internal static class AgentSupport
{
    public static JsonDocument Json<T>(T value) => JsonDocument.Parse(JsonSerializer.Serialize(value));

    public static AgentStep StartStep(AgentWorkflowRun run, AgentName agent, int order, object input)
    {
        return new AgentStep
        {
            Id = Guid.NewGuid(), WorkflowRunId = run.Id, AgentName = agent, StepOrder = order,
            InputPayload = Json(input), Status = AgentStepStatus.Running, StartedAt = DateTimeOffset.UtcNow
        };
    }

    public static void CompleteStep(ProjectMentorDbContext db, AgentStep step, object output)
    {
        step.OutputPayload = Json(output);
        step.Status = AgentStepStatus.Success;
        step.CompletedAt = DateTimeOffset.UtcNow;
        db.AgentSteps.Add(step);
    }

    public static void AddToolCall(ProjectMentorDbContext db, AgentStep step, string name, object input, object output)
    {
        db.ToolCalls.Add(new ToolCall
        {
            Id = Guid.NewGuid(), AgentStepId = step.Id, ToolName = name, InputParams = Json(input),
            OutputResult = Json(output), Success = true, CalledAt = DateTimeOffset.UtcNow
        });
    }
}
