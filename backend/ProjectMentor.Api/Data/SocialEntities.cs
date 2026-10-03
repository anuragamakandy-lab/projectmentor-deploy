using Microsoft.EntityFrameworkCore;

namespace ProjectMentor.Data;

// ---------------- Community friends, page follows, comment reactions ----------------

public static class FriendStatus
{
    public const string Pending = "Pending";
    public const string Accepted = "Accepted";
}

/// <summary>A friend request; once accepted the two users are friends. One row per pair.</summary>
public sealed class Friendship : AuditedEntity
{
    public Guid RequesterId { get; set; }
    public Guid AddresseeId { get; set; }
    public string Status { get; set; } = FriendStatus.Pending;
    public DateTimeOffset? RespondedAt { get; set; }
}

/// <summary>A student following the official ProjectMentor page.</summary>
public sealed class PageFollow : AuditedEntity
{
    public Guid UserId { get; set; }
    public Guid PageUserId { get; set; }
}

public sealed class CommentReaction : AuditedEntity
{
    public Guid CommentId { get; set; }
    public Guid UserId { get; set; }
    public string Reaction { get; set; } = "Like";
}

// ---------------- System settings, email, support, password reset ----------------

/// <summary>One admin-editable setting (API keys, addresses, email switches). Secret values are stored encrypted.</summary>
public sealed class SystemSetting : AuditedEntity
{
    public string Key { get; set; } = null!;
    public string? Value { get; set; }
}

public sealed class EmailLog : AuditedEntity
{
    public string ToEmail { get; set; } = null!;
    public string? ToName { get; set; }
    public string Subject { get; set; } = null!;
    /// <summary>Welcome | PasswordReset | DueSoon | Overdue | AccountStatus | Support | Custom | Announcement | SupportReply</summary>
    public string Kind { get; set; } = null!;
    public string Status { get; set; } = "Sent";  // Sent | Failed | Skipped
    public string? Error { get; set; }
    /// <summary>Stops the same automatic email being sent twice (e.g. "overdue:{milestoneId}").</summary>
    public string? DedupeKey { get; set; }
    public Guid? SentById { get; set; }
}

/// <summary>A message to the admins, e.g. from a student whose account was deactivated.</summary>
public sealed class SupportRequest : AuditedEntity
{
    public Guid? UserId { get; set; }
    public string Name { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Subject { get; set; } = null!;
    public string Message { get; set; } = null!;
    public string Status { get; set; } = "Open";   // Open | Replied | Closed
    public string? Reply { get; set; }
    public DateTimeOffset? RepliedAt { get; set; }
}

public sealed class PasswordResetCode : AuditedEntity
{
    public Guid UserId { get; set; }
    public string CodeHash { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public int Attempts { get; set; }
}

public sealed class ResourceBookmark : AuditedEntity
{
    public Guid UserId { get; set; }
    public Guid ResourceId { get; set; }
}

public static class SocialModel
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        var friend = modelBuilder.Entity<Friendship>();
        friend.ToTable("friendships");
        friend.Property(x => x.Status).HasMaxLength(20).IsRequired();
        friend.HasIndex(x => new { x.RequesterId, x.AddresseeId }).IsUnique();
        friend.HasIndex(x => x.AddresseeId);
        friend.HasOne<User>().WithMany().HasForeignKey(x => x.RequesterId).OnDelete(DeleteBehavior.Cascade);
        friend.HasOne<User>().WithMany().HasForeignKey(x => x.AddresseeId).OnDelete(DeleteBehavior.Cascade);

        var follow = modelBuilder.Entity<PageFollow>();
        follow.ToTable("page_follows");
        follow.HasIndex(x => new { x.UserId, x.PageUserId }).IsUnique();
        follow.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        follow.HasOne<User>().WithMany().HasForeignKey(x => x.PageUserId).OnDelete(DeleteBehavior.Cascade);

        var cr = modelBuilder.Entity<CommentReaction>();
        cr.ToTable("comment_reactions");
        cr.Property(x => x.Reaction).HasMaxLength(20).IsRequired();
        cr.HasIndex(x => new { x.CommentId, x.UserId }).IsUnique();
        cr.HasOne<PostComment>().WithMany().HasForeignKey(x => x.CommentId).OnDelete(DeleteBehavior.Cascade);
        cr.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        var setting = modelBuilder.Entity<SystemSetting>();
        setting.ToTable("system_settings");
        setting.Property(x => x.Key).HasMaxLength(80).IsRequired();
        setting.HasIndex(x => x.Key).IsUnique();

        var mail = modelBuilder.Entity<EmailLog>();
        mail.ToTable("email_logs");
        mail.Property(x => x.ToEmail).HasMaxLength(320).IsRequired();
        mail.Property(x => x.ToName).HasMaxLength(200);
        mail.Property(x => x.Subject).HasMaxLength(300).IsRequired();
        mail.Property(x => x.Kind).HasMaxLength(30).IsRequired();
        mail.Property(x => x.Status).HasMaxLength(20).IsRequired();
        mail.Property(x => x.Error).HasMaxLength(1000);
        mail.Property(x => x.DedupeKey).HasMaxLength(120);
        mail.HasIndex(x => x.DedupeKey).IsUnique().HasFilter("\"DedupeKey\" IS NOT NULL");
        mail.HasIndex(x => x.CreatedAt);

        var support = modelBuilder.Entity<SupportRequest>();
        support.ToTable("support_requests");
        support.Property(x => x.Name).HasMaxLength(200).IsRequired();
        support.Property(x => x.Email).HasMaxLength(320).IsRequired();
        support.Property(x => x.Subject).HasMaxLength(200).IsRequired();
        support.Property(x => x.Message).HasMaxLength(4000).IsRequired();
        support.Property(x => x.Status).HasMaxLength(20).IsRequired();
        support.Property(x => x.Reply).HasMaxLength(4000);
        support.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

        var reset = modelBuilder.Entity<PasswordResetCode>();
        reset.ToTable("password_reset_codes");
        reset.Property(x => x.CodeHash).HasMaxLength(100).IsRequired();
        reset.HasIndex(x => x.UserId);
        reset.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        var bm = modelBuilder.Entity<ResourceBookmark>();
        bm.ToTable("resource_bookmarks");
        bm.HasIndex(x => new { x.UserId, x.ResourceId }).IsUnique();
        bm.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        bm.HasOne<Resource>().WithMany().HasForeignKey(x => x.ResourceId).OnDelete(DeleteBehavior.Cascade);

        // New columns on existing tables.
        modelBuilder.Entity<RoadmapRequest>().Property(x => x.Description).HasMaxLength(2000);
        var user = modelBuilder.Entity<User>();
        user.Property(x => x.DeactivationReason).HasMaxLength(500);
        user.Property(x => x.University).HasMaxLength(200);
        user.Property(x => x.Degree).HasMaxLength(200);
        user.Property(x => x.Location).HasMaxLength(120);
        user.Property(x => x.Skills).HasMaxLength(500);
        user.Property(x => x.GithubUrl).HasMaxLength(300);
        user.Property(x => x.LinkedinUrl).HasMaxLength(300);
        user.Property(x => x.Website).HasMaxLength(300);
        user.Property(x => x.VisibilityJson).HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'{}'::jsonb");
        user.Property(x => x.BirthdayShowYear).HasDefaultValue(true);

        var post = modelBuilder.Entity<Post>();
        post.Property(x => x.Visibility).HasMaxLength(20).IsRequired().HasDefaultValue("Public");
        post.HasOne<Post>().WithMany().HasForeignKey(x => x.SharedPostId).OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<PostComment>().HasOne<PostComment>().WithMany().HasForeignKey(x => x.ParentCommentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<UserNotification>().Property(x => x.Scope).HasMaxLength(20).IsRequired().HasDefaultValue("System");

        var resource = modelBuilder.Entity<Resource>();
        resource.Property(x => x.Level).HasMaxLength(20).IsRequired().HasDefaultValue("Beginner");
        resource.Property(x => x.Duration).HasMaxLength(40);
        resource.Property(x => x.Price).HasMaxLength(60);
        resource.Property(x => x.Provider).HasMaxLength(80);
        resource.Property(x => x.IsFree).HasDefaultValue(true);
    }
}
