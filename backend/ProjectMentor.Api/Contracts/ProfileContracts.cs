namespace ProjectMentor.Api.Contracts;

public sealed record NotificationItem(Guid Id, string Kind, string Title, string? Body, string? Link, bool IsRead, DateTimeOffset CreatedAt,
    string Scope = "System", Guid? ActorId = null, Guid? ActorAvatarId = null, string? ActorInitials = null);

/// <summary>Unread = unread in the requested scope; the other two let the navbar say "You have N community notifications".</summary>
public sealed record NotificationsResponse(IReadOnlyList<NotificationItem> Items, int Unread, int SystemUnread = 0, int CommunityUnread = 0);

public sealed record UsageStats(
    int Roadmaps, int Milestones, int MilestonesDone, int ProgressPercent,
    int Vivas, int VivasCompleted, int? AverageVivaScore,
    int Posts, int Comments, int ReactionsReceived, int Groups, int TasksDone, int Messages);

public sealed record RoadmapProgress(Guid RoadmapRequestId, string Title, int Done, int Total, int Overdue = 0);

public sealed record ActivityItem(string Kind, string Text, string? Link, DateTimeOffset At);

public sealed record UsageResponse(UsageStats Stats, int Score, string? SuggestedBadge, IReadOnlyList<RoadmapProgress> Progress, IReadOnlyList<ActivityItem> Activity);

public sealed record ProfileResponse(
    Guid Id, string FullName, string Email, string Role, short? YearOfStudy, string? Bio, Guid? AvatarId, string? Badge,
    bool HasPassword, bool GoogleLinked, DateTimeOffset CreatedAt, UsageResponse Usage);

public sealed record UpdateProfileRequest(string FullName, short? YearOfStudy, string? Bio);

public sealed record DeleteAccountRequest(string? Password, string? ConfirmEmail);

public sealed record AdminUserDetailResponse(AdminUserResponse User, string? Bio, Guid? AvatarId, string? Badge, DateTimeOffset? LastActiveAt, UsageResponse Usage);

public sealed record SetBadgeRequest(string? Badge);

public sealed record AdminSearchHit(string Kind, Guid Id, string Title, string? Subtitle, string Link);

public sealed record GoogleSignInRequest(string IdToken);

public sealed record AuthConfigResponse(string? GoogleClientId);
