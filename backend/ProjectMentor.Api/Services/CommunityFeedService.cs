using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// The community, built to work like Facebook: a feed with Public / Friends / Only me posts, sharing posts to the feed,
/// reactions on posts and comments, comment replies and edits, friend requests, the official ProjectMentor page and
/// community notifications. Student posts wait for an admin to approve them. Deactivated accounts are hidden everywhere.
/// A viewer id of <see cref="Guid.Empty"/> is a logged-out visitor, who sees public posts only.
/// </summary>
public sealed class CommunityService(ProjectMentorDbContext db, AccountService accounts)
{
    public static readonly string[] Kinds = ["Showcase", "Update", "Question", "Report", "Idea"];
    public static readonly string[] Reactions = ["Like", "Love", "Care", "Haha", "Excellent", "Angry"];
    public static readonly string[] Visibilities = ["Public", "Friends", "OnlyMe"];
    private const int PageSize = 10;

    // ---------------------------------------------------------------- relationships

    public Task<List<Guid>> FriendIdsAsync(Guid userId, CancellationToken ct) =>
        db.Friendships.Where(f => f.Status == FriendStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId).ToListAsync(ct);

    public Task<Guid> PageIdAsync(CancellationToken ct) => db.Users.Where(u => u.IsOfficial).Select(u => u.Id).FirstOrDefaultAsync(ct);

    async Task<string> RelationshipAsync(Guid me, Guid other, CancellationToken ct)
    {
        if (me == other) return "Self";
        if (me == Guid.Empty) return "None";
        var f = await db.Friendships.AsNoTracking().FirstOrDefaultAsync(x =>
            (x.RequesterId == me && x.AddresseeId == other) || (x.RequesterId == other && x.AddresseeId == me), ct);
        if (f is null) return "None";
        if (f.Status == FriendStatus.Accepted) return "Friends";
        return f.RequesterId == me ? "RequestSent" : "RequestReceived";
    }

    /// <summary>Posts this viewer may see (approved, active author, allowed by the post's audience).</summary>
    IQueryable<Post> Visible(Guid viewer, bool isAdmin, List<Guid> friends) =>
        db.Posts.AsNoTracking().Where(p => p.Status == PostStatus.Approved && p.Author.IsActive && (
            p.Visibility == "Public" || p.AuthorId == viewer || isAdmin ||
            (p.Visibility == "Friends" && friends.Contains(p.AuthorId))));

    // ---------------------------------------------------------------- feed and posts

    public async Task<FeedResponse> FeedAsync(Guid userId, bool isAdmin, string? kind, bool mine, string? q, DateTimeOffset? before,
        CancellationToken ct, Guid? authorId = null)
    {
        var friends = userId == Guid.Empty ? [] : await FriendIdsAsync(userId, ct);
        var query = Visible(userId, isAdmin, friends);
        if (!string.IsNullOrWhiteSpace(kind) && (Kinds.Contains(kind) || kind == "Announcement")) query = query.Where(p => p.Kind == kind);
        if (mine) query = query.Where(p => p.AuthorId == userId);
        if (authorId is { } a) query = query.Where(p => p.AuthorId == a);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            query = query.Where(p => EF.Functions.ILike(p.Content, term) || (p.ProjectTitle != null && EF.Functions.ILike(p.ProjectTitle, term)) || EF.Functions.ILike(p.Author.FullName, term));
        }
        if (before is { } b) query = query.Where(p => p.CreatedAt < b);

        var posts = await query.OrderByDescending(p => p.CreatedAt).Take(PageSize + 1).Include(p => p.Author).ToListAsync(ct);
        var hasMore = posts.Count > PageSize;
        posts = posts.Take(PageSize).ToList();
        var mapped = await MapAsync(posts, userId, isAdmin, friends, ct);
        return new FeedResponse(mapped, hasMore ? posts[^1].CreatedAt : null);
    }

    /// <summary>The signed-in student's posts that are waiting for review or were not approved.</summary>
    public async Task<IReadOnlyList<PostResponse>> PendingAsync(Guid userId, CancellationToken ct)
    {
        var posts = await db.Posts.AsNoTracking().Where(p => p.AuthorId == userId && p.Status != PostStatus.Approved)
            .OrderByDescending(p => p.CreatedAt).Take(50).Include(p => p.Author).ToListAsync(ct);
        return await MapAsync(posts, userId, false, [], ct);
    }

    /// <summary>One post (share links). Visible when the viewer may see it, or to its author.</summary>
    public async Task<PostResponse?> GetAsync(Guid userId, bool isAdmin, Guid postId, CancellationToken ct)
    {
        var friends = userId == Guid.Empty ? [] : await FriendIdsAsync(userId, ct);
        var post = await Visible(userId, isAdmin, friends).Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == postId, ct)
                   ?? (userId == Guid.Empty ? null : await db.Posts.AsNoTracking().Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == postId && p.AuthorId == userId, ct));
        return post is null ? null : (await MapAsync([post], userId, isAdmin, friends, ct))[0];
    }

    static string Vis(string? v) => Visibilities.FirstOrDefault(x => string.Equals(x, v, StringComparison.OrdinalIgnoreCase)) ?? "Public";

    public async Task<PostResponse> CreateAsync(Guid userId, bool isAdmin, CreatePostRequest body, CancellationToken ct, bool autoApprove = false)
    {
        var content = body?.Content?.Trim() ?? "";
        var ids = (body?.UploadIds ?? []).Distinct().Take(6).ToArray();
        if (content.Length == 0 && ids.Length == 0) throw new ArgumentException("Write something or add a file.");
        if (content.Length > 5000) content = content[..5000];
        if (ids.Length > 0 && await db.Uploads.CountAsync(u => ids.Contains(u.Id) && (u.OwnerId == userId || isAdmin), ct) != ids.Length)
            throw new ArgumentException("One of the attachments was not found.");
        if (body!.GroupId is { } gid && !await db.GroupMembers.AnyAsync(m => m.GroupId == gid && m.UserId == userId, ct))
            throw new ArgumentException("You can only post for groups you belong to.");

        var approved = isAdmin || autoApprove;
        var post = new Post
        {
            Id = Guid.NewGuid(), AuthorId = userId, Content = content, UploadIds = ids, GroupId = body.GroupId, Visibility = Vis(body.Visibility),
            Kind = Kinds.Contains(body.Kind) || (isAdmin && body.Kind == "Announcement") ? body.Kind! : "Update",
            Status = approved ? PostStatus.Approved : PostStatus.Pending, ModeratedAt = approved ? DateTimeOffset.UtcNow : null,
            ProjectTitle = Clip(body.ProjectTitle, 200),
        };
        db.Posts.Add(post);
        await db.SaveChangesAsync(ct);
        post.Author = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId, ct);
        return (await MapAsync([post], userId, isAdmin, [], ct))[0];
    }

    /// <summary>Facebook-style "Share to feed". A share with no caption is published straight away; a caption is checked by an admin first.</summary>
    public async Task<PostResponse?> ShareAsync(Guid userId, Guid postId, SharePostRequest body, CancellationToken ct)
    {
        var friends = await FriendIdsAsync(userId, ct);
        var original = await Visible(userId, false, friends).FirstOrDefaultAsync(p => p.Id == postId, ct);
        if (original is null) return null;
        var rootId = original.SharedPostId ?? original.Id; // sharing a share shares the original
        var caption = body?.Content?.Trim() ?? "";
        if (caption.Length > 2000) caption = caption[..2000];
        var post = new Post
        {
            Id = Guid.NewGuid(), AuthorId = userId, Content = caption, SharedPostId = rootId, Kind = "Update", Visibility = Vis(body?.Visibility),
            Status = caption.Length == 0 ? PostStatus.Approved : PostStatus.Pending, ModeratedAt = caption.Length == 0 ? DateTimeOffset.UtcNow : null,
        };
        db.Posts.Add(post);
        await db.SaveChangesAsync(ct);
        var rootAuthor = await db.Posts.Where(p => p.Id == rootId).Select(p => p.AuthorId).FirstAsync(ct);
        if (rootAuthor != userId)
            await accounts.NotifyAsync(rootAuthor, "Share", $"{await NameAsync(userId, ct)} shared your post", null, $"/community?post={rootId}", ct, userId);
        post.Author = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId, ct);
        return (await MapAsync([post], userId, false, friends, ct))[0];
    }

    /// <summary>The author edits the text or audience. Changed text goes back to the admin for approval.</summary>
    public async Task<PostResponse?> UpdateAsync(Guid userId, bool isAdmin, Guid postId, UpdatePostRequest body, CancellationToken ct)
    {
        var post = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == postId && p.AuthorId == userId, ct);
        if (post is null) return null;
        if (body.Content is not null)
        {
            var content = body.Content.Trim();
            if (content.Length > 5000) content = content[..5000];
            if (content.Length == 0 && post.UploadIds.Length == 0 && post.SharedPostId is null) throw new ArgumentException("A post cannot be empty.");
            if (content != post.Content)
            {
                post.Content = content;
                post.EditedAt = DateTimeOffset.UtcNow;
                if (!isAdmin && !post.Author.IsOfficial && content.Length > 0) { post.Status = PostStatus.Pending; post.ModerationNote = null; }
            }
        }
        if (body.Visibility is not null) post.Visibility = Vis(body.Visibility);
        if (body.Kind is not null && (Kinds.Contains(body.Kind) || (isAdmin && body.Kind == "Announcement"))) post.Kind = body.Kind;
        if (body.ProjectTitle is not null) post.ProjectTitle = Clip(body.ProjectTitle, 200);
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return (await MapAsync([post], userId, isAdmin, [], ct))[0];
    }

    public async Task<bool> DeleteAsync(Guid userId, bool isAdmin, Guid postId, CancellationToken ct) =>
        await db.Posts.Where(p => p.Id == postId && (p.AuthorId == userId || isAdmin)).ExecuteDeleteAsync(ct) > 0;

    /// <summary>Sets the user's reaction. Sending the same reaction again removes it (like Facebook).</summary>
    public async Task<ReactionResult?> ReactAsync(Guid userId, Guid postId, string? reaction, CancellationToken ct)
    {
        var friends = await FriendIdsAsync(userId, ct);
        var post = await Visible(userId, false, friends).Where(p => p.Id == postId).Select(p => new { p.AuthorId }).FirstOrDefaultAsync(ct);
        if (post is null) return null;
        var type = Reactions.FirstOrDefault(r => string.Equals(r, reaction, StringComparison.OrdinalIgnoreCase)) ?? "Like";
        var existing = await db.PostLikes.SingleOrDefaultAsync(l => l.PostId == postId && l.UserId == userId, ct);
        string? mine;
        if (existing is null)
        {
            db.PostLikes.Add(new PostLike { Id = Guid.NewGuid(), PostId = postId, UserId = userId, Reaction = type });
            mine = type;
        }
        else if (existing.Reaction == type) { db.PostLikes.Remove(existing); mine = null; }
        else { existing.Reaction = type; existing.UpdatedAt = DateTimeOffset.UtcNow; mine = type; }
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { /* double-click race on the unique index */ }

        if (existing is null && post.AuthorId != userId)
            await accounts.NotifyAsync(post.AuthorId, "Reaction", $"{await NameAsync(userId, ct)} reacted {type} to your post", null, $"/community?post={postId}", ct, userId);
        var counts = await CountsAsync([postId], ct);
        var c = counts.GetValueOrDefault(postId) ?? [];
        return new ReactionResult(c, c.Values.Sum(), mine);
    }

    // ---------------------------------------------------------------- comments

    public async Task<IReadOnlyList<CommentResponse>?> CommentsAsync(Guid userId, bool isAdmin, Guid postId, CancellationToken ct)
    {
        var friends = userId == Guid.Empty ? [] : await FriendIdsAsync(userId, ct);
        var postAuthor = await Visible(userId, isAdmin, friends).Where(p => p.Id == postId).Select(p => (Guid?)p.AuthorId).FirstOrDefaultAsync(ct)
                         ?? await db.Posts.Where(p => p.Id == postId && p.AuthorId == userId && userId != Guid.Empty).Select(p => (Guid?)p.AuthorId).FirstOrDefaultAsync(ct);
        if (postAuthor is null) return null;
        var list = await db.PostComments.AsNoTracking().Include(c => c.Author).Where(c => c.PostId == postId && c.Author.IsActive)
            .OrderBy(c => c.CreatedAt).Take(500).ToListAsync(ct);
        return await MapCommentsAsync(list, userId, isAdmin, postAuthor.Value, ct);
    }

    public async Task<CommentResponse?> AddCommentAsync(Guid userId, bool isAdmin, Guid postId, CreateCommentRequest body, CancellationToken ct)
    {
        var friends = await FriendIdsAsync(userId, ct);
        var post = await Visible(userId, isAdmin, friends).Where(p => p.Id == postId).Select(p => new { p.AuthorId }).FirstOrDefaultAsync(ct);
        if (post is null) return null;
        var text = body?.Content?.Trim() ?? "";
        if (text.Length == 0) throw new ArgumentException("Write a comment first.");
        if (text.Length > 2000) text = text[..2000];

        PostComment? parent = null;
        if (body!.ParentId is { } pid)
        {
            parent = await db.PostComments.AsNoTracking().FirstOrDefaultAsync(c => c.Id == pid && c.PostId == postId, ct)
                     ?? throw new ArgumentException("That comment was deleted.");
            if (parent.ParentCommentId is { } top) parent = await db.PostComments.AsNoTracking().FirstAsync(c => c.Id == top, ct); // one level of replies
        }
        var comment = new PostComment { Id = Guid.NewGuid(), PostId = postId, AuthorId = userId, Content = text, ParentCommentId = parent?.Id };
        db.PostComments.Add(comment);
        await db.SaveChangesAsync(ct);
        comment.Author = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId, ct);

        var preview = text.Length > 120 ? text[..120] + "…" : text;
        var link = $"/community?post={postId}";
        if (parent is not null && parent.AuthorId != userId)
            await accounts.NotifyAsync(parent.AuthorId, "Reply", $"{comment.Author.FullName} replied to your comment", preview, link, ct, userId);
        if (post.AuthorId != userId && post.AuthorId != parent?.AuthorId)
            await accounts.NotifyAsync(post.AuthorId, "Comment", $"{comment.Author.FullName} commented on your post", preview, link, ct, userId);
        return (await MapCommentsAsync([comment], userId, isAdmin, post.AuthorId, ct))[0];
    }

    public async Task<CommentResponse?> UpdateCommentAsync(Guid userId, Guid commentId, UpdateCommentRequest body, CancellationToken ct)
    {
        var c = await db.PostComments.Include(x => x.Author).Include(x => x.Post).FirstOrDefaultAsync(x => x.Id == commentId && x.AuthorId == userId, ct);
        if (c is null) return null;
        var text = body.Content?.Trim() ?? "";
        if (text.Length == 0) throw new ArgumentException("A comment cannot be empty.");
        c.Content = text.Length > 2000 ? text[..2000] : text;
        c.EditedAt = DateTimeOffset.UtcNow;
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return (await MapCommentsAsync([c], userId, false, c.Post.AuthorId, ct))[0];
    }

    /// <summary>The comment's author, the post owner or an admin can delete it (replies go with it).</summary>
    public async Task<bool> DeleteCommentAsync(Guid userId, bool isAdmin, Guid commentId, CancellationToken ct) =>
        await db.PostComments.Where(c => c.Id == commentId && (c.AuthorId == userId || isAdmin || c.Post.AuthorId == userId)).ExecuteDeleteAsync(ct) > 0;

    public async Task<ReactionResult?> ReactCommentAsync(Guid userId, Guid commentId, string? reaction, CancellationToken ct)
    {
        var c = await db.PostComments.AsNoTracking().Where(x => x.Id == commentId).Select(x => new { x.AuthorId, x.PostId }).FirstOrDefaultAsync(ct);
        if (c is null) return null;
        var type = Reactions.FirstOrDefault(r => string.Equals(r, reaction, StringComparison.OrdinalIgnoreCase)) ?? "Like";
        var existing = await db.CommentReactions.FirstOrDefaultAsync(r => r.CommentId == commentId && r.UserId == userId, ct);
        string? mine;
        if (existing is null) { db.CommentReactions.Add(new CommentReaction { Id = Guid.NewGuid(), CommentId = commentId, UserId = userId, Reaction = type }); mine = type; }
        else if (existing.Reaction == type) { db.CommentReactions.Remove(existing); mine = null; }
        else { existing.Reaction = type; mine = type; }
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { }
        if (existing is null && c.AuthorId != userId)
            await accounts.NotifyAsync(c.AuthorId, "CommentReaction", $"{await NameAsync(userId, ct)} reacted {type} to your comment", null, $"/community?post={c.PostId}", ct, userId);
        var counts = await db.CommentReactions.Where(r => r.CommentId == commentId).GroupBy(r => r.Reaction)
            .Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        return new ReactionResult(counts, counts.Values.Sum(), mine);
    }

    // ---------------------------------------------------------------- friends, people, page

    public async Task<FriendsOverview> FriendsAsync(Guid me, CancellationToken ct)
    {
        var rows = await db.Friendships.AsNoTracking().Where(f => f.RequesterId == me || f.AddresseeId == me).ToListAsync(ct);
        var friendIds = rows.Where(f => f.Status == FriendStatus.Accepted).Select(f => f.RequesterId == me ? f.AddresseeId : f.RequesterId).ToList();
        var received = rows.Where(f => f.Status == FriendStatus.Pending && f.AddresseeId == me).ToList();
        var sent = rows.Where(f => f.Status == FriendStatus.Pending && f.RequesterId == me).ToList();
        var known = rows.SelectMany(f => new[] { f.RequesterId, f.AddresseeId }).Append(me).ToHashSet();

        var suggestionIds = await db.Users.AsNoTracking().Where(u => u.IsActive && !u.IsOfficial && u.Role == UserRole.Student && !known.Contains(u.Id))
            .OrderByDescending(u => u.LastActiveAt).Take(30).Select(u => u.Id).ToListAsync(ct);
        var cards = await CardsAsync(me, friendIds.Concat(received.Select(r => r.RequesterId)).Concat(sent.Select(s => s.AddresseeId)).Concat(suggestionIds).ToList(), friendIds, ct);

        PersonCard With(Guid id, string rel, DateTimeOffset? since) => cards[id] with { Relationship = rel, Since = since };
        return new FriendsOverview(
            friendIds.Where(cards.ContainsKey).Select(id => With(id, "Friends", rows.First(f => f.RequesterId == id || f.AddresseeId == id).RespondedAt)).OrderBy(c => c.FullName).ToList(),
            received.Where(r => cards.ContainsKey(r.RequesterId)).OrderByDescending(r => r.CreatedAt).Select(r => With(r.RequesterId, "RequestReceived", r.CreatedAt)).ToList(),
            sent.Where(r => cards.ContainsKey(r.AddresseeId)).OrderByDescending(r => r.CreatedAt).Select(r => With(r.AddresseeId, "RequestSent", r.CreatedAt)).ToList(),
            suggestionIds.Where(cards.ContainsKey).Select(id => With(id, "None", null)).OrderByDescending(c => c.MutualFriends).Take(20).ToList());
    }

    public async Task<string> SendRequestAsync(Guid me, Guid other, CancellationToken ct)
    {
        if (me == other) throw new ArgumentException("You cannot add yourself.");
        var target = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == other && u.IsActive, ct) ?? throw new KeyNotFoundException();
        if (target.IsOfficial) throw new ArgumentException("Follow the ProjectMentor page instead.");
        var existing = await db.Friendships.FirstOrDefaultAsync(f => (f.RequesterId == me && f.AddresseeId == other) || (f.RequesterId == other && f.AddresseeId == me), ct);
        if (existing is not null)
        {
            if (existing.Status == FriendStatus.Accepted) return "Friends";
            if (existing.RequesterId == me) return "RequestSent";
            return await RespondAsync(me, other, true, ct); // they already asked us: accept
        }
        db.Friendships.Add(new Friendship { Id = Guid.NewGuid(), RequesterId = me, AddresseeId = other });
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return "RequestSent"; }
        await accounts.NotifyAsync(other, "FriendRequest", $"{await NameAsync(me, ct)} sent you a friend request", null, "/community/requests", ct, me);
        return "RequestSent";
    }

    public async Task<string> RespondAsync(Guid me, Guid requester, bool accept, CancellationToken ct)
    {
        var f = await db.Friendships.FirstOrDefaultAsync(x => x.RequesterId == requester && x.AddresseeId == me && x.Status == FriendStatus.Pending, ct)
                ?? throw new KeyNotFoundException();
        if (!accept) { db.Friendships.Remove(f); await db.SaveChangesAsync(ct); return "None"; }
        f.Status = FriendStatus.Accepted;
        f.RespondedAt = DateTimeOffset.UtcNow;
        f.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await accounts.NotifyAsync(requester, "FriendAccepted", $"{await NameAsync(me, ct)} accepted your friend request", null, $"/community/profile/{me}", ct, me);
        return "Friends";
    }

    /// <summary>Cancels a sent request or unfriends.</summary>
    public async Task<bool> RemoveAsync(Guid me, Guid other, CancellationToken ct) =>
        await db.Friendships.Where(f => (f.RequesterId == me && f.AddresseeId == other) ||
                                        (f.RequesterId == other && f.AddresseeId == me && f.Status == FriendStatus.Accepted)).ExecuteDeleteAsync(ct) > 0;

    public async Task<bool> ToggleFollowAsync(Guid me, Guid pageId, CancellationToken ct)
    {
        if (!await db.Users.AnyAsync(u => u.Id == pageId && u.IsOfficial, ct)) throw new KeyNotFoundException();
        var existing = await db.PageFollows.FirstOrDefaultAsync(f => f.UserId == me && f.PageUserId == pageId, ct);
        if (existing is not null) { db.PageFollows.Remove(existing); await db.SaveChangesAsync(ct); return false; }
        db.PageFollows.Add(new PageFollow { Id = Guid.NewGuid(), UserId = me, PageUserId = pageId });
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { }
        return true;
    }

    public async Task<CommunitySearchResponse> SearchAsync(Guid me, bool isAdmin, string? q, CancellationToken ct)
    {
        var term = q?.Trim() ?? "";
        if (term.Length == 0) return new CommunitySearchResponse([], []);
        var like = $"%{term}%";
        var ids = await db.Users.AsNoTracking().Where(u => u.IsActive && (u.Role == UserRole.Student || u.IsOfficial) &&
                (EF.Functions.ILike(u.FullName, like) || (u.University != null && EF.Functions.ILike(u.University, like)) || (u.Skills != null && EF.Functions.ILike(u.Skills, like))))
            .OrderByDescending(u => u.IsOfficial).ThenBy(u => u.FullName).Take(20).Select(u => u.Id).ToListAsync(ct);
        var friends = me == Guid.Empty ? [] : await FriendIdsAsync(me, ct);
        var cards = await CardsAsync(me, ids, friends, ct);
        var people = new List<PersonCard>();
        foreach (var id in ids.Where(cards.ContainsKey)) people.Add(cards[id] with { Relationship = cards[id].IsOfficial ? "Page" : await RelationshipAsync(me, id, ct) });
        var posts = (await FeedAsync(me, isAdmin, null, false, term, null, ct)).Posts;
        return new CommunitySearchResponse(people, posts);
    }

    // ---------------------------------------------------------------- community profile

    static readonly Dictionary<string, string> DefaultVisibility = new()
    {
        ["email"] = "Private", ["birthday"] = "Friends", ["university"] = "Public", ["degree"] = "Public", ["year"] = "Public",
        ["location"] = "Friends", ["skills"] = "Public", ["links"] = "Public", ["friends"] = "Public",
    };

    public static Dictionary<string, string> VisibilityOf(User u)
    {
        var map = new Dictionary<string, string>(DefaultVisibility);
        try
        {
            var saved = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(u.VisibilityJson ?? "{}") ?? [];
            foreach (var (k, v) in saved) if (map.ContainsKey(k) && v is "Public" or "Friends" or "Private") map[k] = v;
        }
        catch (System.Text.Json.JsonException) { }
        return map;
    }

    public async Task<CommunityProfileResponse?> ProfileAsync(Guid me, Guid userId, CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId && x.IsActive && (x.Role == UserRole.Student || x.IsOfficial), ct);
        if (u is null) return null;
        var self = me == userId;
        var rel = u.IsOfficial ? "Page" : await RelationshipAsync(me, userId, ct);
        var vis = VisibilityOf(u);
        bool Can(string field) => self || vis[field] == "Public" || (vis[field] == "Friends" && rel == "Friends");

        var theirFriends = await FriendIdsAsync(userId, ct);
        var myFriends = me == Guid.Empty || self ? [] : await FriendIdsAsync(me, ct);
        var followers = u.IsOfficial ? await db.PageFollows.CountAsync(f => f.PageUserId == userId, ct) : 0;
        var following = u.IsOfficial && me != Guid.Empty && await db.PageFollows.AnyAsync(f => f.PageUserId == userId && f.UserId == me, ct);
        var posts = await db.Posts.CountAsync(p => p.AuthorId == userId && p.Status == PostStatus.Approved, ct);

        string? birthday = null;
        if (u.Birthday is { } b && Can("birthday")) birthday = u.BirthdayShowYear ? b.ToString("d MMMM yyyy") : b.ToString("d MMMM");

        return new CommunityProfileResponse(
            u.Id, u.FullName, GroupService.Initials(u.FullName), u.AvatarUploadId, u.CoverUploadId, u.Badge, u.IsOfficial, self,
            rel, following, Can("friends") ? theirFriends.Count : 0, theirFriends.Intersect(myFriends).Count(), followers, posts,
            u.Bio, Can("email") && !u.IsOfficial ? u.Email : null, birthday,
            Can("university") ? u.University : null, Can("degree") ? u.Degree : null, Can("year") ? u.YearOfStudy : null,
            Can("location") ? u.Location : null, Can("skills") ? u.Skills : null,
            Can("links") ? u.GithubUrl : null, Can("links") ? u.LinkedinUrl : null, Can("links") ? u.Website : null,
            u.CreatedAt, self ? vis : null, self ? u.Birthday?.ToString("yyyy-MM-dd") : null, u.BirthdayShowYear);
    }

    public async Task<IReadOnlyList<PersonCard>?> ProfileFriendsAsync(Guid me, Guid userId, CancellationToken ct)
    {
        var p = await ProfileAsync(me, userId, ct);
        if (p is null) return null;
        if (!p.IsSelf && VisibilityOf(await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct))["friends"] is var v &&
            !(v == "Public" || (v == "Friends" && p.Relationship == "Friends"))) return [];
        var ids = await FriendIdsAsync(userId, ct);
        var myFriends = me == Guid.Empty ? [] : await FriendIdsAsync(me, ct);
        var cards = await CardsAsync(me, ids, myFriends, ct);
        return ids.Where(cards.ContainsKey).Select(id => cards[id] with { Relationship = id == me ? "Self" : myFriends.Contains(id) ? "Friends" : "None" })
            .OrderBy(c => c.FullName).ToList();
    }

    public async Task UpdateProfileAsync(Guid me, UpdateCommunityProfileRequest b, CancellationToken ct)
    {
        var u = await db.Users.FirstAsync(x => x.Id == me, ct);
        u.Bio = Clip(b.Bio, 500);
        if (string.IsNullOrWhiteSpace(b.Birthday)) u.Birthday = null;
        else if (DateOnly.TryParse(b.Birthday, out var d) && d < DateOnly.FromDateTime(DateTime.Today) && d.Year > 1900) u.Birthday = d;
        else throw new ArgumentException("Enter a valid birthday.");
        u.BirthdayShowYear = b.BirthdayShowYear;
        u.University = Clip(b.University, 200);
        u.Degree = Clip(b.Degree, 200);
        u.Location = Clip(b.Location, 120);
        u.Skills = Clip(b.Skills, 500);
        u.GithubUrl = Url(b.GithubUrl);
        u.LinkedinUrl = Url(b.LinkedinUrl);
        u.Website = Url(b.Website);
        if (b.Visibility is not null)
        {
            var map = VisibilityOf(u);
            foreach (var (k, v) in b.Visibility) if (map.ContainsKey(k) && v is "Public" or "Friends" or "Private") map[k] = v;
            u.VisibilityJson = System.Text.Json.JsonSerializer.Serialize(map);
        }
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    static string? Url(string? s)
    {
        var v = Clip(s, 300);
        if (v is null) return null;
        if (!v.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !v.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) v = "https://" + v;
        return Uri.TryCreate(v, UriKind.Absolute, out _) ? v : throw new ArgumentException("One of the links is not a valid web address.");
    }

    // ---------------------------------------------------------------- helpers

    Task<string> NameAsync(Guid id, CancellationToken ct) => db.Users.Where(u => u.Id == id).Select(u => u.FullName).FirstAsync(ct);

    async Task<Dictionary<Guid, PersonCard>> CardsAsync(Guid me, List<Guid> ids, List<Guid> myFriends, CancellationToken ct)
    {
        ids = ids.Distinct().ToList();
        var users = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id) && u.IsActive).ToListAsync(ct);
        var theirFriends = await db.Friendships.AsNoTracking()
            .Where(f => f.Status == FriendStatus.Accepted && (ids.Contains(f.RequesterId) || ids.Contains(f.AddresseeId)))
            .Select(f => new { f.RequesterId, f.AddresseeId }).ToListAsync(ct);
        var following = me == Guid.Empty ? [] : await db.PageFollows.Where(f => f.UserId == me).Select(f => f.PageUserId).ToListAsync(ct);
        return users.ToDictionary(u => u.Id, u =>
        {
            var vis = VisibilityOf(u);
            var theirs = theirFriends.Where(f => f.RequesterId == u.Id || f.AddresseeId == u.Id).Select(f => f.RequesterId == u.Id ? f.AddresseeId : f.RequesterId);
            var sub = u.IsOfficial ? "Official page" : string.Join(" · ", new[]
            {
                vis["degree"] == "Public" ? u.Degree : null, vis["university"] == "Public" ? u.University : null,
            }.Where(x => !string.IsNullOrWhiteSpace(x)));
            return new PersonCard(u.Id, u.FullName, GroupService.Initials(u.FullName), u.AvatarUploadId, u.Badge, u.IsOfficial,
                string.IsNullOrEmpty(sub) ? null : sub, theirs.Count(myFriends.Contains), "None", following.Contains(u.Id));
        });
    }

    private async Task<Dictionary<Guid, Dictionary<string, int>>> CountsAsync(List<Guid> ids, CancellationToken ct) =>
        (await db.PostLikes.Where(l => ids.Contains(l.PostId)).GroupBy(l => new { l.PostId, l.Reaction })
            .Select(g => new { g.Key.PostId, g.Key.Reaction, Count = g.Count() }).ToListAsync(ct))
        .GroupBy(x => x.PostId).ToDictionary(g => g.Key, g => g.ToDictionary(x => x.Reaction, x => x.Count));

    private async Task<List<PostResponse>> MapAsync(List<Post> posts, Guid userId, bool isAdmin, List<Guid> friends, CancellationToken ct, bool nested = false)
    {
        var ids = posts.Select(p => p.Id).ToList();
        var counts = await CountsAsync(ids, ct);
        var mine = userId == Guid.Empty ? [] : await db.PostLikes.Where(l => ids.Contains(l.PostId) && l.UserId == userId).ToDictionaryAsync(l => l.PostId, l => l.Reaction, ct);
        var commentCounts = await db.PostComments.Where(c => ids.Contains(c.PostId) && c.Author.IsActive).GroupBy(c => c.PostId)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var shareCounts = await db.Posts.Where(p => p.SharedPostId != null && ids.Contains(p.SharedPostId.Value) && p.Status == PostStatus.Approved)
            .GroupBy(p => p.SharedPostId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var recent = nested ? [] : await db.PostComments.AsNoTracking().Include(c => c.Author)
            .Where(c => ids.Contains(c.PostId) && c.ParentCommentId == null && c.Author.IsActive)
            .OrderByDescending(c => c.CreatedAt).Take(ids.Count * 4 + 4).ToListAsync(ct);
        var recentMapped = new Dictionary<Guid, CommentResponse>();
        foreach (var group in recent.GroupBy(c => c.PostId))
        {
            var author = posts.First(p => p.Id == group.Key).AuthorId;
            foreach (var m in await MapCommentsAsync(group.Take(2).ToList(), userId, isAdmin, author, ct)) recentMapped[m.Id] = m;
        }
        var uploadIds = posts.SelectMany(p => p.UploadIds).Distinct().ToList();
        var uploads = await db.Uploads.AsNoTracking().Where(u => uploadIds.Contains(u.Id))
            .Select(u => new UploadInfo(u.Id, u.FileName, u.ContentType, u.Size)).ToDictionaryAsync(u => u.Id, ct);
        var groupIds = posts.Where(p => p.GroupId != null).Select(p => p.GroupId!.Value).Distinct().ToList();
        var groupNames = await db.StudyGroups.AsNoTracking().Where(g => groupIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        // Shared originals, only if this viewer may still see them.
        var sharedIds = nested ? [] : posts.Where(p => p.SharedPostId != null).Select(p => p.SharedPostId!.Value).Distinct().ToList();
        var shared = new Dictionary<Guid, PostResponse>();
        if (sharedIds.Count > 0)
        {
            var originals = await Visible(userId, isAdmin, friends).Include(p => p.Author).Where(p => sharedIds.Contains(p.Id)).ToListAsync(ct);
            foreach (var o in await MapAsync(originals, userId, isAdmin, friends, ct, nested: true)) shared[o.Id] = o;
        }

        return posts.Select(p =>
        {
            var c = counts.GetValueOrDefault(p.Id) ?? [];
            var my = mine.GetValueOrDefault(p.Id);
            var own = p.AuthorId == userId;
            return new PostResponse(
                p.Id, p.AuthorId, p.Author.FullName, GroupService.Initials(p.Author.FullName), p.Author.AvatarUploadId, p.Author.Badge,
                p.GroupId is { } g && groupNames.TryGetValue(g, out var gn) ? gn : null,
                p.Kind, p.ProjectTitle, p.Content,
                p.UploadIds.Where(uploads.ContainsKey).Select(id => uploads[id]).ToList(),
                c.Values.Sum(), my is not null, c, my, commentCounts.GetValueOrDefault(p.Id),
                recent.Where(x => x.PostId == p.Id).Take(2).OrderBy(x => x.CreatedAt).Select(x => recentMapped[x.Id]).ToList(),
                p.CreatedAt, own || isAdmin, p.Status, own || isAdmin ? p.ModerationNote : null,
                p.Author.IsOfficial, p.Visibility, own, p.EditedAt, shareCounts.GetValueOrDefault(p.Id),
                p.SharedPostId is { } sid && shared.TryGetValue(sid, out var sp) ? sp : null,
                p.SharedPostId is { } sid2 && !shared.ContainsKey(sid2));
        }).ToList();
    }

    private async Task<List<CommentResponse>> MapCommentsAsync(List<PostComment> list, Guid userId, bool isAdmin, Guid postAuthor, CancellationToken ct)
    {
        var ids = list.Select(c => c.Id).ToList();
        var reactions = await db.CommentReactions.AsNoTracking().Where(r => ids.Contains(r.CommentId)).ToListAsync(ct);
        return list.Select(c =>
        {
            var mine = reactions.Where(r => r.CommentId == c.Id);
            var counts = mine.GroupBy(r => r.Reaction).ToDictionary(g => g.Key, g => g.Count());
            return new CommentResponse(c.Id, c.AuthorId, c.Author.FullName, GroupService.Initials(c.Author.FullName), c.Author.AvatarUploadId, c.Author.Badge,
                c.Content, c.CreatedAt, c.AuthorId == userId || isAdmin || postAuthor == userId,
                c.ParentCommentId, c.AuthorId == userId, c.EditedAt, counts, counts.Values.Sum(),
                mine.FirstOrDefault(r => r.UserId == userId)?.Reaction, c.Author.IsOfficial);
        }).ToList();
    }

    static string? Clip(string? s, int max)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : t.Length > max ? t[..max] : t;
    }
}
