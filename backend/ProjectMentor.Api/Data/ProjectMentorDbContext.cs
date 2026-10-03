using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System.Text.Json;

namespace ProjectMentor.Data;

public sealed class ProjectMentorDbContext(DbContextOptions<ProjectMentorDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<RoadmapRequest> RoadmapRequests => Set<RoadmapRequest>();
    public DbSet<QuestionAnswer> QuestionAnswers => Set<QuestionAnswer>();
    public DbSet<Roadmap> Roadmaps => Set<Roadmap>();
    public DbSet<Milestone> Milestones => Set<Milestone>();
    public DbSet<MilestoneStatusHistory> MilestoneStatusHistory => Set<MilestoneStatusHistory>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ResourceTag> ResourceTags => Set<ResourceTag>();
    public DbSet<MilestoneResource> MilestoneResources => Set<MilestoneResource>();
    public DbSet<AgentWorkflowRun> AgentWorkflowRuns => Set<AgentWorkflowRun>();
    public DbSet<AgentStep> AgentSteps => Set<AgentStep>();
    public DbSet<ToolCall> ToolCalls => Set<ToolCall>();
    public DbSet<ValidationResult> ValidationResults => Set<ValidationResult>();
    public DbSet<ApprovalDecision> ApprovalDecisions => Set<ApprovalDecision>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<GuidanceTemplate> GuidanceTemplates => Set<GuidanceTemplate>();
    public DbSet<ChatTurn> ChatTurns => Set<ChatTurn>();
    public DbSet<VivaSession> VivaSessions => Set<VivaSession>();
    public DbSet<VivaQuestion> VivaQuestions => Set<VivaQuestion>();
    public DbSet<StudyGroup> StudyGroups => Set<StudyGroup>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<GroupInvite> GroupInvites => Set<GroupInvite>();
    public DbSet<GroupMessage> GroupMessages => Set<GroupMessage>();
    public DbSet<BoardTask> BoardTasks => Set<BoardTask>();
    public DbSet<Upload> Uploads => Set<Upload>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostLike> PostLikes => Set<PostLike>();
    public DbSet<PostComment> PostComments => Set<PostComment>();
    public DbSet<LearnVideo> LearnVideos => Set<LearnVideo>();
    public DbSet<LearnTrack> LearnTracks => Set<LearnTrack>();
    public DbSet<LearnLesson> LearnLessons => Set<LearnLesson>();
    public DbSet<ContentFile> ContentFiles => Set<ContentFile>();
    public DbSet<SiteEntry> SiteEntries => Set<SiteEntry>();
    public DbSet<UserNotification> UserNotifications => Set<UserNotification>();
    public DbSet<VivaCharacter> VivaCharacters => Set<VivaCharacter>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<PageFollow> PageFollows => Set<PageFollow>();
    public DbSet<CommentReaction> CommentReactions => Set<CommentReaction>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<EmailLog> EmailLogs => Set<EmailLog>();
    public DbSet<SupportRequest> SupportRequests => Set<SupportRequest>();
    public DbSet<PasswordResetCode> PasswordResetCodes => Set<PasswordResetCode>();
    public DbSet<ResourceBookmark> ResourceBookmarks => Set<ResourceBookmark>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasPostgresExtension("pgcrypto");
        modelBuilder.HasDefaultSchema("public");
        modelBuilder.HasPostgresEnum<UserRole>(name: "user_role");
        modelBuilder.HasPostgresEnum<QuestionAnswerType>(name: "question_answer_type");
        modelBuilder.HasPostgresEnum<RoadmapRequestStatus>(name: "roadmap_request_status");
        modelBuilder.HasPostgresEnum<RoadmapStatus>(name: "roadmap_status");
        modelBuilder.HasPostgresEnum<MilestonePhase>(name: "milestone_phase");
        modelBuilder.HasPostgresEnum<MilestoneStatus>(name: "milestone_status");
        modelBuilder.HasPostgresEnum<ResourceType>(name: "resource_type");
        modelBuilder.HasPostgresEnum<AgentName>(name: "agent_name");
        modelBuilder.HasPostgresEnum<WorkflowRunStatus>(name: "workflow_run_status");
        modelBuilder.HasPostgresEnum<AgentStepStatus>(name: "agent_step_status");
        modelBuilder.HasPostgresEnum<ApprovalDecisionType>(name: "approval_decision_type");
        modelBuilder.HasPostgresEnum<NotificationType>(name: "notification_type");
        modelBuilder.HasPostgresEnum<GuidanceTemplateType>(name: "guidance_template_type");

        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => typeof(AuditedEntity).IsAssignableFrom(e.ClrType)))
        {
            modelBuilder.Entity(entity.ClrType).Property<Guid>(nameof(AuditedEntity.Id)).HasDefaultValueSql("gen_random_uuid()");
            modelBuilder.Entity(entity.ClrType).Property<DateTimeOffset>(nameof(AuditedEntity.CreatedAt)).HasDefaultValueSql("now()");
            modelBuilder.Entity(entity.ClrType).Property<DateTimeOffset>(nameof(AuditedEntity.UpdatedAt)).HasDefaultValueSql("now()");
        }

        ConfigureUsers(modelBuilder);
        ConfigureQuestions(modelBuilder);
        ConfigurePlanning(modelBuilder);
        ConfigureResources(modelBuilder);
        ConfigureWorkflow(modelBuilder);
        ConfigureProgressAndGuidance(modelBuilder);

        var chat = modelBuilder.Entity<ChatTurn>();
        chat.ToTable("chat_turns");
        chat.Property(x => x.Role).HasMaxLength(20).IsRequired();
        chat.Property(x => x.Content).IsRequired();
        chat.HasIndex(x => new { x.RoadmapRequestId, x.Sequence });
        chat.HasOne<RoadmapRequest>().WithMany().HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.Cascade);

        var viva = modelBuilder.Entity<VivaSession>();
        viva.ToTable("viva_sessions");
        viva.Property(x => x.Title).HasMaxLength(300).IsRequired();
        viva.Property(x => x.Stage).HasMaxLength(20).IsRequired();
        viva.Property(x => x.Difficulty).HasMaxLength(20).IsRequired();
        viva.Property(x => x.Status).HasMaxLength(20).IsRequired();
        viva.Property(x => x.Details).HasColumnType("jsonb");
        viva.Property(x => x.Language).HasMaxLength(10).IsRequired().HasDefaultValue("en-GB");
        viva.HasOne<VivaCharacter>().WithMany().HasForeignKey(x => x.CharacterId).OnDelete(DeleteBehavior.SetNull);
        viva.Property(x => x.Summary).HasColumnType("jsonb");
        viva.HasIndex(x => new { x.StudentId, x.CreatedAt });
        viva.HasOne<User>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Cascade);
        viva.HasOne<RoadmapRequest>().WithMany().HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.SetNull);

        var vivaQuestion = modelBuilder.Entity<VivaQuestion>();
        vivaQuestion.ToTable("viva_questions");
        vivaQuestion.Property(x => x.Topic).HasMaxLength(100).IsRequired();
        vivaQuestion.Property(x => x.Text).IsRequired();
        vivaQuestion.Property(x => x.Verdict).HasMaxLength(30);
        vivaQuestion.Property(x => x.Reaction).HasMaxLength(30);
        vivaQuestion.Property(x => x.Strengths).HasColumnType("text[]");
        vivaQuestion.Property(x => x.Improvements).HasColumnType("text[]");
        vivaQuestion.HasIndex(x => new { x.VivaSessionId, x.Sequence });
        vivaQuestion.HasOne(x => x.Session).WithMany(x => x.Questions).HasForeignKey(x => x.VivaSessionId).OnDelete(DeleteBehavior.Cascade);

        ConfigureGroupsAndCommunity(modelBuilder);
        SocialModel.Configure(modelBuilder);
    }

    private static void ConfigureGroupsAndCommunity(ModelBuilder modelBuilder)
    {
        var group = modelBuilder.Entity<StudyGroup>();
        group.ToTable("study_groups");
        group.Property(x => x.Name).HasMaxLength(120).IsRequired();
        group.Property(x => x.Description).HasMaxLength(1000);
        group.Property(x => x.Color).HasMaxLength(20).IsRequired();
        group.HasOne<User>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        group.HasOne<RoadmapRequest>().WithMany().HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.SetNull);

        var member = modelBuilder.Entity<GroupMember>();
        member.ToTable("group_members");
        member.Property(x => x.Role).HasMaxLength(20).IsRequired();
        member.HasIndex(x => new { x.GroupId, x.UserId }).IsUnique();
        member.HasIndex(x => x.UserId);
        member.HasOne(x => x.Group).WithMany(x => x.Members).HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        member.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        var invite = modelBuilder.Entity<GroupInvite>();
        invite.ToTable("group_invites");
        invite.Property(x => x.Token).HasMaxLength(64).IsRequired();
        invite.HasIndex(x => x.Token).IsUnique();
        invite.HasOne(x => x.Group).WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);

        var message = modelBuilder.Entity<GroupMessage>();
        message.ToTable("group_messages");
        message.Property(x => x.Content).HasMaxLength(4000).IsRequired();
        message.HasIndex(x => new { x.GroupId, x.CreatedAt });
        message.HasOne<StudyGroup>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        message.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.SetNull);

        var task = modelBuilder.Entity<BoardTask>();
        task.ToTable("board_tasks");
        task.Property(x => x.Title).HasMaxLength(200).IsRequired();
        task.Property(x => x.Description).HasMaxLength(2000);
        task.Property(x => x.Status).HasMaxLength(20).IsRequired();
        task.Property(x => x.Source).HasMaxLength(20).IsRequired();
        task.Property(x => x.EstimateHours).HasPrecision(5, 1);
        task.HasIndex(x => new { x.GroupId, x.Status });
        task.HasOne<StudyGroup>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        task.HasOne<Milestone>().WithMany().HasForeignKey(x => x.MilestoneId).OnDelete(DeleteBehavior.SetNull);
        task.HasOne(x => x.Assignee).WithMany().HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.SetNull);

        var upload = modelBuilder.Entity<Upload>();
        upload.ToTable("uploads");
        upload.Property(x => x.FileName).HasMaxLength(260).IsRequired();
        upload.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        upload.HasOne<User>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);

        var post = modelBuilder.Entity<Post>();
        post.ToTable("posts");
        post.Property(x => x.Kind).HasMaxLength(20).IsRequired();
        post.Property(x => x.ProjectTitle).HasMaxLength(200);
        post.Property(x => x.Content).HasMaxLength(5000).IsRequired();
        post.Property(x => x.UploadIds).HasColumnType("uuid[]");
        // Posts that existed before moderation was added stay visible.
        post.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue(PostStatus.Approved);
        post.Property(x => x.ModerationNote).HasMaxLength(500);
        post.HasIndex(x => new { x.Status, x.CreatedAt });
        post.HasIndex(x => x.CreatedAt);
        post.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Cascade);
        post.HasOne<StudyGroup>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.SetNull);

        var video = modelBuilder.Entity<LearnVideo>();
        video.ToTable("learn_videos");
        video.Property(x => x.YoutubeId).HasMaxLength(20).IsRequired();
        video.Property(x => x.Title).HasMaxLength(200).IsRequired();
        video.Property(x => x.Channel).HasMaxLength(120).IsRequired();
        video.Property(x => x.Duration).HasMaxLength(20);
        video.HasIndex(x => x.YoutubeId).IsUnique();

        var track = modelBuilder.Entity<LearnTrack>();
        track.ToTable("learn_tracks");
        track.Property(x => x.Key).HasMaxLength(40).IsRequired();
        track.Property(x => x.Label).HasMaxLength(120).IsRequired();
        track.Property(x => x.Intro).HasMaxLength(1000).IsRequired();
        track.HasIndex(x => x.Key).IsUnique();

        var lesson = modelBuilder.Entity<LearnLesson>();
        lesson.ToTable("learn_lessons");
        lesson.Property(x => x.Slug).HasMaxLength(60).IsRequired();
        lesson.Property(x => x.Title).HasMaxLength(200).IsRequired();
        lesson.Property(x => x.Lead).HasMaxLength(1000);
        lesson.Property(x => x.BlocksJson).HasColumnType("jsonb").IsRequired();
        lesson.HasIndex(x => new { x.TrackId, x.Slug }).IsUnique();
        lesson.HasOne(x => x.Track).WithMany(x => x.Lessons).HasForeignKey(x => x.TrackId).OnDelete(DeleteBehavior.Cascade);

        var file = modelBuilder.Entity<ContentFile>();
        file.ToTable("content_files");
        file.Property(x => x.Kind).HasMaxLength(20).IsRequired();
        file.Property(x => x.Name).HasMaxLength(160).IsRequired();
        file.Property(x => x.Category).HasMaxLength(80);
        file.Property(x => x.Format).HasMaxLength(40);
        file.Property(x => x.WhenToUse).HasMaxLength(500);
        file.Property(x => x.Description).HasMaxLength(1000);
        file.Property(x => x.Inside).HasColumnType("text[]");
        file.Property(x => x.SaveAs).HasMaxLength(160);
        file.Property(x => x.FileName).HasMaxLength(260).IsRequired();
        file.Property(x => x.ContentType).HasMaxLength(150).IsRequired();
        file.HasIndex(x => new { x.Kind, x.SortOrder });

        var site = modelBuilder.Entity<SiteEntry>();
        site.ToTable("site_entries");
        site.Property(x => x.Section).HasMaxLength(20).IsRequired();
        site.Property(x => x.Title).HasMaxLength(200).IsRequired();
        site.Property(x => x.Body).HasMaxLength(2000).IsRequired();
        site.Property(x => x.Image).HasMaxLength(60);
        site.Property(x => x.LinkUrl).HasMaxLength(300);
        site.Property(x => x.LinkLabel).HasMaxLength(60);
        site.HasIndex(x => new { x.Section, x.SortOrder });

        var like = modelBuilder.Entity<PostLike>();
        like.ToTable("post_likes");
        like.HasIndex(x => new { x.PostId, x.UserId }).IsUnique();
        like.Property(x => x.Reaction).HasMaxLength(20).IsRequired().HasDefaultValue("Like");

        var note = modelBuilder.Entity<UserNotification>();
        note.ToTable("user_notifications");
        note.Property(x => x.Kind).HasMaxLength(30).IsRequired();
        note.Property(x => x.Title).HasMaxLength(200).IsRequired();
        note.Property(x => x.Body).HasMaxLength(500);
        note.Property(x => x.Link).HasMaxLength(300);
        note.HasIndex(x => new { x.UserId, x.CreatedAt });
        note.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        var ch = modelBuilder.Entity<VivaCharacter>();
        ch.ToTable("viva_characters");
        ch.Property(x => x.Name).HasMaxLength(60).IsRequired();
        ch.Property(x => x.Tagline).HasMaxLength(160);
        ch.Property(x => x.Preset).HasMaxLength(30).IsRequired();
        ch.Property(x => x.Gender).HasMaxLength(10).IsRequired();
        ch.Property(x => x.SkinTone).HasMaxLength(9).IsRequired();
        ch.Property(x => x.HairColor).HasMaxLength(9).IsRequired();
        ch.Property(x => x.HairStyle).HasMaxLength(10).IsRequired();
        ch.Property(x => x.OutfitColor).HasMaxLength(9).IsRequired();
        ch.Property(x => x.AccentColor).HasMaxLength(9).IsRequired();
        ch.Property(x => x.Language).HasMaxLength(10).IsRequired();
        ch.Property(x => x.Style).HasMaxLength(10).IsRequired();
        like.HasOne(x => x.Post).WithMany(x => x.Likes).HasForeignKey(x => x.PostId).OnDelete(DeleteBehavior.Cascade);
        like.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        var comment = modelBuilder.Entity<PostComment>();
        comment.ToTable("post_comments");
        comment.Property(x => x.Content).HasMaxLength(2000).IsRequired();
        comment.HasIndex(x => new { x.PostId, x.CreatedAt });
        comment.HasOne(x => x.Post).WithMany(x => x.Comments).HasForeignKey(x => x.PostId).OnDelete(DeleteBehavior.Cascade);
        comment.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureUsers(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<User>();
        entity.ToTable("users");
        entity.HasIndex(x => x.Email).IsUnique();
        entity.Property(x => x.Email).HasMaxLength(320).IsRequired()
            .HasConversion(new ValueConverter<string, string>(value => value.ToLowerInvariant(), value => value));
        entity.Property(x => x.PasswordHash).IsRequired();
        entity.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        entity.Property(x => x.Role).HasColumnType("user_role");
        entity.Property(x => x.Bio).HasMaxLength(500);
        entity.Property(x => x.Badge).HasMaxLength(20);
        entity.Property(x => x.GoogleSubject).HasMaxLength(64);
        entity.HasIndex(x => x.GoogleSubject).IsUnique().HasFilter("\"GoogleSubject\" IS NOT NULL");
        entity.HasIndex(x => x.Email).HasDatabaseName("ix_users_email_lower").IsUnique().HasFilter(null);
    }

    private static void ConfigureQuestions(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<Question>();
        entity.ToTable("questions");
        entity.HasIndex(x => x.Code).IsUnique();
        entity.Property(x => x.Code).HasMaxLength(100).IsRequired();
        entity.Property(x => x.PromptText).IsRequired();
        entity.Property(x => x.AnswerType).HasColumnType("question_answer_type");
        entity.Property(x => x.Options).HasColumnType("jsonb");
        entity.HasOne(x => x.DependsOnQuestion).WithMany(x => x.DependentQuestions).HasForeignKey(x => x.DependsOnQuestionId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePlanning(ModelBuilder modelBuilder)
    {
        var request = modelBuilder.Entity<RoadmapRequest>();
        request.ToTable("roadmap_requests");
        request.Property(x => x.Status).HasColumnType("roadmap_request_status");
        request.HasIndex(x => new { x.StudentId, x.Status });
        request.HasOne(x => x.Student).WithMany(x => x.RoadmapRequests).HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);

        var answer = modelBuilder.Entity<QuestionAnswer>();
        answer.ToTable("question_answers");
        answer.Property(x => x.AnswerValue).HasColumnType("jsonb");
        answer.HasIndex(x => x.RoadmapRequestId);
        answer.HasIndex(x => new { x.RoadmapRequestId, x.QuestionId }).IsUnique();
        answer.HasOne(x => x.RoadmapRequest).WithMany(x => x.Answers).HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.Cascade);
        answer.HasOne(x => x.Question).WithMany(x => x.Answers).HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Restrict);

        var roadmap = modelBuilder.Entity<Roadmap>();
        roadmap.ToTable("roadmaps");
        roadmap.Property(x => x.Status).HasColumnType("roadmap_status");
        roadmap.HasOne(x => x.RoadmapRequest).WithMany(x => x.Roadmaps).HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.Restrict);
        roadmap.HasOne(x => x.Student).WithMany(x => x.Roadmaps).HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);

        var milestone = modelBuilder.Entity<Milestone>();
        milestone.ToTable("milestones");
        milestone.Property(x => x.Phase).HasColumnType("milestone_phase");
        milestone.Property(x => x.Status).HasColumnType("milestone_status");
        milestone.Property(x => x.EstimatedHours).HasPrecision(5, 2);
        milestone.HasIndex(x => new { x.RoadmapId, x.Status });
        milestone.HasIndex(x => x.DueDate);
        milestone.HasOne(x => x.Roadmap).WithMany(x => x.Milestones).HasForeignKey(x => x.RoadmapId).OnDelete(DeleteBehavior.Cascade);

        var history = modelBuilder.Entity<MilestoneStatusHistory>();
        history.ToTable("milestone_status_history");
        history.Property(x => x.OldStatus).HasColumnType("milestone_status");
        history.Property(x => x.NewStatus).HasColumnType("milestone_status");
        history.HasOne(x => x.Milestone).WithMany(x => x.StatusHistory).HasForeignKey(x => x.MilestoneId).OnDelete(DeleteBehavior.Cascade);
        history.HasOne(x => x.ChangedBy).WithMany(x => x.MilestoneStatusChanges).HasForeignKey(x => x.ChangedById).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureResources(ModelBuilder modelBuilder)
    {
        var resource = modelBuilder.Entity<Resource>();
        resource.ToTable("resources");
        resource.Property(x => x.ResourceType).HasColumnType("resource_type");
        resource.HasOne(x => x.AddedBy).WithMany(x => x.ResourcesAdded).HasForeignKey(x => x.AddedById).OnDelete(DeleteBehavior.Restrict);

        var tag = modelBuilder.Entity<Tag>();
        tag.ToTable("tags");
        tag.HasIndex(x => x.Name).IsUnique();
        tag.Property(x => x.Name).HasMaxLength(100).IsRequired();

        var resourceTag = modelBuilder.Entity<ResourceTag>();
        resourceTag.ToTable("resource_tags");
        resourceTag.HasIndex(x => x.TagId);
        resourceTag.HasIndex(x => new { x.ResourceId, x.TagId }).IsUnique();
        resourceTag.HasOne(x => x.Resource).WithMany(x => x.Tags).HasForeignKey(x => x.ResourceId).OnDelete(DeleteBehavior.Cascade);
        resourceTag.HasOne(x => x.Tag).WithMany(x => x.Resources).HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);

        var milestoneResource = modelBuilder.Entity<MilestoneResource>();
        milestoneResource.ToTable("milestone_resources");
        milestoneResource.Property(x => x.AttachedBy).HasColumnType("agent_name");
        milestoneResource.HasIndex(x => new { x.MilestoneId, x.ResourceId }).IsUnique();
        milestoneResource.HasOne(x => x.Milestone).WithMany(x => x.Resources).HasForeignKey(x => x.MilestoneId).OnDelete(DeleteBehavior.Cascade);
        milestoneResource.HasOne(x => x.Resource).WithMany(x => x.Milestones).HasForeignKey(x => x.ResourceId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureWorkflow(ModelBuilder modelBuilder)
    {
        var run = modelBuilder.Entity<AgentWorkflowRun>();
        run.ToTable("agent_workflow_runs");
        run.Property(x => x.Status).HasColumnType("workflow_run_status");
        run.HasIndex(x => x.Status);
        run.HasOne(x => x.RoadmapRequest).WithMany(x => x.WorkflowRuns).HasForeignKey(x => x.RoadmapRequestId).OnDelete(DeleteBehavior.Restrict);

        var step = modelBuilder.Entity<AgentStep>();
        step.ToTable("agent_steps");
        step.Property(x => x.AgentName).HasColumnType("agent_name");
        step.Property(x => x.Status).HasColumnType("agent_step_status");
        step.Property(x => x.InputPayload).HasColumnType("jsonb");
        step.Property(x => x.OutputPayload).HasColumnType("jsonb");
        step.HasIndex(x => new { x.WorkflowRunId, x.StepOrder });
        step.HasOne(x => x.WorkflowRun).WithMany(x => x.Steps).HasForeignKey(x => x.WorkflowRunId).OnDelete(DeleteBehavior.Cascade);

        var call = modelBuilder.Entity<ToolCall>();
        call.ToTable("tool_calls");
        call.Property(x => x.InputParams).HasColumnType("jsonb");
        call.Property(x => x.OutputResult).HasColumnType("jsonb");
        call.HasIndex(x => x.AgentStepId);
        call.HasOne(x => x.AgentStep).WithMany(x => x.ToolCalls).HasForeignKey(x => x.AgentStepId).OnDelete(DeleteBehavior.Cascade);

        var validation = modelBuilder.Entity<ValidationResult>();
        validation.ToTable("validation_results");
        validation.HasOne(x => x.WorkflowRun).WithMany(x => x.ValidationResults).HasForeignKey(x => x.WorkflowRunId).OnDelete(DeleteBehavior.Cascade);

        var approval = modelBuilder.Entity<ApprovalDecision>();
        approval.ToTable("approval_decisions");
        approval.Property(x => x.Decision).HasColumnType("approval_decision_type");
        approval.HasOne(x => x.WorkflowRun).WithMany(x => x.ApprovalDecisions).HasForeignKey(x => x.WorkflowRunId).OnDelete(DeleteBehavior.Restrict);
        approval.HasOne(x => x.Student).WithMany(x => x.ApprovalDecisions).HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureProgressAndGuidance(ModelBuilder modelBuilder)
    {
        var notification = modelBuilder.Entity<Notification>();
        notification.ToTable("notifications");
        notification.Property(x => x.NotificationType).HasColumnType("notification_type");
        notification.HasIndex(x => new { x.UserId, x.IsRead });
        notification.HasOne(x => x.User).WithMany(x => x.Notifications).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        notification.HasOne(x => x.RelatedMilestone).WithMany(x => x.Notifications).HasForeignKey(x => x.RelatedMilestoneId).OnDelete(DeleteBehavior.SetNull);

        var template = modelBuilder.Entity<GuidanceTemplate>();
        template.ToTable("guidance_templates");
        template.Property(x => x.TemplateType).HasColumnType("guidance_template_type");
        template.Property(x => x.ApplicableProjectTypes).HasColumnType("text[]");
        template.Property(x => x.Content).HasColumnType("jsonb");
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyAuditTimestamps();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyAuditTimestamps();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void ApplyAuditTimestamps()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries<AuditedEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
                entry.Property(x => x.CreatedAt).IsModified = false;
            }
        }
    }
}
