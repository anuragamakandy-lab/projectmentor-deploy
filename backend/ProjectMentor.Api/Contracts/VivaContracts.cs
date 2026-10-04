namespace ProjectMentor.Api.Contracts;

/// <summary>Everything the student tells the examiner about their project. All optional except Title.</summary>
public sealed record VivaDetails(
    string Title,
    string? ProjectType = null,
    string? Module = null,
    int? TeamSize = null,
    string? YourRole = null,
    string? Problem = null,
    string? TargetUsers = null,
    string? Objectives = null,
    string? Novelty = null,
    string? Features = null,
    string? Frontend = null,
    string? Backend = null,
    string? Database = null,
    string? OtherTech = null,
    string? Architecture = null,
    string? DataModel = null,
    string? Security = null,
    string? Testing = null,
    string? Deployment = null,
    string? Challenges = null,
    string? Progress = null,
    string? Limitations = null,
    string? FutureWork = null,
    string? Notes = null);

public sealed record StartVivaRequest(
    VivaDetails Details,
    Guid? RoadmapRequestId = null,
    string? Stage = null,
    string? Difficulty = null,
    int? QuestionCount = null,
    Guid? CharacterId = null);

public sealed record VivaAnswerRequest(Guid QuestionId, string? Answer, int? DurationSeconds = null);

public sealed record VivaQuestionResponse(
    Guid Id,
    int Sequence,
    string Topic,
    string Text,
    bool IsFollowUp,
    bool Answered,
    string? Answer,
    int? Score,
    string? Verdict,
    string? Reaction,
    string? Feedback,
    IReadOnlyList<string> Strengths,
    IReadOnlyList<string> Improvements,
    string? ModelAnswer,
    int? DurationSeconds);

public sealed record VivaWeakArea(string Topic, string Tip);

public sealed record VivaSummary(
    string Overall,
    string Grade,
    IReadOnlyList<string> Strengths,
    IReadOnlyList<VivaWeakArea> WeakAreas,
    IReadOnlyList<string> NextSteps);

public sealed record VivaSessionResponse(
    Guid Id,
    string Title,
    string Stage,
    string Difficulty,
    string Status,
    string? Greeting,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    int? ScorePercent,
    Guid? RoadmapRequestId,
    VivaDetails Details,
    IReadOnlyList<VivaQuestionResponse> Questions,
    VivaSummary? Summary,
    string Language = "en-GB",
    VivaCharacterView? Character = null);

public sealed record VivaSessionListItem(
    Guid Id,
    string Title,
    string Stage,
    string Difficulty,
    string Status,
    DateTimeOffset CreatedAt,
    int? ScorePercent,
    int Answered,
    int Total);

/// <summary>A 2D examiner character as students and admins see it.</summary>
public sealed record VivaCharacterView(
    Guid Id, string Name, string? Tagline, string Preset, string Gender, string SkinTone, string HairColor, string HairStyle,
    string OutfitColor, string AccentColor, bool Glasses, bool FacialHair, string Language, double Rate, double Pitch,
    string Style, bool IsPublished, int SortOrder, int Sessions = 0);

public sealed record SaveVivaCharacterRequest(
    string Name, string? Tagline, string Preset, string Gender, string SkinTone, string HairColor, string HairStyle,
    string OutfitColor, string AccentColor, bool Glasses, bool FacialHair, string Language, double Rate, double Pitch,
    string Style, bool IsPublished);

public sealed record AdminVivaStats(int Sessions, int Completed, int? AverageScore, int Students, IReadOnlyList<VivaCharacterView> Characters);

/// <summary>A roadmap the student can practise a viva for: their own approved roadmap, or one shared with a group they are in.</summary>
public sealed record VivaRoadmapOption(Guid Id, string DisplayTitle, string Source, string? GroupName, int ProgressPercent);
