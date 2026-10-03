namespace ProjectMentor.Api.Contracts;

public sealed record UpdatePostRequest(string? Content, string? Visibility, string? Kind = null, string? ProjectTitle = null);
public sealed record SharePostRequest(string? Content, string? Visibility);
public sealed record UpdateCommentRequest(string? Content);

/// <summary>A person in lists (friends, requests, suggestions, search). Relationship: Self | Friends | RequestSent | RequestReceived | None | Page.</summary>
public sealed record PersonCard(Guid Id, string FullName, string Initials, Guid? AvatarId, string? Badge, bool IsOfficial,
    string? Subtitle, int MutualFriends, string Relationship, bool Following = false, DateTimeOffset? Since = null);

public sealed record FriendsOverview(IReadOnlyList<PersonCard> Friends, IReadOnlyList<PersonCard> Received,
    IReadOnlyList<PersonCard> Sent, IReadOnlyList<PersonCard> Suggestions);

public sealed record CommunityProfileResponse(
    Guid Id, string FullName, string Initials, Guid? AvatarId, Guid? CoverId, string? Badge, bool IsOfficial, bool IsSelf,
    string Relationship, bool Following, int FriendCount, int MutualFriends, int FollowerCount, int PostCount,
    string? Bio, string? Email, string? Birthday, string? University, string? Degree, short? YearOfStudy, string? Location,
    string? Skills, string? GithubUrl, string? LinkedinUrl, string? Website, DateTimeOffset JoinedAt,
    IReadOnlyDictionary<string, string>? Visibility, string? BirthdayValue, bool BirthdayShowYear);

/// <summary>Self edit. Name, picture and email are NOT here: they come from the main profile.</summary>
public sealed record UpdateCommunityProfileRequest(
    string? Bio, string? Birthday, bool BirthdayShowYear, string? University, string? Degree, string? Location, string? Skills,
    string? GithubUrl, string? LinkedinUrl, string? Website, IReadOnlyDictionary<string, string>? Visibility);

public sealed record CommunitySearchResponse(IReadOnlyList<PersonCard> People, IReadOnlyList<PostResponse> Posts);

public sealed record CommunityCounts(int Notifications, int Requests);
