namespace ProjectMentor.Api.Contracts;

// ---------- Groups ----------
public sealed record CreateGroupRequest(string Name, string? Description = null, Guid? RoadmapRequestId = null);
public sealed record UpdateGroupRequest(string? Name = null, string? Description = null, Guid? RoadmapRequestId = null, bool ClearRoadmap = false);

public sealed record GroupSummary(
    Guid Id, string Name, string? Description, string Color, string MyRole, int MemberCount,
    IReadOnlyList<string> MemberInitials, string? RoadmapTitle, int OpenTasks, int DoneTasks,
    DateTimeOffset? LastMessageAt, string? LastMessagePreview, DateTimeOffset CreatedAt);

public sealed record GroupMemberResponse(Guid UserId, string FullName, string Initials, string Role, DateTimeOffset JoinedAt);

public sealed record MilestoneLite(Guid Id, string Title, string? Description, string Phase, DateOnly DueDate, string Status);

public sealed record GroupDetail(
    Guid Id, string Name, string? Description, string Color, Guid OwnerId, string MyRole,
    Guid? RoadmapRequestId, string? RoadmapTitle, decimal? HoursPerWeek, DateOnly? Deadline,
    IReadOnlyList<GroupMemberResponse> Members, IReadOnlyList<MilestoneLite> Milestones, DateTimeOffset CreatedAt);

// ---------- Invitations ----------
public sealed record CreateInviteRequest(int? ExpiresInDays = 7, int? MaxUses = null);
public sealed record InviteResponse(Guid Id, string Token, DateTimeOffset ExpiresAt, int? MaxUses, int Uses, bool Active);
public sealed record InvitePreview(bool Valid, string? Reason, Guid? GroupId, string? GroupName, string? Description,
    string? Color, string? OwnerName, int MemberCount, bool AlreadyMember);

// ---------- Chat ----------
public sealed record SendMessageRequest(string? Content, Guid? UploadId = null);
public sealed record MessageResponse(Guid Id, Guid? SenderId, string? SenderName, string? SenderInitials, string Content,
    UploadInfo? Upload, DateTimeOffset CreatedAt, bool IsSystem);

// ---------- Sprint board ----------
public sealed record TaskResponse(
    Guid Id, Guid? MilestoneId, string? MilestoneTitle, string? MilestonePhase, string Title, string? Description, string Status,
    Guid? AssigneeId, string? AssigneeName, string? AssigneeInitials, decimal? EstimateHours, DateOnly? WeekStart,
    int SortOrder, string Source, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, string? CompletedByName);

public sealed record CreateTaskRequest(string Title, string? Description = null, Guid? MilestoneId = null, Guid? AssigneeId = null,
    decimal? EstimateHours = null, DateOnly? WeekStart = null, string? Status = null);

/// <summary>Partial update. Null = leave unchanged. ClearAssignee / ClearWeek / ClearMilestone remove the value.</summary>
public sealed record UpdateTaskRequest(string? Title = null, string? Description = null, string? Status = null,
    Guid? AssigneeId = null, bool ClearAssignee = false, decimal? EstimateHours = null, DateOnly? WeekStart = null,
    bool ClearWeek = false, Guid? MilestoneId = null, bool ClearMilestone = false, int? SortOrder = null);

public sealed record GenerateTasksRequest(Guid? MilestoneId = null, bool AssignEvenly = true);
public sealed record GenerateTasksResponse(int Created, string Source, IReadOnlyList<string> SkippedMilestones, BoardResponse Board, int Reassigned = 0);

public sealed record MilestoneProgress(Guid Id, string Title, string Phase, DateOnly DueDate, string Status, int Tasks, int TasksDone);

public sealed record ContributionRow(Guid UserId, string FullName, string Initials, int TasksAssigned, int TasksDone,
    decimal HoursDone, int Messages, int SharePercent);

public sealed record BoardResponse(
    IReadOnlyList<TaskResponse> Tasks, IReadOnlyList<MilestoneProgress> Milestones, IReadOnlyList<GroupMemberResponse> Members,
    DateOnly CurrentWeekStart, decimal? WeeklyCapacityHours, IReadOnlyList<ContributionRow> Contributions);

// ---------- Uploads ----------
public sealed record UploadInfo(Guid Id, string FileName, string ContentType, long Size);

// ---------- Community ----------
public sealed record CreatePostRequest(string? Content, string? Kind = null, string? ProjectTitle = null,
    IReadOnlyList<Guid>? UploadIds = null, Guid? GroupId = null, string? Visibility = null);
public sealed record CreateCommentRequest(string? Content, Guid? ParentId = null);

public sealed record CommentResponse(Guid Id, Guid AuthorId, string AuthorName, string AuthorInitials, Guid? AuthorAvatarId, string? AuthorBadge,
    string Content, DateTimeOffset CreatedAt, bool CanDelete,
    Guid? ParentId = null, bool CanEdit = false, DateTimeOffset? EditedAt = null,
    IReadOnlyDictionary<string, int>? Reactions = null, int ReactionTotal = 0, string? MyReaction = null, bool AuthorIsOfficial = false);

public sealed record PostResponse(
    Guid Id, Guid AuthorId, string AuthorName, string AuthorInitials, Guid? AuthorAvatarId, string? AuthorBadge, string? GroupName,
    string Kind, string? ProjectTitle, string Content, IReadOnlyList<UploadInfo> Attachments,
    int LikeCount, bool LikedByMe, IReadOnlyDictionary<string, int> Reactions, string? MyReaction, int CommentCount,
    IReadOnlyList<CommentResponse> RecentComments, DateTimeOffset CreatedAt, bool CanDelete,
    string Status, string? ModerationNote,
    bool AuthorIsOfficial = false, string Visibility = "Public", bool CanEdit = false, DateTimeOffset? EditedAt = null,
    int ShareCount = 0, PostResponse? SharedPost = null, bool SharedPostUnavailable = false);

public sealed record ReactRequest(string? Reaction);

public sealed record ReactionResult(IReadOnlyDictionary<string, int> Reactions, int Total, string? MyReaction);

public sealed record FeedResponse(IReadOnlyList<PostResponse> Posts, DateTimeOffset? NextBefore);
