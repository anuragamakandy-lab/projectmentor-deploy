using System.Text.Json;

namespace ProjectMentor.Api.Contracts;

// ---------- public Learn payload (same shape the web and mobile clients already render) ----------

public sealed record LearnVideoView(string Title, string Channel, string? Duration);

public sealed record LearnLessonView(string Id, string Title, string? Lead, JsonElement Blocks);

public sealed record LearnTrackView(string Key, string Label, string Intro, IReadOnlyList<LearnLessonView> Lessons);

public sealed record TemplateView(Guid Id, string File, string Name, string? Format, string? Category, string? When,
    IReadOnlyList<string> Inside, string? SaveAs, long Size, string Url);

public sealed record DownloadView(Guid Id, string File, string Name, string? Type, string? Text, long Size, string Url);

public sealed record LearnContentResponse(
    IReadOnlyDictionary<string, LearnVideoView> Videos,
    IReadOnlyDictionary<string, LearnTrackView> Tracks,
    IReadOnlyList<string> TemplateCategories,
    IReadOnlyList<TemplateView> Templates,
    IReadOnlyList<DownloadView> Downloads,
    DateTimeOffset UpdatedAt);

// ---------- admin ----------

public sealed record AdminStatsResponse(
    int Students, int Admins, int InactiveUsers, int Roadmaps, int Groups, int Posts, int Vivas,
    int Resources, int Videos, int Lessons, int Templates, int Examples, int PendingPosts, int SiteEntries,
    IReadOnlyList<AdminUserResponse> NewestUsers);

public sealed record AdminUserResponse(Guid Id, string FullName, string Email, string Role, short? YearOfStudy, bool IsActive,
    DateTimeOffset CreatedAt, int Roadmaps, int Posts, string? Badge = null, Guid? AvatarId = null, DateTimeOffset? LastActiveAt = null);

public sealed record UpdateUserRequest(bool? IsActive, string? Role, string? FullName = null, short? YearOfStudy = null, bool ClearYear = false, string? Reason = null);

public sealed record AdminVideoResponse(Guid Id, string YoutubeId, string Title, string Channel, string? Duration,
    IReadOnlyList<string> UsedIn, DateTimeOffset UpdatedAt);

public sealed record SaveVideoRequest(string Url, string? Title, string? Channel, string? Duration);

public sealed record VideoLookupResponse(string YoutubeId, string? Title, string? Channel);

public sealed record AdminTrackResponse(Guid Id, string Key, string Label, string Intro, int SortOrder, IReadOnlyList<AdminLessonSummary> Lessons);

public sealed record AdminLessonSummary(Guid Id, string Slug, string Title, bool IsPublished, int SortOrder, int Blocks, DateTimeOffset UpdatedAt);

public sealed record SaveTrackRequest(string Label, string Intro, string? Key);

public sealed record AdminLessonResponse(Guid Id, Guid TrackId, string Slug, string Title, string? Lead, bool IsPublished, JsonElement Blocks, DateTimeOffset UpdatedAt);

public sealed record SaveLessonRequest(Guid TrackId, string Title, string? Lead, bool IsPublished, JsonElement Blocks, string? Slug);

public sealed record ReorderRequest(IReadOnlyList<Guid> Ids);

public sealed record AdminFileResponse(Guid Id, string Kind, string Name, string? Category, string? Format, string? WhenToUse,
    string? Description, IReadOnlyList<string> Inside, string? SaveAs, int SortOrder, bool IsPublished,
    string FileName, string ContentType, long Size, DateTimeOffset UpdatedAt, string Url);

public sealed record AdminPostResponse(Guid Id, string AuthorName, string AuthorEmail, string Kind, string? ProjectTitle,
    string Content, IReadOnlyList<Guid> Images, int Likes, int Comments, string Status, string? ModerationNote, DateTimeOffset CreatedAt);

public sealed record AdminPostCounts(int Pending, int Approved, int Rejected);

// ---------- home page content ----------

public sealed record SiteEntryView(Guid Id, string Title, string Body, string? Image, string? LinkUrl, string? LinkLabel);

public sealed record SiteContentResponse(
    IReadOnlyList<SiteEntryView> Features, IReadOnlyList<SiteEntryView> Journey,
    IReadOnlyList<SiteEntryView> Agents, IReadOnlyList<SiteEntryView> Faq,
    int Lessons, int Videos, int Templates);

public sealed record AdminSiteEntryResponse(Guid Id, string Section, string Title, string Body, string? Image, string? LinkUrl,
    string? LinkLabel, int SortOrder, bool IsPublished, DateTimeOffset UpdatedAt);

public sealed record SaveSiteEntryRequest(string Section, string Title, string? Body, string? Image, string? LinkUrl, string? LinkLabel, bool IsPublished);

// ---------- community moderation, groups, users ----------

public sealed record ModeratePostRequest(string? Note);

public sealed record AdminSavePostRequest(string? Content, string? Kind, string? ProjectTitle);

public sealed record AdminCommentResponse(Guid Id, string AuthorName, string Content, DateTimeOffset CreatedAt);

public sealed record AdminGroupResponse(Guid Id, string Name, string? Description, string OwnerName, string OwnerEmail, int Members,
    int Tasks, int Messages, string? RoadmapTitle, DateTimeOffset CreatedAt);

public sealed record AdminGroupMemberResponse(Guid UserId, string FullName, string Email, string Role, DateTimeOffset JoinedAt);

public sealed record AdminSaveGroupRequest(string Name, string? Description);

public sealed record AdminCreateUserRequest(string FullName, string Email, string Password, string Role, short? YearOfStudy);

public sealed record AdminSetPasswordRequest(string Password);
