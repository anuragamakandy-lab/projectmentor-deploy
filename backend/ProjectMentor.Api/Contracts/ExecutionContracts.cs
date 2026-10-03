namespace ProjectMentor.Api.Contracts;

// Read-only view of a completed/failed agent workflow run — powers the "AI Workflow" page
// so the four agents, their tool calls, validation results and the approval gate are all visible.

public sealed record ExecutionSummaryResponse(
    Guid RunId,
    string Objective,
    string Status,
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt,
    int? TotalDurationMs,
    IReadOnlyList<AgentStepResponse> Steps,
    IReadOnlyList<ValidationCheckResponse> Validations,
    ApprovalDecisionResponse? Approval,
    IReadOnlyList<AgentStory>? Agents = null);

/// <summary>What one agent did for THIS project, in plain words (shown on the website and in the app).</summary>
public sealed record AgentStory(string Agent, string Title, string Role, string Status, string Summary, IReadOnlyList<string> Details);

public sealed record AgentStepResponse(
    string Agent,
    int Order,
    string Status,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    int? DurationMs,
    string? Output,
    IReadOnlyList<ToolCallResponse> ToolCalls);

public sealed record ToolCallResponse(string Tool, bool Success, string? Error);

public sealed record ValidationCheckResponse(string Rule, bool Passed, string? Details);

public sealed record ApprovalDecisionResponse(string Decision, string? Comment, DateTimeOffset DecidedAt);
