namespace ProjectMentor.Api.Contracts;

public sealed record IntakeRequest(
    int Year, string ProjectType, DateOnly Deadline, decimal HoursPerWeek, string? Title = null,
    int? TeamSize = null, string? Technologies = null, string? LeastConfident = null, string? Description = null);
public sealed record CreateRoadmapRequestResponse(Guid RoadmapRequestId, string Status, Guid? RoadmapId);
public sealed record RoadmapResponse(Guid Id, string Status, string RequestStatus, IReadOnlyList<MilestoneResponse> Milestones, string? Title = null,
    ProjectMentor.Api.Services.RoadmapSummary? Summary = null, string? Description = null, DateTimeOffset? AcceptedAt = null);
public sealed record MilestoneResponse(Guid Id, string Phase, string Title, string? Description, DateOnly DueDate, string Status, IReadOnlyList<ResourceResponse> Resources,
    bool IsOverdue = false, decimal? EstimatedHours = null);
public sealed record ResourceResponse(Guid Id, string Title, string Url, string Topic);
public sealed record ApprovalRequest(string? Comment);
public sealed record RoadmapRequestSummary(
    Guid Id, string DisplayTitle, string RequestStatus, string ProjectType, DateOnly Deadline, DateTimeOffset CreatedAt,
    string RoadmapStatus, int MilestoneCount, int DoneCount, int ProgressPercent, int OverdueCount);

// --- Progress tracking ---
public sealed record MilestoneStatusUpdateRequest(string Status);

// --- Edit / delete ---
public sealed record RenameRequest(string? Title, string? Description = null);

// --- Mentor chat (refines the idea before planning; persisted per roadmap) ---
public sealed record ChatMessage(string Role, string Content);
public sealed record ChatRequest(string? Message);
public sealed record ChatResponse(string Reply, bool Ready, IReadOnlyList<ChatMessage> Messages,
    IReadOnlyList<string>? Suggestions = null, ChatSummary? Project = null);
/// <summary>The project card shown beside the chat.</summary>
public sealed record ChatSummary(string Title, string? Description, string ProjectType, DateOnly Deadline, decimal HoursPerWeek, int? TeamSize,
    string? Technologies, string Status, int Milestones, int Done, int Overdue, string? NextMilestone, DateOnly? NextDue);

// --- Idea-suggestion flow (Path A: student needs ideas) ---
public sealed record ProjectIdea(string Title, string Summary, string WhyItFits, IReadOnlyList<string> TechStack, string Difficulty);
public sealed record SuggestIdeasRequest(IReadOnlyList<string>? Exclude);
public sealed record SuggestIdeasResponse(bool Available, IReadOnlyList<ProjectIdea> Ideas, string? Message);
public sealed record ChooseIdeaRequest(string Title, string? Summary);
