using System.Text.Json;

namespace ProjectMentor.Data;

public enum UserRole { Student, Admin }
public enum QuestionAnswerType { Choice, MultiSelect, ShortText, Number, Date }
public enum RoadmapRequestStatus { Submitted, Planning, PendingApproval, Accepted, RevisionRequested, Failed }
public enum RoadmapStatus { Draft, PendingApproval, Accepted, Superseded, Rejected }
public enum MilestonePhase { Title, Design, Build, Documentation, Presentation, Deployment }
public enum MilestoneStatus { NotStarted, InProgress, Blocked, Done }
public enum ResourceType { Video, Article, Documentation, Course }
public enum AgentName { Planner, ResourceAgent, AnalysisAgent, ValidationAgent }
public enum WorkflowRunStatus { Running, PausedForApproval, Completed, Failed }
public enum AgentStepStatus { Pending, Running, Success, Failed }
public enum ApprovalDecisionType { Accepted, RevisionRequested }
public enum NotificationType { MilestoneReminder, PlanReady, Overdue }
public enum GuidanceTemplateType { ReportOutline, PresentationSkeleton, DeploymentChecklist }

public abstract class AuditedEntity
{
    public Guid Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class User : AuditedEntity
{
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public UserRole Role { get; set; }
    public short? YearOfStudy { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Profile picture (an image in the uploads table).</summary>
    public Guid? AvatarUploadId { get; set; }
    public string? Bio { get; set; }
    /// <summary>Badge awarded by an admin (Silver, Gold, Premium, Diamond); shown as a frame around the profile picture.</summary>
    public string? Badge { get; set; }
    /// <summary>Google account id when the user signs in with Google.</summary>
    public string? GoogleSubject { get; set; }
    public DateTimeOffset? LastActiveAt { get; set; }
    /// <summary>The official ProjectMentor community page account (managed by admins, cannot sign in).</summary>
    public bool IsOfficial { get; set; }
    public string? DeactivationReason { get; set; }
    // ---- community profile (name, picture and email always come from the main profile) ----
    public Guid? CoverUploadId { get; set; }
    public DateOnly? Birthday { get; set; }
    public bool BirthdayShowYear { get; set; } = true;
    public string? University { get; set; }
    public string? Degree { get; set; }
    public string? Location { get; set; }
    public string? Skills { get; set; }
    public string? GithubUrl { get; set; }
    public string? LinkedinUrl { get; set; }
    public string? Website { get; set; }
    /// <summary>JSON map field -> Public | Friends | Private.</summary>
    public string VisibilityJson { get; set; } = "{}";
    public ICollection<RoadmapRequest> RoadmapRequests { get; set; } = [];
    public ICollection<Roadmap> Roadmaps { get; set; } = [];
    public ICollection<MilestoneStatusHistory> MilestoneStatusChanges { get; set; } = [];
    public ICollection<Resource> ResourcesAdded { get; set; } = [];
    public ICollection<ApprovalDecision> ApprovalDecisions { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
}

public sealed class Question : AuditedEntity
{
    public string Code { get; set; } = null!;
    public string PromptText { get; set; } = null!;
    public QuestionAnswerType AnswerType { get; set; }
    public JsonDocument? Options { get; set; }
    public bool IsCore { get; set; }
    public Guid? DependsOnQuestionId { get; set; }
    public string? DependsOnValue { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public Question? DependsOnQuestion { get; set; }
    public ICollection<Question> DependentQuestions { get; set; } = [];
    public ICollection<QuestionAnswer> Answers { get; set; } = [];
}

public sealed class RoadmapRequest : AuditedEntity
{
    public Guid StudentId { get; set; }
    public string? Title { get; set; }
    /// <summary>The idea description the student chose or wrote (used by the chatbot, report and viva).</summary>
    public string? Description { get; set; }
    public RoadmapRequestStatus Status { get; set; }
    public User Student { get; set; } = null!;
    public ICollection<QuestionAnswer> Answers { get; set; } = [];
    public ICollection<Roadmap> Roadmaps { get; set; } = [];
    public ICollection<AgentWorkflowRun> WorkflowRuns { get; set; } = [];
}

public sealed class QuestionAnswer : AuditedEntity
{
    public Guid RoadmapRequestId { get; set; }
    public Guid QuestionId { get; set; }
    public JsonDocument AnswerValue { get; set; } = null!;
    public RoadmapRequest RoadmapRequest { get; set; } = null!;
    public Question Question { get; set; } = null!;
}

public sealed class Roadmap : AuditedEntity
{
    public Guid RoadmapRequestId { get; set; }
    public Guid StudentId { get; set; }
    public int Version { get; set; } = 1;
    public RoadmapStatus Status { get; set; }
    public DateTimeOffset? GeneratedAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    /// <summary>Plain-language summary shown after the student accepts the roadmap (JSON).</summary>
    public string? SummaryJson { get; set; }
    public RoadmapRequest RoadmapRequest { get; set; } = null!;
    public User Student { get; set; } = null!;
    public ICollection<Milestone> Milestones { get; set; } = [];
}

public sealed class Milestone : AuditedEntity
{
    public Guid RoadmapId { get; set; }
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public MilestonePhase Phase { get; set; }
    public int OrderIndex { get; set; }
    public DateOnly DueDate { get; set; }
    public MilestoneStatus Status { get; set; }
    public decimal? EstimatedHours { get; set; }
    public Roadmap Roadmap { get; set; } = null!;
    public ICollection<MilestoneStatusHistory> StatusHistory { get; set; } = [];
    public ICollection<MilestoneResource> Resources { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
}

public sealed class MilestoneStatusHistory : AuditedEntity
{
    public Guid MilestoneId { get; set; }
    public MilestoneStatus? OldStatus { get; set; }
    public MilestoneStatus NewStatus { get; set; }
    public Guid ChangedById { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public Milestone Milestone { get; set; } = null!;
    public User ChangedBy { get; set; } = null!;
}

public sealed class Resource : AuditedEntity
{
    public string Title { get; set; } = null!;
    public string Url { get; set; } = null!;
    public ResourceType ResourceType { get; set; }
    public string Topic { get; set; } = null!;
    public string? Description { get; set; }
    public string Level { get; set; } = "Beginner";      // Beginner | Intermediate | Advanced
    public string? Duration { get; set; }                 // e.g. "2 h", "6 weeks"
    public bool IsFree { get; set; } = true;
    public string? Price { get; set; }                    // paid courses, e.g. "US$ 49/month"
    public string? Provider { get; set; }                 // e.g. "freeCodeCamp", "Coursera"
    public bool IsFeatured { get; set; }
    public Guid AddedById { get; set; }
    public User AddedBy { get; set; } = null!;
    public ICollection<ResourceTag> Tags { get; set; } = [];
    public ICollection<MilestoneResource> Milestones { get; set; } = [];
}

public sealed class Tag : AuditedEntity
{
    public string Name { get; set; } = null!;
    public ICollection<ResourceTag> Resources { get; set; } = [];
}

public sealed class ResourceTag : AuditedEntity
{
    public Guid ResourceId { get; set; }
    public Guid TagId { get; set; }
    public Resource Resource { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}

public sealed class MilestoneResource : AuditedEntity
{
    public Guid MilestoneId { get; set; }
    public Guid ResourceId { get; set; }
    public AgentName AttachedBy { get; set; }
    public Milestone Milestone { get; set; } = null!;
    public Resource Resource { get; set; } = null!;
}

public sealed class AgentWorkflowRun : AuditedEntity
{
    public Guid RoadmapRequestId { get; set; }
    public string Objective { get; set; } = null!;
    public WorkflowRunStatus Status { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public RoadmapRequest RoadmapRequest { get; set; } = null!;
    public ICollection<AgentStep> Steps { get; set; } = [];
    public ICollection<ValidationResult> ValidationResults { get; set; } = [];
    public ICollection<ApprovalDecision> ApprovalDecisions { get; set; } = [];
}

public sealed class AgentStep : AuditedEntity
{
    public Guid WorkflowRunId { get; set; }
    public AgentName AgentName { get; set; }
    public int StepOrder { get; set; }
    public JsonDocument InputPayload { get; set; } = null!;
    public JsonDocument? OutputPayload { get; set; }
    public AgentStepStatus Status { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public AgentWorkflowRun WorkflowRun { get; set; } = null!;
    public ICollection<ToolCall> ToolCalls { get; set; } = [];
}

public sealed class ToolCall : AuditedEntity
{
    public Guid AgentStepId { get; set; }
    public string ToolName { get; set; } = null!;
    public JsonDocument InputParams { get; set; } = null!;
    public JsonDocument? OutputResult { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public int? DurationMs { get; set; }
    public DateTimeOffset CalledAt { get; set; }
    public AgentStep AgentStep { get; set; } = null!;
}

public sealed class ValidationResult : AuditedEntity
{
    public Guid WorkflowRunId { get; set; }
    public string RuleName { get; set; } = null!;
    public bool Passed { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset CheckedAt { get; set; }
    public AgentWorkflowRun WorkflowRun { get; set; } = null!;
}

public sealed class ApprovalDecision : AuditedEntity
{
    public Guid WorkflowRunId { get; set; }
    public Guid StudentId { get; set; }
    public ApprovalDecisionType Decision { get; set; }
    public string? Comment { get; set; }
    public DateTimeOffset DecidedAt { get; set; }
    public AgentWorkflowRun WorkflowRun { get; set; } = null!;
    public User Student { get; set; } = null!;
}

public sealed class Notification : AuditedEntity
{
    public Guid UserId { get; set; }
    public NotificationType NotificationType { get; set; }
    public string Message { get; set; } = null!;
    public Guid? RelatedMilestoneId { get; set; }
    public bool IsRead { get; set; }
    public User User { get; set; } = null!;
    public Milestone? RelatedMilestone { get; set; }
}

public sealed class GuidanceTemplate : AuditedEntity
{
    public GuidanceTemplateType TemplateType { get; set; }
    public string Name { get; set; } = null!;
    public string[] ApplicableProjectTypes { get; set; } = [];
    public JsonDocument Content { get; set; } = null!;
}

public sealed class ChatTurn : AuditedEntity
{
    public Guid RoadmapRequestId { get; set; }
    public string Role { get; set; } = null!; // "user" or "assistant"
    public string Content { get; set; } = null!;
    public int Sequence { get; set; }
}

/// <summary>One mock-viva practice run. Details holds everything the student told us about the project.</summary>
public sealed class VivaSession : AuditedEntity
{
    public Guid StudentId { get; set; }
    public Guid? RoadmapRequestId { get; set; }
    public string Title { get; set; } = null!;
    public string Stage { get; set; } = "Final";          // Proposal | Progress | Final
    public string Difficulty { get; set; } = "Standard";  // Friendly | Standard | Strict
    public string Status { get; set; } = "InProgress";    // InProgress | Completed
    public string? Greeting { get; set; }
    public JsonDocument Details { get; set; } = null!;
    public JsonDocument? Summary { get; set; }
    public int? ScorePercent { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public Guid? CharacterId { get; set; }
    /// <summary>Language the examiner speaks: en-GB, en-US, en-IN or si-LK.</summary>
    public string Language { get; set; } = "en-GB";
    public ICollection<VivaQuestion> Questions { get; set; } = [];
}

/// <summary>One examiner question, the student's answer and the examiner's evaluation.</summary>
public sealed class VivaQuestion : AuditedEntity
{
    public Guid VivaSessionId { get; set; }
    public int Sequence { get; set; }
    public string Topic { get; set; } = null!;
    public string Text { get; set; } = null!;
    public string? LookingFor { get; set; }
    public bool IsFollowUp { get; set; }
    public string? Answer { get; set; }
    public int? Score { get; set; }
    public string? Verdict { get; set; }
    public string? Reaction { get; set; }
    public string? Feedback { get; set; }
    public string[] Strengths { get; set; } = [];
    public string[] Improvements { get; set; } = [];
    public string? ModelAnswer { get; set; }
    public int? DurationSeconds { get; set; }
    public DateTimeOffset? AnsweredAt { get; set; }
    public VivaSession Session { get; set; } = null!;
}

// ---------------- Study groups, sprint board, community ----------------

/// <summary>A private project group. Members join through an invitation link.</summary>
public sealed class StudyGroup : AuditedEntity
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public Guid? RoadmapRequestId { get; set; }   // the shared roadmap the board is planned from
    public string Color { get; set; } = "#0e7a52";
    public ICollection<GroupMember> Members { get; set; } = [];
}

public sealed class GroupMember : AuditedEntity
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "Member"; // Owner | Member
    public DateTimeOffset JoinedAt { get; set; }
    public StudyGroup Group { get; set; } = null!;
    public User User { get; set; } = null!;
}

/// <summary>GitHub-style invitation link: a random token, an expiry and an optional use limit.</summary>
public sealed class GroupInvite : AuditedEntity
{
    public Guid GroupId { get; set; }
    public string Token { get; set; } = null!;
    public Guid CreatedById { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int? MaxUses { get; set; }
    public int Uses { get; set; }
    public bool Revoked { get; set; }
    public StudyGroup Group { get; set; } = null!;
}

public sealed class GroupMessage : AuditedEntity
{
    public Guid GroupId { get; set; }
    public Guid? SenderId { get; set; }            // null = system message ("Kamal joined")
    public string Content { get; set; } = null!;
    public Guid? UploadId { get; set; }
    public User? Sender { get; set; }
}

/// <summary>One card on the group's weekly sprint board.</summary>
public sealed class BoardTask : AuditedEntity
{
    public Guid GroupId { get; set; }
    public Guid? MilestoneId { get; set; }
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string Status { get; set; } = "Todo";   // Todo | Doing | Done
    public Guid? AssigneeId { get; set; }
    public decimal? EstimateHours { get; set; }
    public DateOnly? WeekStart { get; set; }       // Monday of the sprint week it is planned for
    public int SortOrder { get; set; }
    public string Source { get; set; } = "Manual"; // AI | Rules | Manual
    public Guid CreatedById { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public Guid? CompletedById { get; set; }
    public User? Assignee { get; set; }
}

/// <summary>A file stored in the database (post images, PDFs, chat images). Served by unguessable id.</summary>
public sealed class Upload : AuditedEntity
{
    public Guid OwnerId { get; set; }
    public string FileName { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public long Size { get; set; }
    public byte[] Data { get; set; } = null!;
}

public static class PostStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>A public community post (project showcase, question, report, idea).</summary>
public sealed class Post : AuditedEntity
{
    public Guid AuthorId { get; set; }
    public Guid? GroupId { get; set; }
    public string Kind { get; set; } = "Update";   // Showcase | Update | Question | Report | Idea
    public string? ProjectTitle { get; set; }
    public string Content { get; set; } = null!;
    public Guid[] UploadIds { get; set; } = [];
    /// <summary>Pending until an admin approves it; only Approved posts are public.</summary>
    public string Status { get; set; } = PostStatus.Pending;
    public string? ModerationNote { get; set; }
    public DateTimeOffset? ModeratedAt { get; set; }
    /// <summary>Public | Friends | OnlyMe</summary>
    public string Visibility { get; set; } = "Public";
    /// <summary>Set when this post shares another post (Facebook-style "Share to feed").</summary>
    public Guid? SharedPostId { get; set; }
    public DateTimeOffset? EditedAt { get; set; }
    public User Author { get; set; } = null!;
    public ICollection<PostLike> Likes { get; set; } = [];
    public ICollection<PostComment> Comments { get; set; } = [];
}

public sealed class PostLike : AuditedEntity
{
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }
    /// <summary>Like | Love | Care | Haha | Excellent | Angry</summary>
    public string Reaction { get; set; } = "Like";
    public Post Post { get; set; } = null!;
}

public sealed class PostComment : AuditedEntity
{
    public Guid PostId { get; set; }
    public Guid AuthorId { get; set; }
    public string Content { get; set; } = null!;
    /// <summary>Replies point at the top-level comment they answer.</summary>
    public Guid? ParentCommentId { get; set; }
    public DateTimeOffset? EditedAt { get; set; }
    public Post Post { get; set; } = null!;
    public User Author { get; set; } = null!;
}

/// <summary>A YouTube video in the Learn library. Lessons reference videos by <see cref="YoutubeId"/>.</summary>
public sealed class LearnVideo : AuditedEntity
{
    public string YoutubeId { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string Channel { get; set; } = null!;
    public string? Duration { get; set; }
}

/// <summary>A Learn track (Reports, Presenting, Git) holding ordered lessons.</summary>
public sealed class LearnTrack : AuditedEntity
{
    public string Key { get; set; } = null!;
    public string Label { get; set; } = null!;
    public string Intro { get; set; } = "";
    public int SortOrder { get; set; }
    public ICollection<LearnLesson> Lessons { get; set; } = [];
}

/// <summary>One lesson. Its body is an ordered list of content blocks stored as JSON.</summary>
public sealed class LearnLesson : AuditedEntity
{
    public Guid TrackId { get; set; }
    public string Slug { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string? Lead { get; set; }
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;
    public string BlocksJson { get; set; } = "[]";
    public LearnTrack Track { get; set; } = null!;
}

/// <summary>A downloadable file managed by admins: a fill-in template or a finished example.</summary>
public sealed class ContentFile : AuditedEntity
{
    public string Kind { get; set; } = "Template";   // Template | Example
    public string Name { get; set; } = null!;
    public string? Category { get; set; }
    public string? Format { get; set; }
    public string? WhenToUse { get; set; }
    public string? Description { get; set; }
    public string[] Inside { get; set; } = [];
    public string? SaveAs { get; set; }
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;
    public string FileName { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public long Size { get; set; }
    public byte[] Data { get; set; } = null!;
}

/// <summary>
/// One editable item on the public home page: a feature card, a journey step, an AI agent or an FAQ.
/// </summary>
public sealed class SiteEntry : AuditedEntity
{
    public string Section { get; set; } = null!;   // features | journey | agents | faq
    public string Title { get; set; } = null!;
    public string Body { get; set; } = "";
    public string? Image { get; set; }
    public string? LinkUrl { get; set; }
    public string? LinkLabel { get; set; }
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;
}

/// <summary>An in-app notification for a student (post approved, new comment, badge awarded, ...).</summary>
public sealed class UserNotification : AuditedEntity
{
    public Guid UserId { get; set; }
    public string Kind { get; set; } = null!;   // PostApproved | PostRejected | Comment | Reaction | GroupJoin | Badge | System
    public string Title { get; set; } = null!;
    public string? Body { get; set; }
    public string? Link { get; set; }
    public bool IsRead { get; set; }
    /// <summary>System (navbar bell) or Community (inside the Community page).</summary>
    public string Scope { get; set; } = "System";
    public Guid? ActorId { get; set; }
}

/// <summary>
/// A 2D mock viva examiner. Admins create characters from the stock male/female designs, set their name, look,
/// language and voice, and publish them; students choose one before a viva.
/// </summary>
public sealed class VivaCharacter : AuditedEntity
{
    public string Name { get; set; } = null!;          // shown on the nameplate, e.g. "Dr. Mentor"
    public string? Tagline { get; set; }               // e.g. "Calm, asks about design decisions"
    public string Preset { get; set; } = "mentor";     // stock design the look started from
    public string Gender { get; set; } = "male";       // male | female (stock artwork and preferred voice)
    public string SkinTone { get; set; } = "#efc29a";
    public string HairColor { get; set; } = "#c9cfd2";
    public string HairStyle { get; set; } = "short";   // short | side | long | bun | bald | curly
    public string OutfitColor { get; set; } = "#127a53";
    public string AccentColor { get; set; } = "#c39a3c";
    public bool Glasses { get; set; } = true;
    public bool FacialHair { get; set; } = true;
    public string Language { get; set; } = "en-GB";   // en-GB | en-US | en-IN | si-LK
    public double Rate { get; set; } = 1.0;
    public double Pitch { get; set; } = 0.95;
    public string Style { get; set; } = "Standard";   // Friendly | Standard | Strict
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;
}
