using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Private project groups: create, invite (GitHub-style link), join, manage members and chat.
/// Every read and write checks that the caller is a member; owner-only actions check the role too.
/// </summary>
public sealed class GroupService(ProjectMentorDbContext db)
{
    public const int MaxMembers = 12;
    private static readonly string[] Colors = ["#0e7a52", "#2f7fd1", "#6b5bd2", "#c2573a", "#a9832b", "#0f8a95", "#b23a6f", "#3d7a2a"];

    public static string Initials(string? name)
    {
        var parts = (name ?? "?").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            0 => "?",
            1 => parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant(),
            _ => $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[^1][0])}"
        };
    }

    // ---------- membership helpers ----------

    public Task<GroupMember?> MembershipAsync(Guid userId, Guid groupId, CancellationToken ct) =>
        db.GroupMembers.AsNoTracking().SingleOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId, ct);

    public async Task<bool> IsMemberAsync(Guid userId, Guid groupId, CancellationToken ct) =>
        await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == userId, ct);

    // ---------- groups ----------

    public async Task<IReadOnlyList<GroupSummary>> ListAsync(Guid userId, CancellationToken ct)
    {
        var groups = await db.GroupMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .Select(m => new { m.Role, Group = m.Group })
            .ToListAsync(ct);
        var ids = groups.Select(g => g.Group.Id).ToList();

        var members = await db.GroupMembers.AsNoTracking().Where(m => ids.Contains(m.GroupId))
            .Select(m => new { m.GroupId, m.User.FullName, m.JoinedAt }).ToListAsync(ct);
        var tasks = await db.BoardTasks.AsNoTracking().Where(t => ids.Contains(t.GroupId))
            .GroupBy(t => t.GroupId).Select(g => new { GroupId = g.Key, Open = g.Count(t => t.Status != "Done"), Done = g.Count(t => t.Status == "Done") })
            .ToListAsync(ct);
        var lastMessages = new List<GroupMessage>();
        foreach (var id in ids) // a student is in a handful of groups, so one small query each is fine
        {
            var last = await db.GroupMessages.AsNoTracking().Where(m => m.GroupId == id)
                .OrderByDescending(m => m.CreatedAt).FirstOrDefaultAsync(ct);
            if (last is not null) lastMessages.Add(last);
        }
        var roadmapIds = groups.Where(g => g.Group.RoadmapRequestId != null).Select(g => g.Group.RoadmapRequestId!.Value).ToList();
        var roadmapTitles = await db.RoadmapRequests.AsNoTracking().Where(r => roadmapIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.Title, ct);

        return groups.Select(g =>
        {
            var mem = members.Where(m => m.GroupId == g.Group.Id).OrderBy(m => m.JoinedAt).ToList();
            var t = tasks.FirstOrDefault(x => x.GroupId == g.Group.Id);
            var last = lastMessages.FirstOrDefault(x => x.GroupId == g.Group.Id);
            return new GroupSummary(g.Group.Id, g.Group.Name, g.Group.Description, g.Group.Color, g.Role, mem.Count,
                mem.Take(5).Select(m => Initials(m.FullName)).ToList(),
                g.Group.RoadmapRequestId is { } rid && roadmapTitles.TryGetValue(rid, out var title) ? title ?? "Untitled roadmap" : null,
                t?.Open ?? 0, t?.Done ?? 0, last?.CreatedAt, last is null ? null : Preview(last.Content), g.Group.CreatedAt);
        }).OrderByDescending(g => g.LastMessageAt ?? g.CreatedAt).ToList();
    }

    public async Task<GroupDetail?> GetAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        var me = await MembershipAsync(userId, groupId, ct);
        if (me is null) return null;
        var group = await db.StudyGroups.AsNoTracking().SingleAsync(g => g.Id == groupId, ct);
        var members = await MembersAsync(groupId, ct);

        string? roadmapTitle = null; decimal? hours = null; DateOnly? deadline = null;
        IReadOnlyList<MilestoneLite> milestones = [];
        if (group.RoadmapRequestId is { } rid)
        {
            var request = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
                .Include(r => r.Answers).ThenInclude(a => a.Question)
                .Include(r => r.Roadmaps).ThenInclude(r => r.Milestones)
                .SingleOrDefaultAsync(r => r.Id == rid, ct);
            if (request is not null)
            {
                roadmapTitle = request.Title ?? "Untitled roadmap";
                hours = ReadDecimal(request, "hours_per_week");
                deadline = DateOnly.TryParse(ReadString(request, "deadline"), out var d) ? d : null;
                var roadmap = request.Roadmaps.OrderByDescending(r => r.Version).FirstOrDefault();
                milestones = roadmap?.Milestones.OrderBy(m => m.OrderIndex)
                    .Select(m => new MilestoneLite(m.Id, m.Title, m.Description, m.Phase.ToString(), m.DueDate, m.Status.ToString())).ToList() ?? [];
            }
        }

        return new GroupDetail(group.Id, group.Name, group.Description, group.Color, group.OwnerId, me.Role,
            group.RoadmapRequestId, roadmapTitle, hours, deadline, members, milestones, group.CreatedAt);
    }

    public async Task<GroupDetail> CreateAsync(Guid userId, CreateGroupRequest body, CancellationToken ct)
    {
        var name = body?.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Give your group a name.");
        if (name.Length > 120) name = name[..120];
        if (body!.RoadmapRequestId is { } rid && !await db.RoadmapRequests.AnyAsync(r => r.Id == rid && r.StudentId == userId, ct))
            throw new ArgumentException("You can only share one of your own roadmaps.");

        var count = await db.StudyGroups.CountAsync(ct);
        var group = new StudyGroup
        {
            Id = Guid.NewGuid(), Name = name, Description = Clip(body.Description, 1000), OwnerId = userId,
            RoadmapRequestId = body.RoadmapRequestId, Color = Colors[count % Colors.Length]
        };
        db.StudyGroups.Add(group);
        db.GroupMembers.Add(new GroupMember { Id = Guid.NewGuid(), GroupId = group.Id, UserId = userId, Role = "Owner", JoinedAt = DateTimeOffset.UtcNow });
        db.GroupMessages.Add(System(group.Id, $"Group created. Share the invite link so your teammates can join."));
        await db.SaveChangesAsync(ct);
        return (await GetAsync(userId, group.Id, ct))!;
    }

    public async Task<GroupDetail?> UpdateAsync(Guid userId, Guid groupId, UpdateGroupRequest body, CancellationToken ct)
    {
        var me = await MembershipAsync(userId, groupId, ct);
        if (me is null) return null;
        if (me.Role != "Owner") throw new UnauthorizedAccessException("Only the group owner can change group settings.");
        var group = await db.StudyGroups.SingleAsync(g => g.Id == groupId, ct);

        if (!string.IsNullOrWhiteSpace(body.Name)) group.Name = Clip(body.Name, 120)!;
        if (body.Description is not null) group.Description = Clip(body.Description, 1000);
        if (body.ClearRoadmap) group.RoadmapRequestId = null;
        else if (body.RoadmapRequestId is { } rid)
        {
            if (!await db.RoadmapRequests.AnyAsync(r => r.Id == rid && r.StudentId == userId, ct))
                throw new ArgumentException("You can only share one of your own roadmaps.");
            if (group.RoadmapRequestId != rid)
            {
                group.RoadmapRequestId = rid;
                db.GroupMessages.Add(System(groupId, "The shared roadmap was changed."));
            }
        }
        await db.SaveChangesAsync(ct);
        return await GetAsync(userId, groupId, ct);
    }

    public async Task<bool> DeleteAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        var me = await MembershipAsync(userId, groupId, ct);
        if (me is null) return false;
        if (me.Role != "Owner") throw new UnauthorizedAccessException("Only the group owner can delete the group.");
        await db.StudyGroups.Where(g => g.Id == groupId).ExecuteDeleteAsync(ct); // members, invites, chat and tasks cascade
        return true;
    }

    public async Task<bool> LeaveAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        var me = await db.GroupMembers.Include(m => m.User).SingleOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId, ct);
        if (me is null) return false;
        if (me.Role == "Owner") throw new InvalidOperationException("The owner cannot leave. Delete the group instead, or remove other members first.");
        await UnassignAsync(groupId, userId, ct);
        db.GroupMembers.Remove(me);
        db.GroupMessages.Add(System(groupId, $"{me.User.FullName} left the group."));
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> RemoveMemberAsync(Guid userId, Guid groupId, Guid memberId, CancellationToken ct)
    {
        var me = await MembershipAsync(userId, groupId, ct);
        if (me is null) return false;
        if (me.Role != "Owner") throw new UnauthorizedAccessException("Only the group owner can remove members.");
        if (memberId == userId) throw new InvalidOperationException("You cannot remove yourself.");
        var target = await db.GroupMembers.Include(m => m.User).SingleOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberId, ct);
        if (target is null) return false;
        await UnassignAsync(groupId, memberId, ct);
        db.GroupMembers.Remove(target);
        db.GroupMessages.Add(System(groupId, $"{target.User.FullName} was removed from the group."));
        await db.SaveChangesAsync(ct);
        return true;
    }

    private Task UnassignAsync(Guid groupId, Guid userId, CancellationToken ct) =>
        db.BoardTasks.Where(t => t.GroupId == groupId && t.AssigneeId == userId && t.Status != "Done")
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (Guid?)null), ct);

    // ---------- invitations ----------

    public async Task<IReadOnlyList<InviteResponse>?> ListInvitesAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        if (!await IsMemberAsync(userId, groupId, ct)) return null;
        var now = DateTimeOffset.UtcNow;
        return await db.GroupInvites.AsNoTracking().Where(i => i.GroupId == groupId && !i.Revoked)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new InviteResponse(i.Id, i.Token, i.ExpiresAt, i.MaxUses, i.Uses,
                i.ExpiresAt > now && (i.MaxUses == null || i.Uses < i.MaxUses)))
            .ToListAsync(ct);
    }

    public async Task<InviteResponse?> CreateInviteAsync(Guid userId, Guid groupId, CreateInviteRequest body, CancellationToken ct)
    {
        if (!await IsMemberAsync(userId, groupId, ct)) return null;
        var days = Math.Clamp(body?.ExpiresInDays ?? 7, 1, 30);
        int? maxUses = body?.MaxUses is > 0 ? Math.Min(body.MaxUses.Value, MaxMembers) : null;
        var invite = new GroupInvite
        {
            Id = Guid.NewGuid(), GroupId = groupId, CreatedById = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+', '-').Replace('/', '_').TrimEnd('='),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(days), MaxUses = maxUses
        };
        db.GroupInvites.Add(invite);
        await db.SaveChangesAsync(ct);
        return new InviteResponse(invite.Id, invite.Token, invite.ExpiresAt, invite.MaxUses, 0, true);
    }

    public async Task<bool> RevokeInviteAsync(Guid userId, Guid groupId, Guid inviteId, CancellationToken ct)
    {
        if (!await IsMemberAsync(userId, groupId, ct)) return false;
        return await db.GroupInvites.Where(i => i.Id == inviteId && i.GroupId == groupId)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.Revoked, true), ct) > 0;
    }

    public async Task<InvitePreview> PreviewInviteAsync(Guid userId, string token, CancellationToken ct)
    {
        var invite = await db.GroupInvites.AsNoTracking().Include(i => i.Group).SingleOrDefaultAsync(i => i.Token == token, ct);
        var problem = InviteProblem(invite);
        if (invite is null) return new InvitePreview(false, problem, null, null, null, null, null, 0, false);

        var owner = await db.Users.AsNoTracking().Where(u => u.Id == invite.Group.OwnerId).Select(u => u.FullName).SingleOrDefaultAsync(ct);
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == invite.GroupId, ct);
        var already = await IsMemberAsync(userId, invite.GroupId, ct);
        if (problem is null && count >= MaxMembers && !already) problem = $"This group is full ({MaxMembers} members).";
        return new InvitePreview(problem is null || already, already ? null : problem, invite.GroupId, invite.Group.Name,
            invite.Group.Description, invite.Group.Color, owner, count, already);
    }

    public async Task<Guid> JoinAsync(Guid userId, string token, CancellationToken ct)
    {
        var invite = await db.GroupInvites.Include(i => i.Group).SingleOrDefaultAsync(i => i.Token == token, ct);
        if (invite is not null && await IsMemberAsync(userId, invite.GroupId, ct)) return invite.GroupId;
        var problem = InviteProblem(invite);
        if (problem is not null) throw new InvalidOperationException(problem);
        if (await db.GroupMembers.CountAsync(m => m.GroupId == invite!.GroupId, ct) >= MaxMembers)
            throw new InvalidOperationException($"This group is full ({MaxMembers} members).");

        var user = await db.Users.SingleAsync(u => u.Id == userId, ct);
        if (user.Role != UserRole.Student) throw new InvalidOperationException("Only student accounts can join project groups.");

        invite!.Uses++;
        db.GroupMembers.Add(new GroupMember { Id = Guid.NewGuid(), GroupId = invite.GroupId, UserId = userId, Role = "Member", JoinedAt = DateTimeOffset.UtcNow });
        db.GroupMessages.Add(System(invite.GroupId, $"{user.FullName} joined the group."));
        await db.SaveChangesAsync(ct);
        return invite.GroupId;
    }

    private static string? InviteProblem(GroupInvite? invite) =>
        invite is null ? "This invite link is not valid. Ask your teammate for a new one." :
        invite.Revoked ? "This invite link was turned off by the group. Ask for a new one." :
        invite.ExpiresAt <= DateTimeOffset.UtcNow ? "This invite link has expired. Ask your teammate for a new one." :
        invite.MaxUses is { } max && invite.Uses >= max ? "This invite link has already been used the maximum number of times." : null;

    // ---------- chat ----------

    public async Task<IReadOnlyList<MessageResponse>?> MessagesAsync(Guid userId, Guid groupId, DateTimeOffset? after, CancellationToken ct)
    {
        if (!await IsMemberAsync(userId, groupId, ct)) return null;
        var query = db.GroupMessages.AsNoTracking().Include(m => m.Sender).Where(m => m.GroupId == groupId);
        List<GroupMessage> list;
        if (after is { } a)
            list = await query.Where(m => m.CreatedAt > a).OrderBy(m => m.CreatedAt).Take(200).ToListAsync(ct);
        else
            list = (await query.OrderByDescending(m => m.CreatedAt).Take(150).ToListAsync(ct)).OrderBy(m => m.CreatedAt).ToList();
        var uploads = await UploadInfosAsync(list.Where(m => m.UploadId != null).Select(m => m.UploadId!.Value), ct);
        return list.Select(m => ToResponse(m, uploads)).ToList();
    }

    public async Task<MessageResponse?> SendAsync(Guid userId, Guid groupId, SendMessageRequest body, CancellationToken ct)
    {
        if (!await IsMemberAsync(userId, groupId, ct)) return null;
        var text = body?.Content?.Trim() ?? "";
        if (text.Length == 0 && body?.UploadId is null) throw new ArgumentException("Write a message first.");
        if (text.Length > 4000) text = text[..4000];
        if (body?.UploadId is { } uid && !await db.Uploads.AnyAsync(u => u.Id == uid && u.OwnerId == userId, ct))
            throw new ArgumentException("That attachment was not found.");

        var message = new GroupMessage { Id = Guid.NewGuid(), GroupId = groupId, SenderId = userId, Content = text, UploadId = body?.UploadId };
        db.GroupMessages.Add(message);
        await db.SaveChangesAsync(ct);
        message.Sender = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId, ct);
        return ToResponse(message, await UploadInfosAsync(message.UploadId is { } x ? [x] : [], ct));
    }

    // ---------- helpers ----------

    public async Task<IReadOnlyList<GroupMemberResponse>> MembersAsync(Guid groupId, CancellationToken ct) =>
        (await db.GroupMembers.AsNoTracking().Where(m => m.GroupId == groupId).Include(m => m.User)
            .OrderBy(m => m.Role == "Owner" ? 0 : 1).ThenBy(m => m.JoinedAt).ToListAsync(ct))
        .Select(m => new GroupMemberResponse(m.UserId, m.User.FullName, Initials(m.User.FullName), m.Role, m.JoinedAt)).ToList();

    private async Task<Dictionary<Guid, UploadInfo>> UploadInfosAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return [];
        return await db.Uploads.AsNoTracking().Where(u => list.Contains(u.Id))
            .Select(u => new UploadInfo(u.Id, u.FileName, u.ContentType, u.Size)).ToDictionaryAsync(u => u.Id, ct);
    }

    private static MessageResponse ToResponse(GroupMessage m, Dictionary<Guid, UploadInfo> uploads) =>
        new(m.Id, m.SenderId, m.Sender?.FullName, m.Sender is null ? null : Initials(m.Sender.FullName), m.Content,
            m.UploadId is { } u && uploads.TryGetValue(u, out var info) ? info : null, m.CreatedAt, m.SenderId is null);

    public static GroupMessage System(Guid groupId, string text) =>
        new() { Id = Guid.NewGuid(), GroupId = groupId, SenderId = null, Content = text };

    private static string Preview(string text) => text.Length <= 70 ? text : text[..70] + "…";

    private static string? Clip(string? s, int max)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var t = s.Trim();
        return t.Length <= max ? t : t[..max];
    }

    private static JsonElement? Answer(RoadmapRequest r, string code) =>
        r.Answers.FirstOrDefault(a => a.Question.Code == code)?.AnswerValue.RootElement;

    public static string? ReadString(RoadmapRequest r, string code) =>
        Answer(r, code) is { } el ? (el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText()) : null;

    public static decimal? ReadDecimal(RoadmapRequest r, string code) =>
        Answer(r, code) is { ValueKind: JsonValueKind.Number } el ? el.GetDecimal() : null;
}
