using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// The group's weekly sprint board. Tasks move Todo → Doing → Done; when every task of a milestone is done
/// the shared roadmap's milestone is marked Done automatically (and In progress as soon as work starts).
/// Only group members can read or change the board.
/// </summary>
public sealed class BoardService(ProjectMentorDbContext db, GroupService groups, SprintPlannerAgent planner)
{
    private static readonly string[] Statuses = ["Todo", "Doing", "Done"];

    public async Task<BoardResponse?> GetAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        if (!await groups.IsMemberAsync(userId, groupId, ct)) return null;
        return await BuildAsync(groupId, ct);
    }

    public async Task<BoardResponse?> CreateAsync(Guid userId, Guid groupId, CreateTaskRequest body, CancellationToken ct)
    {
        if (!await groups.IsMemberAsync(userId, groupId, ct)) return null;
        var title = body?.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("Give the task a title.");
        var status = Statuses.Contains(body!.Status) ? body.Status! : "Todo";
        await ValidateRefsAsync(groupId, body.MilestoneId, body.AssigneeId, ct);

        var order = await db.BoardTasks.Where(t => t.GroupId == groupId && t.Status == status).Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? -1;
        var task = new BoardTask
        {
            Id = Guid.NewGuid(), GroupId = groupId, Title = Clip(title, 200), Description = ClipOrNull(body.Description, 2000),
            MilestoneId = body.MilestoneId, AssigneeId = body.AssigneeId, EstimateHours = Hours(body.EstimateHours),
            WeekStart = body.WeekStart is { } w ? SprintPlannerAgent.Monday(w) : SprintPlannerAgent.Monday(Today()),
            Status = status, SortOrder = order + 1, Source = "Manual", CreatedById = userId
        };
        if (status == "Done") { task.CompletedAt = DateTimeOffset.UtcNow; task.CompletedById = userId; }
        db.BoardTasks.Add(task);
        await db.SaveChangesAsync(ct);
        if (task.MilestoneId is { } mid) await SyncMilestoneAsync(groupId, mid, userId, ct);
        return await BuildAsync(groupId, ct);
    }

    public async Task<BoardResponse?> UpdateAsync(Guid userId, Guid groupId, Guid taskId, UpdateTaskRequest body, CancellationToken ct)
    {
        if (!await groups.IsMemberAsync(userId, groupId, ct)) return null;
        var task = await db.BoardTasks.SingleOrDefaultAsync(t => t.Id == taskId && t.GroupId == groupId, ct);
        if (task is null) return null;
        var oldMilestone = task.MilestoneId;
        var oldStatus = task.Status;

        if (body.Title is not null) { if (string.IsNullOrWhiteSpace(body.Title)) throw new ArgumentException("The title cannot be empty."); task.Title = Clip(body.Title, 200); }
        if (body.Description is not null) task.Description = ClipOrNull(body.Description, 2000);
        if (body.EstimateHours is not null) task.EstimateHours = Hours(body.EstimateHours);
        if (body.ClearWeek) task.WeekStart = null; else if (body.WeekStart is { } w) task.WeekStart = SprintPlannerAgent.Monday(w);
        if (body.ClearAssignee) task.AssigneeId = null;
        else if (body.AssigneeId is { } a) { await ValidateRefsAsync(groupId, null, a, ct); task.AssigneeId = a; }
        if (body.ClearMilestone) task.MilestoneId = null;
        else if (body.MilestoneId is { } m) { await ValidateRefsAsync(groupId, m, null, ct); task.MilestoneId = m; }

        var newStatus = body.Status is null ? task.Status : Statuses.Contains(body.Status) ? body.Status : throw new ArgumentException("Unknown status.");
        if (newStatus != oldStatus || body.SortOrder is not null)
        {
            // Re-number the destination column with this task inserted at the requested position.
            var column = await db.BoardTasks.Where(t => t.GroupId == groupId && t.Status == newStatus && t.Id != task.Id)
                .OrderBy(t => t.SortOrder).ThenBy(t => t.CreatedAt).ToListAsync(ct);
            var index = Math.Clamp(body.SortOrder ?? column.Count, 0, column.Count);
            column.Insert(index, task);
            for (var i = 0; i < column.Count; i++) column[i].SortOrder = i;
            task.Status = newStatus;
        }
        if (newStatus == "Done" && oldStatus != "Done") { task.CompletedAt = DateTimeOffset.UtcNow; task.CompletedById = userId; }
        if (newStatus != "Done") { task.CompletedAt = null; task.CompletedById = null; }

        await db.SaveChangesAsync(ct);
        foreach (var mid in new[] { oldMilestone, task.MilestoneId }.Where(x => x != null).Distinct())
            await SyncMilestoneAsync(groupId, mid!.Value, userId, ct);
        return await BuildAsync(groupId, ct);
    }

    public async Task<BoardResponse?> DeleteAsync(Guid userId, Guid groupId, Guid taskId, CancellationToken ct)
    {
        if (!await groups.IsMemberAsync(userId, groupId, ct)) return null;
        var task = await db.BoardTasks.SingleOrDefaultAsync(t => t.Id == taskId && t.GroupId == groupId, ct);
        if (task is null) return null;
        db.BoardTasks.Remove(task);
        await db.SaveChangesAsync(ct);
        if (task.MilestoneId is { } mid) await SyncMilestoneAsync(groupId, mid, userId, ct);
        return await BuildAsync(groupId, ct);
    }

    /// <summary>Ask the Sprint Planner agent to break milestones into tasks (one milestone, or every milestone that has none yet).</summary>
    public async Task<GenerateTasksResponse?> GenerateAsync(Guid userId, Guid groupId, GenerateTasksRequest body, CancellationToken ct)
    {
        if (!await groups.IsMemberAsync(userId, groupId, ct)) return null;
        var detail = await groups.GetAsync(userId, groupId, ct);
        if (detail!.RoadmapRequestId is null || detail.Milestones.Count == 0)
            throw new InvalidOperationException("Link a roadmap to this group first — the AI plans tasks from its milestones.");

        var withTasks = await db.BoardTasks.Where(t => t.GroupId == groupId && t.MilestoneId != null)
            .Select(t => t.MilestoneId!.Value).Distinct().ToListAsync(ct);
        var ordered = detail.Milestones.OrderBy(m => m.DueDate).ToList();
        var skipped = new List<string>();
        var targets = new List<MilestoneLite>();
        foreach (var m in ordered)
        {
            if (body?.MilestoneId is { } only && m.Id != only) continue;
            if (m.Status == "Done") { if (body?.MilestoneId is not null) skipped.Add($"{m.Title} (already done)"); continue; }
            if (body?.MilestoneId is null && withTasks.Contains(m.Id)) { skipped.Add($"{m.Title} (already has tasks)"); continue; }
            targets.Add(m);
        }
        if (targets.Count == 0)
            return new GenerateTasksResponse(0, "None", skipped, await BuildAsync(groupId, ct));

        var today = Today();
        var inputs = targets.Select(m =>
        {
            var idx = ordered.FindIndex(x => x.Id == m.Id);
            DateOnly? prev = idx > 0 ? ordered[idx - 1].DueDate : null;
            return new SprintPlannerAgent.MilestoneInput(m.Id, m.Title, m.Description, m.Phase, m.DueDate, SprintPlannerAgent.WindowFor(prev, m.DueDate, today));
        }).ToList();

        var plan = await planner.PlanAsync(inputs, detail.Members.Count, detail.HoursPerWeek, detail.RoadmapTitle ?? detail.Name, ct);

        // Balance work: give each task to the member with the fewest open hours so far.
        var load = detail.Members.ToDictionary(m => m.UserId, _ => 0m);
        var open = await db.BoardTasks.Where(t => t.GroupId == groupId && t.Status != "Done" && t.AssigneeId != null)
            .Select(t => new { t.AssigneeId, t.EstimateHours }).ToListAsync(ct);
        foreach (var o in open) if (load.ContainsKey(o.AssigneeId!.Value)) load[o.AssigneeId.Value] += o.EstimateHours ?? 2;

        var order = await db.BoardTasks.Where(t => t.GroupId == groupId && t.Status == "Todo").Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? -1;
        foreach (var p in plan.Tasks.OrderBy(t => t.Week))
        {
            Guid? assignee = null;
            if (body?.AssignEvenly != false && load.Count > 0)
            {
                assignee = load.OrderBy(kv => kv.Value).First().Key;
                load[assignee.Value] += p.Hours;
            }
            db.BoardTasks.Add(new BoardTask
            {
                Id = Guid.NewGuid(), GroupId = groupId, MilestoneId = p.MilestoneId, Title = p.Title, Description = p.Description,
                EstimateHours = p.Hours, WeekStart = p.Week, Status = "Todo", SortOrder = ++order, Source = plan.Source,
                AssigneeId = assignee, CreatedById = userId
            });
        }
        var who = await db.Users.Where(u => u.Id == userId).Select(u => u.FullName).SingleAsync(ct);
        db.GroupMessages.Add(GroupService.System(groupId, $"{who} planned {plan.Tasks.Count} tasks with the Sprint Planner ({(plan.Source == "AI" ? "AI" : "template")})."));
        await db.SaveChangesAsync(ct);
        return new GenerateTasksResponse(plan.Tasks.Count, plan.Source, skipped, await BuildAsync(groupId, ct));
    }

    // ---------- helpers ----------

    private async Task<BoardResponse> BuildAsync(Guid groupId, CancellationToken ct)
    {
        var members = await groups.MembersAsync(groupId, ct);
        var memberNames = members.ToDictionary(m => m.UserId);
        var group = await db.StudyGroups.AsNoTracking().SingleAsync(g => g.Id == groupId, ct);

        List<Milestone> milestones = [];
        decimal? hours = null;
        if (group.RoadmapRequestId is { } rid)
        {
            var request = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
                .Include(r => r.Answers).ThenInclude(a => a.Question)
                .Include(r => r.Roadmaps).ThenInclude(r => r.Milestones)
                .SingleOrDefaultAsync(r => r.Id == rid, ct);
            if (request is not null)
            {
                hours = GroupService.ReadDecimal(request, "hours_per_week");
                milestones = request.Roadmaps.OrderByDescending(r => r.Version).FirstOrDefault()?.Milestones.OrderBy(m => m.OrderIndex).ToList() ?? [];
            }
        }
        var milestoneMap = milestones.ToDictionary(m => m.Id);

        var tasks = await db.BoardTasks.AsNoTracking().Where(t => t.GroupId == groupId)
            .OrderBy(t => t.Status).ThenBy(t => t.SortOrder).ThenBy(t => t.CreatedAt).ToListAsync(ct);
        var completerIds = tasks.Where(t => t.CompletedById != null).Select(t => t.CompletedById!.Value).Distinct().ToList();
        var completers = await db.Users.AsNoTracking().Where(u => completerIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, ct);

        var taskResponses = tasks.Select(t =>
        {
            var ms = t.MilestoneId is { } id && milestoneMap.TryGetValue(id, out var m) ? m : null;
            var who = t.AssigneeId is { } a && memberNames.TryGetValue(a, out var mm) ? mm : null;
            return new TaskResponse(t.Id, t.MilestoneId, ms?.Title, ms?.Phase.ToString(), t.Title, t.Description, t.Status,
                who?.UserId, who?.FullName, who?.Initials, t.EstimateHours, t.WeekStart, t.SortOrder, t.Source, t.CreatedAt,
                t.CompletedAt, t.CompletedById is { } c && completers.TryGetValue(c, out var n) ? n : null);
        }).ToList();

        var progress = milestones.Select(m => new MilestoneProgress(m.Id, m.Title, m.Phase.ToString(), m.DueDate, m.Status.ToString(),
            tasks.Count(t => t.MilestoneId == m.Id), tasks.Count(t => t.MilestoneId == m.Id && t.Status == "Done"))).ToList();

        // Contribution record: tasks and hours completed by each member, plus chat activity.
        var messages = await db.GroupMessages.AsNoTracking().Where(m => m.GroupId == groupId && m.SenderId != null)
            .GroupBy(m => m.SenderId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var totalDoneHours = tasks.Where(t => t.Status == "Done").Sum(t => t.EstimateHours ?? 1);
        var contributions = members.Select(m =>
        {
            var done = tasks.Where(t => t.Status == "Done" && (t.CompletedById ?? t.AssigneeId) == m.UserId).ToList();
            var hoursDone = done.Sum(t => t.EstimateHours ?? 1);
            return new ContributionRow(m.UserId, m.FullName, m.Initials, tasks.Count(t => t.AssigneeId == m.UserId), done.Count, hoursDone,
                messages.GetValueOrDefault(m.UserId), totalDoneHours == 0 ? 0 : (int)Math.Round(hoursDone * 100 / totalDoneHours));
        }).ToList();

        return new BoardResponse(taskResponses, progress, members, SprintPlannerAgent.Monday(Today()),
            hours is > 0 ? hours * members.Count : null, contributions);
    }

    /// <summary>Keep the shared roadmap in step with the board.</summary>
    private async Task SyncMilestoneAsync(Guid groupId, Guid milestoneId, Guid userId, CancellationToken ct)
    {
        var milestone = await db.Milestones.SingleOrDefaultAsync(m => m.Id == milestoneId, ct);
        if (milestone is null) return;
        var statuses = await db.BoardTasks.Where(t => t.GroupId == groupId && t.MilestoneId == milestoneId).Select(t => t.Status).ToListAsync(ct);
        if (statuses.Count == 0) return;

        MilestoneStatus? target =
            statuses.All(s => s == "Done") ? MilestoneStatus.Done :
            statuses.Any(s => s is "Doing" or "Done") ? MilestoneStatus.InProgress :
            milestone.Status == MilestoneStatus.Done ? MilestoneStatus.InProgress : null; // a task was re-opened
        if (target is null || target == milestone.Status || (milestone.Status == MilestoneStatus.Blocked && target != MilestoneStatus.Done)) return;

        db.MilestoneStatusHistory.Add(new MilestoneStatusHistory
        {
            Id = Guid.NewGuid(), MilestoneId = milestone.Id, OldStatus = milestone.Status, NewStatus = target.Value,
            ChangedById = userId, ChangedAt = DateTimeOffset.UtcNow
        });
        milestone.Status = target.Value;
        if (target == MilestoneStatus.Done)
            db.GroupMessages.Add(GroupService.System(groupId, $"Milestone completed: {milestone.Title}"));
        await db.SaveChangesAsync(ct);
    }

    private async Task ValidateRefsAsync(Guid groupId, Guid? milestoneId, Guid? assigneeId, CancellationToken ct)
    {
        if (assigneeId is { } a && !await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == a, ct))
            throw new ArgumentException("You can only assign tasks to group members.");
        if (milestoneId is { } mid)
        {
            var rid = await db.StudyGroups.Where(g => g.Id == groupId).Select(g => g.RoadmapRequestId).SingleAsync(ct);
            var ok = rid is not null && await db.Milestones.AnyAsync(m => m.Id == mid && m.Roadmap.RoadmapRequestId == rid, ct);
            if (!ok) throw new ArgumentException("That milestone is not part of this group's roadmap.");
        }
    }

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);
    private static decimal? Hours(decimal? h) => h is null ? null : Math.Clamp(Math.Round(h.Value * 2) / 2, 0.5m, 40m);
    private static string Clip(string s, int max) { var v = s.Trim(); return v.Length <= max ? v : v[..max]; }
    private static string? ClipOrNull(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : Clip(s, max);
}
