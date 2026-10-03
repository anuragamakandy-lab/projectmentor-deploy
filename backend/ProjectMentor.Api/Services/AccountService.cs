using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Account-level work shared by students and admins: profile, usage/activity, badges, notifications
/// and deleting an account together with everything that belongs to it.
/// </summary>
public sealed class AccountService(ProjectMentorDbContext db)
{
    /// <summary>Badges in order; admins award them, the usage score only suggests one.</summary>
    public static readonly string[] Badges = ["Silver", "Gold", "Premium", "Diamond"];

    public static string? SuggestedBadge(int score) =>
        score >= 400 ? "Diamond" : score >= 200 ? "Premium" : score >= 100 ? "Gold" : score >= 40 ? "Silver" : null;

    // ---------------------------------------------------------------- notifications

    /// <summary>Kinds that belong in the Community page; everything else goes to the navbar bell.</summary>
    public static readonly HashSet<string> CommunityKinds =
        ["Reaction", "Comment", "Reply", "CommentReaction", "Share", "FriendRequest", "FriendAccepted", "PostApproved", "PostRejected", "PagePost"];

    public async Task NotifyAsync(Guid userId, string kind, string title, string? body = null, string? link = null, CancellationToken ct = default, Guid? actorId = null)
    {
        db.UserNotifications.Add(new UserNotification
        {
            Id = Guid.NewGuid(), UserId = userId, Kind = kind, Title = Clip(title, 200)!, Body = Clip(body, 500), Link = Clip(link, 300),
            Scope = CommunityKinds.Contains(kind) ? "Community" : "System", ActorId = actorId,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task<NotificationsResponse> NotificationsAsync(Guid userId, CancellationToken ct, string scope = "System")
    {
        scope = scope == "Community" ? "Community" : "System";
        var rows = await db.UserNotifications.AsNoTracking().Where(n => n.UserId == userId && n.Scope == scope)
            .OrderByDescending(n => n.CreatedAt).Take(60).ToListAsync(ct);
        var actorIds = rows.Where(n => n.ActorId != null).Select(n => n.ActorId!.Value).Distinct().ToList();
        var actors = await db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id)).Select(u => new { u.Id, u.FullName, u.AvatarUploadId }).ToDictionaryAsync(u => u.Id, ct);
        var items = rows.Select(n =>
        {
            var a = n.ActorId is { } id && actors.TryGetValue(id, out var x) ? x : null;
            return new NotificationItem(n.Id, n.Kind, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt, n.Scope, n.ActorId, a?.AvatarUploadId, a is null ? null : GroupService.Initials(a.FullName));
        }).ToList();
        var counts = await db.UserNotifications.Where(n => n.UserId == userId && !n.IsRead).GroupBy(n => n.Scope)
            .Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        var sys = counts.GetValueOrDefault("System");
        var com = counts.GetValueOrDefault("Community");
        return new NotificationsResponse(items, scope == "Community" ? com : sys, sys, com);
    }

    public Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct, string? scope = null) =>
        db.UserNotifications.Where(n => n.UserId == userId && !n.IsRead && (scope == null || n.Scope == scope))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), ct);

    public Task<int> MarkReadAsync(Guid userId, Guid id, CancellationToken ct) =>
        db.UserNotifications.Where(n => n.UserId == userId && n.Id == id).ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), ct);

    // ---------------------------------------------------------------- usage, progress, activity

    public async Task<UsageResponse> UsageAsync(Guid userId, CancellationToken ct)
    {
        var requestIds = await db.RoadmapRequests.Where(r => r.StudentId == userId).Select(r => r.Id).ToListAsync(ct);
        var milestones = await db.Milestones.Where(m => m.Roadmap.StudentId == userId && m.Roadmap.Status == RoadmapStatus.Accepted)
            .Select(m => new { m.Status, m.Roadmap.RoadmapRequestId, m.DueDate }).ToListAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.Now);
        var done = milestones.Count(m => m.Status == MilestoneStatus.Done);
        var vivas = await db.VivaSessions.Where(v => v.StudentId == userId).Select(v => new { v.Status, v.ScorePercent }).ToListAsync(ct);
        var completedVivas = vivas.Where(v => v.Status == "Completed").ToList();
        var posts = await db.Posts.CountAsync(p => p.AuthorId == userId && p.Status == PostStatus.Approved, ct);
        var comments = await db.PostComments.CountAsync(c => c.AuthorId == userId, ct);
        var reactions = await db.PostLikes.CountAsync(l => l.Post.AuthorId == userId && l.UserId != userId, ct);
        var groups = await db.GroupMembers.CountAsync(m => m.UserId == userId, ct);
        var tasksDone = await db.BoardTasks.CountAsync(t => t.AssigneeId == userId && t.Status == "Done", ct);
        var messages = await db.GroupMessages.CountAsync(m => m.SenderId == userId, ct);

        var stats = new UsageStats(
            requestIds.Count, milestones.Count, done, milestones.Count == 0 ? 0 : (int)Math.Round(done * 100.0 / milestones.Count),
            vivas.Count, completedVivas.Count, completedVivas.Count == 0 ? null : (int)Math.Round(completedVivas.Average(v => v.ScorePercent ?? 0)),
            posts, comments, reactions, groups, tasksDone, messages);
        var score = stats.Roadmaps * 10 + stats.MilestonesDone * 6 + stats.VivasCompleted * 12 + stats.Posts * 5 + stats.Comments * 2
                    + stats.ReactionsReceived + stats.Groups * 8 + stats.TasksDone * 3 + Math.Min(stats.Messages, 100) / 5;

        // Progress of each accepted roadmap, for the "current progress" card.
        var titles = await db.RoadmapRequests.Where(r => r.StudentId == userId).Select(r => new { r.Id, r.Title }).ToDictionaryAsync(r => r.Id, r => r.Title, ct);
        var progress = milestones.GroupBy(m => m.RoadmapRequestId).Select(g => new RoadmapProgress(g.Key,
                titles.GetValueOrDefault(g.Key) ?? "Untitled project", g.Count(m => m.Status == MilestoneStatus.Done), g.Count(),
                g.Count(m => m.Status != MilestoneStatus.Done && m.DueDate < today)))
            .OrderByDescending(p => p.Total == 0 ? 0 : p.Done * 100 / p.Total).ToList();

        return new UsageResponse(stats, score, SuggestedBadge(score), progress, await ActivityAsync(userId, 25, ct));
    }

    async Task<IReadOnlyList<ActivityItem>> ActivityAsync(Guid userId, int take, CancellationToken ct)
    {
        var list = new List<ActivityItem>();
        list.AddRange(await db.RoadmapRequests.Where(r => r.StudentId == userId).OrderByDescending(r => r.CreatedAt).Take(take)
            .Select(r => new ActivityItem("Roadmap", "Started a project: " + (r.Title ?? "Untitled project"), $"/student/roadmaps/{r.Id}", r.CreatedAt)).ToListAsync(ct));
        list.AddRange(await db.MilestoneStatusHistory.Where(h => h.ChangedById == userId && h.NewStatus == MilestoneStatus.Done)
            .OrderByDescending(h => h.ChangedAt).Take(take)
            .Select(h => new ActivityItem("Milestone", "Completed milestone: " + h.Milestone.Title, null, h.ChangedAt)).ToListAsync(ct));
        list.AddRange(await db.VivaSessions.Where(v => v.StudentId == userId).OrderByDescending(v => v.CreatedAt).Take(take)
            .Select(v => new ActivityItem("Viva", v.Status == "Completed" ? $"Finished a mock viva ({v.ScorePercent}%): {v.Title}" : "Started a mock viva: " + v.Title,
                $"/student/viva/{v.Id}", v.CompletedAt ?? v.CreatedAt)).ToListAsync(ct));
        list.AddRange(await db.Posts.Where(p => p.AuthorId == userId).OrderByDescending(p => p.CreatedAt).Take(take)
            .Select(p => new ActivityItem("Post", (p.Status == PostStatus.Approved ? "Posted in the community: " : "Submitted a post: ") + (p.ProjectTitle ?? p.Content.Substring(0, Math.Min(60, p.Content.Length))),
                "/community", p.CreatedAt)).ToListAsync(ct));
        list.AddRange(await db.GroupMembers.Where(m => m.UserId == userId).OrderByDescending(m => m.JoinedAt).Take(take)
            .Select(m => new ActivityItem("Group", (m.Role == "Owner" ? "Created the group " : "Joined the group ") + m.Group.Name, $"/groups/{m.GroupId}", m.JoinedAt)).ToListAsync(ct));
        list.AddRange(await db.BoardTasks.Where(t => t.AssigneeId == userId && t.Status == "Done").OrderByDescending(t => t.UpdatedAt).Take(take)
            .Select(t => new ActivityItem("Task", "Finished a task: " + t.Title, $"/groups/{t.GroupId}", t.UpdatedAt)).ToListAsync(ct));
        return list.OrderByDescending(a => a.At).Take(take).ToList();
    }

    // ---------------------------------------------------------------- delete

    /// <summary>Deletes a user and all of their data in one transaction (roadmaps, groups they own, posts, vivas, ...).</summary>
    public async Task DeleteUserAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var requestIds = await db.RoadmapRequests.Where(r => r.StudentId == userId).Select(r => r.Id).ToListAsync(ct);

        await db.ApprovalDecisions.Where(a => a.StudentId == userId || requestIds.Contains(a.WorkflowRun.RoadmapRequestId)).ExecuteDeleteAsync(ct);
        await db.MilestoneStatusHistory.Where(h => h.ChangedById == userId || h.Milestone.Roadmap.StudentId == userId || requestIds.Contains(h.Milestone.Roadmap.RoadmapRequestId)).ExecuteDeleteAsync(ct);
        await db.MilestoneResources.Where(r => r.Milestone.Roadmap.StudentId == userId || requestIds.Contains(r.Milestone.Roadmap.RoadmapRequestId)).ExecuteDeleteAsync(ct);
        await db.Roadmaps.Where(r => r.StudentId == userId || requestIds.Contains(r.RoadmapRequestId)).ExecuteDeleteAsync(ct);
        await db.AgentWorkflowRuns.Where(r => requestIds.Contains(r.RoadmapRequestId)).ExecuteDeleteAsync(ct);
        await db.StudyGroups.Where(g => g.RoadmapRequestId != null && requestIds.Contains(g.RoadmapRequestId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(g => g.RoadmapRequestId, (Guid?)null), ct);
        await db.RoadmapRequests.Where(r => r.StudentId == userId).ExecuteDeleteAsync(ct);
        await db.StudyGroups.Where(g => g.OwnerId == userId).ExecuteDeleteAsync(ct);
        await db.Posts.Where(p => p.AuthorId == userId).ExecuteDeleteAsync(ct);
        await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);
    }

    static string? Clip(string? s, int max) => s is null ? null : s.Length > max ? s[..max] : s;
}
