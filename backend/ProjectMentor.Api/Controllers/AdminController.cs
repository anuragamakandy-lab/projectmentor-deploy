using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

/// <summary>
/// The admin panel API. One place to manage what both the website and the mobile app show:
/// home page content, Learn videos, tracks and lessons, templates and example files, users, groups and community posts.
/// (Resources are managed through <c>/api/resources</c>, which is already admin-only for writes.)
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public sealed class AdminController(ProjectMentorDbContext db, ContentService content, IHttpClientFactory http, AccountService accounts, VivaService viva, EmailService mailer) : ControllerBase
{
    [HttpGet("ping")]
    public IActionResult Ping() => Ok(new { role = "Admin", status = "authorized" });

    // ---------------------------------------------------------------- dashboard

    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsResponse>> Stats(CancellationToken ct)
    {
        var newest = await LoadUsersAsync(null, null, 6, null, ct);
        return Ok(new AdminStatsResponse(
            await db.Users.CountAsync(u => u.Role == UserRole.Student && !u.IsOfficial, ct),
            await db.Users.CountAsync(u => u.Role == UserRole.Admin, ct),
            await db.Users.CountAsync(u => !u.IsActive, ct),
            await db.RoadmapRequests.CountAsync(ct),
            await db.StudyGroups.CountAsync(ct),
            await db.Posts.CountAsync(ct),
            await db.VivaSessions.CountAsync(ct),
            await db.Resources.CountAsync(ct),
            await db.LearnVideos.CountAsync(ct),
            await db.LearnLessons.CountAsync(ct),
            await db.ContentFiles.CountAsync(f => f.Kind == "Template", ct),
            await db.ContentFiles.CountAsync(f => f.Kind == "Example", ct),
            await db.Posts.CountAsync(p => p.Status == PostStatus.Pending, ct),
            await db.SiteEntries.CountAsync(ct),
            newest));
    }

    // ---------------------------------------------------------------- users

    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyList<AdminUserResponse>>> Users([FromQuery] string? q, [FromQuery] string? role,
        [FromQuery] string? status, [FromQuery] string? badge, CancellationToken ct)
    {
        var list = await LoadUsersAsync(q, role, 500, null, ct);
        if (status == "active") list = list.Where(u => u.IsActive).ToList();
        if (status == "inactive") list = list.Where(u => !u.IsActive).ToList();
        if (badge == "none") list = list.Where(u => u.Badge is null).ToList();
        else if (!string.IsNullOrEmpty(badge)) list = list.Where(u => u.Badge == badge).ToList();
        return Ok(list);
    }

    /// <summary>Admins can only (de)activate an account or change its role. Names, years and passwords belong to the student.</summary>
    [HttpPatch("users/{id:guid}")]
    public async Task<ActionResult<AdminUserResponse>> UpdateUser(Guid id, UpdateUserRequest body, CancellationToken ct)
    {
        if (id == User.GetUserId()) return BadRequest("You cannot change your own role or deactivate yourself.");
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();
        if (body.Role is not null)
        {
            if (!Enum.TryParse<UserRole>(body.Role, true, out var newRole)) return BadRequest("Role must be Student or Admin.");
            user.Role = newRole;
        }
        var statusChanged = body.IsActive is bool a && a != user.IsActive;
        if (statusChanged && body.IsActive == false && string.IsNullOrWhiteSpace(body.Reason))
            return BadRequest("Write the reason for deactivating. It is emailed to the student.");
        if (body.IsActive is bool active)
        {
            user.IsActive = active;
            user.DeactivationReason = active ? null : string.IsNullOrWhiteSpace(body.Reason) ? null : body.Reason.Trim()[..Math.Min(500, body.Reason.Trim().Length)];
        }
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        // Deactivated accounts disappear from the community automatically (every query filters on IsActive).
        if (statusChanged) await mailer.SendAccountStatusAsync(user, user.IsActive, user.DeactivationReason, ct);
        return Ok((await LoadUsersAsync(null, null, 1, id, ct))[0]);
    }

    /// <summary>Everything a student has done: usage numbers, progress and an activity timeline.</summary>
    [HttpGet("users/{id:guid}")]
    public async Task<ActionResult<AdminUserDetailResponse>> UserDetail(Guid id, CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null) return NotFound();
        return Ok(new AdminUserDetailResponse((await LoadUsersAsync(null, null, 1, id, ct))[0], u.Bio, u.AvatarUploadId, u.Badge, u.LastActiveAt,
            await accounts.UsageAsync(id, ct)));
    }

    [HttpPut("users/{id:guid}/badge")]
    public async Task<IActionResult> SetBadge(Guid id, SetBadgeRequest body, CancellationToken ct)
    {
        var badge = string.IsNullOrWhiteSpace(body.Badge) ? null : AccountService.Badges.FirstOrDefault(b => b == body.Badge);
        if (body.Badge is not null && body.Badge != "" && badge is null) return BadRequest("Unknown badge.");
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();
        user.Badge = badge;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (badge is not null)
            await accounts.NotifyAsync(id, "Badge", $"You earned the {badge} badge", "Thank you for using ProjectMentor so well. It now frames your profile picture.", "/profile", ct);
        return NoContent();
    }

    async Task<List<AdminUserResponse>> LoadUsersAsync(string? q, string? role, int take, Guid? id, CancellationToken ct)
    {
        var users = db.Users.AsNoTracking().Where(u => !u.IsOfficial);
        if (id is not null) users = users.Where(u => u.Id == id);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            users = users.Where(u => EF.Functions.ILike(u.FullName, term) || EF.Functions.ILike(u.Email, term));
        }
        if (Enum.TryParse<UserRole>(role, true, out var r)) users = users.Where(u => u.Role == r);
        var rows = await users.OrderByDescending(u => u.CreatedAt).Take(take).Select(u => new
        {
            u.Id, u.FullName, u.Email, u.Role, u.YearOfStudy, u.IsActive, u.CreatedAt, u.Badge, u.AvatarUploadId, u.LastActiveAt,
            Roadmaps = u.RoadmapRequests.Count, Posts = db.Posts.Count(p => p.AuthorId == u.Id),
        }).ToListAsync(ct);
        // Role is converted here, not in SQL, so it reads "Admin"/"Student" rather than the database label.
        return rows.Select(u => new AdminUserResponse(u.Id, u.FullName, u.Email, u.Role.ToString(), u.YearOfStudy, u.IsActive,
            u.CreatedAt, u.Roadmaps, u.Posts, u.Badge, u.AvatarUploadId, u.LastActiveAt)).ToList();
    }

    // ---------------------------------------------------------------- community moderation

    [HttpGet("posts")]
    public async Task<ActionResult<IReadOnlyList<AdminPostResponse>>> Posts([FromQuery] string? q, [FromQuery] string? status, CancellationToken ct)
    {
        var posts = db.Posts.AsNoTracking();
        if (status is PostStatus.Pending or PostStatus.Approved or PostStatus.Rejected) posts = posts.Where(p => p.Status == status);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            posts = posts.Where(p => EF.Functions.ILike(p.Content, term) || EF.Functions.ILike(p.Author.FullName, term) || (p.ProjectTitle != null && EF.Functions.ILike(p.ProjectTitle, term)));
        }
        // Pending posts are reviewed oldest first, everything else newest first.
        posts = status == PostStatus.Pending ? posts.OrderBy(p => p.CreatedAt) : posts.OrderByDescending(p => p.CreatedAt);
        return Ok(await posts.Take(200).Select(p => new AdminPostResponse(
            p.Id, p.Author.FullName, p.Author.Email, p.Kind, p.ProjectTitle, p.Content, p.UploadIds,
            p.Likes.Count, p.Comments.Count, p.Status, p.ModerationNote, p.CreatedAt)).ToListAsync(ct));
    }

    [HttpGet("posts/counts")]
    public async Task<ActionResult<AdminPostCounts>> PostCounts(CancellationToken ct) => Ok(new AdminPostCounts(
        await db.Posts.CountAsync(p => p.Status == PostStatus.Pending, ct),
        await db.Posts.CountAsync(p => p.Status == PostStatus.Approved, ct),
        await db.Posts.CountAsync(p => p.Status == PostStatus.Rejected, ct)));

    [HttpPost("posts/{id:guid}/approve")]
    public Task<IActionResult> ApprovePost(Guid id, ModeratePostRequest? body, CancellationToken ct) => Moderate(id, PostStatus.Approved, body?.Note, ct);

    [HttpPost("posts/{id:guid}/reject")]
    public Task<IActionResult> RejectPost(Guid id, ModeratePostRequest? body, CancellationToken ct) => Moderate(id, PostStatus.Rejected, body?.Note, ct);

    async Task<IActionResult> Moderate(Guid id, string status, string? note, CancellationToken ct)
    {
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (post is null) return NotFound();
        note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        if (note?.Length > 500) return BadRequest("Keep the note under 500 characters.");
        post.Status = status;
        post.ModerationNote = status == PostStatus.Rejected ? note ?? "This post does not follow the community guidelines." : null;
        post.ModeratedAt = DateTimeOffset.UtcNow;
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (post.AuthorId != User.GetUserId())
            await accounts.NotifyAsync(post.AuthorId, status == PostStatus.Approved ? "PostApproved" : "PostRejected",
                status == PostStatus.Approved ? "Your post was approved and is now in the community" : "Your post was not approved",
                status == PostStatus.Rejected ? post.ModerationNote : null, "/community", ct);
        return NoContent();
    }

    /// <summary>Admin announcement: published straight away.</summary>
    [HttpPost("posts")]
    public async Task<IActionResult> CreatePost(AdminSavePostRequest body, CancellationToken ct)
    {
        var content = body.Content?.Trim() ?? "";
        if (content.Length is 0 or > 5000) return BadRequest("Write the post (up to 5000 characters).");
        var now = DateTimeOffset.UtcNow;
        var post = new Post
        {
            Id = Guid.NewGuid(), AuthorId = await db.Users.Where(u => u.IsOfficial).Select(u => u.Id).FirstOrDefaultAsync(ct) is var page && page != Guid.Empty ? page : User.GetUserId(),
            Content = content, Kind = PostKind(body.Kind),
            ProjectTitle = string.IsNullOrWhiteSpace(body.ProjectTitle) ? null : body.ProjectTitle.Trim()[..Math.Min(200, body.ProjectTitle.Trim().Length)],
            Status = PostStatus.Approved, ModeratedAt = now, CreatedAt = now, UpdatedAt = now,
        };
        db.Posts.Add(post);
        await db.SaveChangesAsync(ct);
        return Ok(new { post.Id });
    }

    [HttpPut("posts/{id:guid}")]
    public async Task<IActionResult> UpdatePost(Guid id, AdminSavePostRequest body, CancellationToken ct)
    {
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (post is null) return NotFound();
        // Students own their posts: admins approve, reject or delete them, but only edit announcements written by admins.
        if (!await db.Users.AnyAsync(u => u.Id == post.AuthorId && (u.Role == UserRole.Admin || u.IsOfficial), ct))
            return StatusCode(403, "Only the student who wrote this post can edit it. You can approve, reject or delete it.");
        var content = body.Content?.Trim() ?? "";
        if (content.Length > 5000 || (content.Length == 0 && post.UploadIds.Length == 0)) return BadRequest("Write the post (up to 5000 characters).");
        post.Content = content;
        post.Kind = PostKind(body.Kind);
        post.ProjectTitle = string.IsNullOrWhiteSpace(body.ProjectTitle) ? null : body.ProjectTitle.Trim()[..Math.Min(200, body.ProjectTitle.Trim().Length)];
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    static string PostKind(string? kind) =>
        kind == "Announcement" || CommunityService.Kinds.Contains(kind) ? kind! : "Update";

    [HttpDelete("posts/{id:guid}")]
    public async Task<IActionResult> DeletePost(Guid id, CancellationToken ct) =>
        await db.Posts.Where(p => p.Id == id).ExecuteDeleteAsync(ct) > 0 ? NoContent() : NotFound();

    [HttpGet("posts/{id:guid}/comments")]
    public async Task<ActionResult<IReadOnlyList<AdminCommentResponse>>> PostComments(Guid id, CancellationToken ct) =>
        Ok(await db.PostComments.AsNoTracking().Where(c => c.PostId == id).OrderBy(c => c.CreatedAt)
            .Select(c => new AdminCommentResponse(c.Id, c.Author.FullName, c.Content, c.CreatedAt)).ToListAsync(ct));

    [HttpDelete("comments/{id:guid}")]
    public async Task<IActionResult> DeleteComment(Guid id, CancellationToken ct) =>
        await db.PostComments.Where(c => c.Id == id).ExecuteDeleteAsync(ct) > 0 ? NoContent() : NotFound();

    // ---------------------------------------------------------------- groups

    [HttpGet("groups")]
    public async Task<ActionResult<IReadOnlyList<AdminGroupResponse>>> Groups([FromQuery] string? q, CancellationToken ct)
    {
        var groups = db.StudyGroups.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            groups = groups.Where(g => EF.Functions.ILike(g.Name, term));
        }
        return Ok(await groups.OrderByDescending(g => g.CreatedAt).Take(300).Select(g => new AdminGroupResponse(
            g.Id, g.Name, g.Description,
            db.Users.Where(u => u.Id == g.OwnerId).Select(u => u.FullName).FirstOrDefault() ?? "",
            db.Users.Where(u => u.Id == g.OwnerId).Select(u => u.Email).FirstOrDefault() ?? "",
            g.Members.Count, db.BoardTasks.Count(t => t.GroupId == g.Id), db.GroupMessages.Count(m => m.GroupId == g.Id),
            db.RoadmapRequests.Where(r => r.Id == g.RoadmapRequestId).Select(r => r.Title).FirstOrDefault(),
            g.CreatedAt)).ToListAsync(ct));
    }

    [HttpGet("groups/{id:guid}/members")]
    public async Task<ActionResult<IReadOnlyList<AdminGroupMemberResponse>>> GroupMembers(Guid id, CancellationToken ct) =>
        Ok(await db.GroupMembers.AsNoTracking().Where(m => m.GroupId == id).OrderBy(m => m.JoinedAt)
            .Select(m => new AdminGroupMemberResponse(m.UserId, m.User.FullName, m.User.Email, m.Role, m.JoinedAt)).ToListAsync(ct));

    [HttpDelete("groups/{id:guid}")]
    public async Task<IActionResult> DeleteGroup(Guid id, CancellationToken ct) =>
        await db.StudyGroups.Where(g => g.Id == id).ExecuteDeleteAsync(ct) > 0 ? NoContent() : NotFound();

    // ---------------------------------------------------------------- home page content

    [HttpGet("site")]
    public async Task<ActionResult<IReadOnlyList<AdminSiteEntryResponse>>> SiteEntries(CancellationToken ct) => Ok(await content.SiteEntriesAsync(ct));

    [HttpPost("site")]
    public Task<IActionResult> CreateSiteEntry(SaveSiteEntryRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveSiteEntryAsync(null, body, ct)));

    [HttpPut("site/{id:guid}")]
    public Task<IActionResult> UpdateSiteEntry(Guid id, SaveSiteEntryRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveSiteEntryAsync(id, body, ct)));

    [HttpDelete("site/{id:guid}")]
    public async Task<IActionResult> DeleteSiteEntry(Guid id, CancellationToken ct) =>
        await content.DeleteSiteEntryAsync(id, ct) ? NoContent() : NotFound();

    [HttpPut("site/order")]
    public async Task<IActionResult> ReorderSiteEntries(ReorderRequest body, CancellationToken ct)
    {
        await content.ReorderSiteEntriesAsync(body.Ids, ct);
        return NoContent();
    }

    // ---------------------------------------------------------------- videos

    [HttpGet("videos")]
    public async Task<ActionResult<IReadOnlyList<AdminVideoResponse>>> Videos(CancellationToken ct) => Ok(await content.VideosAsync(ct));

    /// <summary>Reads the title and channel of a YouTube link so the admin does not have to type them.</summary>
    [HttpGet("videos/lookup")]
    public async Task<ActionResult<VideoLookupResponse>> LookupVideo([FromQuery] string url, CancellationToken ct)
    {
        var id = ContentService.YoutubeIdFrom(url);
        if (id is null) return BadRequest("That does not look like a YouTube link.");
        try
        {
            var client = http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            using var res = await client.GetAsync($"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={id}", ct);
            if (!res.IsSuccessStatusCode) return Ok(new VideoLookupResponse(id, null, null));
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            return Ok(new VideoLookupResponse(id,
                doc.RootElement.TryGetProperty("title", out var t) ? t.GetString() : null,
                doc.RootElement.TryGetProperty("author_name", out var a) ? a.GetString() : null));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            return Ok(new VideoLookupResponse(id, null, null));
        }
    }

    [HttpPost("videos")]
    public Task<IActionResult> CreateVideo(SaveVideoRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveVideoAsync(null, body, ct)));

    [HttpPut("videos/{id:guid}")]
    public Task<IActionResult> UpdateVideo(Guid id, SaveVideoRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveVideoAsync(id, body, ct)));

    [HttpDelete("videos/{id:guid}")]
    public Task<IActionResult> DeleteVideo(Guid id, CancellationToken ct) => Run(async () => await content.DeleteVideoAsync(id, ct) ? NoContent() : NotFound());

    // ---------------------------------------------------------------- tracks & lessons

    [HttpGet("tracks")]
    public async Task<ActionResult<IReadOnlyList<AdminTrackResponse>>> Tracks(CancellationToken ct) => Ok(await content.TracksAsync(ct));

    [HttpPost("tracks")]
    public Task<IActionResult> CreateTrack(SaveTrackRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveTrackAsync(null, body, ct)));

    [HttpPut("tracks/{id:guid}")]
    public Task<IActionResult> UpdateTrack(Guid id, SaveTrackRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveTrackAsync(id, body, ct)));

    [HttpDelete("tracks/{id:guid}")]
    public Task<IActionResult> DeleteTrack(Guid id, CancellationToken ct) => Run(async () => await content.DeleteTrackAsync(id, ct) ? NoContent() : NotFound());

    [HttpPut("tracks/order")]
    public async Task<IActionResult> ReorderTracks(ReorderRequest body, CancellationToken ct)
    {
        await content.ReorderTracksAsync(body.Ids, ct);
        return NoContent();
    }

    [HttpPut("tracks/{id:guid}/order")]
    public async Task<IActionResult> ReorderLessons(Guid id, ReorderRequest body, CancellationToken ct)
    {
        await content.ReorderLessonsAsync(id, body.Ids, ct);
        return NoContent();
    }

    [HttpGet("lessons/{id:guid}")]
    public async Task<ActionResult<AdminLessonResponse>> Lesson(Guid id, CancellationToken ct) =>
        await content.LessonAsync(id, ct) is { } lesson ? Ok(lesson) : NotFound();

    [HttpPost("lessons")]
    public Task<IActionResult> CreateLesson(SaveLessonRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveLessonAsync(null, body, ct)));

    [HttpPut("lessons/{id:guid}")]
    public Task<IActionResult> UpdateLesson(Guid id, SaveLessonRequest body, CancellationToken ct) => Run(async () => Ok(await content.SaveLessonAsync(id, body, ct)));

    [HttpDelete("lessons/{id:guid}")]
    public async Task<IActionResult> DeleteLesson(Guid id, CancellationToken ct) =>
        await content.DeleteLessonAsync(id, ct) ? NoContent() : NotFound();

    // ---------------------------------------------------------------- templates & examples

    [HttpGet("files")]
    public async Task<ActionResult<IReadOnlyList<AdminFileResponse>>> Files(CancellationToken ct) => Ok(await content.FilesAsync(ct));

    /// <summary>Admins can preview unpublished files too.</summary>
    [HttpGet("files/{id:guid}/download")]
    public async Task<IActionResult> DownloadFile(Guid id, CancellationToken ct) =>
        await content.FileAsync(id, includeUnpublished: true, ct) is { } f ? File(f.Data, f.ContentType, f.FileName) : NotFound();

    [HttpPost("files")]
    [RequestSizeLimit(16 * 1024 * 1024)]
    public Task<IActionResult> CreateFile([FromForm] ContentService.FileForm form, CancellationToken ct) => Run(async () => Ok(await content.SaveFileAsync(null, form, ct)));

    [HttpPut("files/{id:guid}")]
    [RequestSizeLimit(16 * 1024 * 1024)]
    public Task<IActionResult> UpdateFile(Guid id, [FromForm] ContentService.FileForm form, CancellationToken ct) => Run(async () => Ok(await content.SaveFileAsync(id, form, ct)));

    [HttpDelete("files/{id:guid}")]
    public async Task<IActionResult> DeleteFile(Guid id, CancellationToken ct) =>
        await content.DeleteFileAsync(id, ct) ? NoContent() : NotFound();

    [HttpPut("files/order")]
    public async Task<IActionResult> ReorderFiles(ReorderRequest body, CancellationToken ct)
    {
        await content.ReorderFilesAsync(body.Ids, ct);
        return NoContent();
    }

    // ---------------------------------------------------------------- search

    /// <summary>One search box for the whole console: users, groups, posts, lessons, videos, files, resources and characters.</summary>
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<AdminSearchHit>>> Search([FromQuery] string q, CancellationToken ct)
    {
        q = q?.Trim() ?? "";
        if (q.Length < 2) return Ok(Array.Empty<AdminSearchHit>());
        var t = $"%{q}%";
        var hits = new List<AdminSearchHit>();
        hits.AddRange(await db.Users.Where(u => EF.Functions.ILike(u.FullName, t) || EF.Functions.ILike(u.Email, t)).Take(6)
            .Select(u => new AdminSearchHit("User", u.Id, u.FullName, u.Email, "/admin/users?open=" + u.Id)).ToListAsync(ct));
        hits.AddRange(await db.StudyGroups.Where(g => EF.Functions.ILike(g.Name, t)).Take(5)
            .Select(g => new AdminSearchHit("Group", g.Id, g.Name, null, "/admin/groups?q=" + g.Name)).ToListAsync(ct));
        hits.AddRange(await db.Posts.Where(p => EF.Functions.ILike(p.Content, t) || (p.ProjectTitle != null && EF.Functions.ILike(p.ProjectTitle, t))).Take(5)
            .Select(p => new AdminSearchHit("Post", p.Id, p.ProjectTitle ?? p.Content.Substring(0, Math.Min(70, p.Content.Length)), p.Author.FullName + " · " + p.Status, "/admin/community?q=" + q)).ToListAsync(ct));
        hits.AddRange(await db.LearnLessons.Where(l => EF.Functions.ILike(l.Title, t)).Take(5)
            .Select(l => new AdminSearchHit("Lesson", l.Id, l.Title, l.Track.Label, "/admin/lessons/" + l.Id)).ToListAsync(ct));
        hits.AddRange(await db.LearnVideos.Where(v => EF.Functions.ILike(v.Title, t) || EF.Functions.ILike(v.Channel, t)).Take(5)
            .Select(v => new AdminSearchHit("Video", v.Id, v.Title, v.Channel, "/admin/videos?q=" + q)).ToListAsync(ct));
        hits.AddRange(await db.ContentFiles.Where(f => EF.Functions.ILike(f.Name, t) || EF.Functions.ILike(f.FileName, t)).Take(5)
            .Select(f => new AdminSearchHit(f.Kind, f.Id, f.Name, f.FileName, "/admin/files")).ToListAsync(ct));
        hits.AddRange(await db.Resources.Where(r => EF.Functions.ILike(r.Title, t) || EF.Functions.ILike(r.Topic, t)).Take(5)
            .Select(r => new AdminSearchHit("Resource", r.Id, r.Title, r.Topic, "/admin/resources?q=" + q)).ToListAsync(ct));
        hits.AddRange(await db.VivaCharacters.Where(c => EF.Functions.ILike(c.Name, t)).Take(5)
            .Select(c => new AdminSearchHit("Character", c.Id, c.Name, c.Language, "/admin/viva")).ToListAsync(ct));
        hits.AddRange(await db.SiteEntries.Where(e => EF.Functions.ILike(e.Title, t) || EF.Functions.ILike(e.Body, t)).Take(5)
            .Select(e => new AdminSearchHit("Home page", e.Id, e.Title, e.Section, "/admin/site")).ToListAsync(ct));
        return Ok(hits);
    }

    // ---------------------------------------------------------------- mock viva

    [HttpGet("viva")]
    public async Task<ActionResult<AdminVivaStats>> VivaStats(CancellationToken ct) => Ok(await viva.StatsAsync(ct));

    [HttpPost("viva/characters")]
    public Task<IActionResult> CreateCharacter(SaveVivaCharacterRequest body, CancellationToken ct) => Run(async () => Ok(await viva.SaveCharacterAsync(null, body, ct)));

    [HttpPut("viva/characters/{id:guid}")]
    public Task<IActionResult> UpdateCharacter(Guid id, SaveVivaCharacterRequest body, CancellationToken ct) => Run(async () => Ok(await viva.SaveCharacterAsync(id, body, ct)));

    [HttpDelete("viva/characters/{id:guid}")]
    public Task<IActionResult> DeleteCharacter(Guid id, CancellationToken ct) => Run(async () => await viva.DeleteCharacterAsync(id, ct) ? NoContent() : NotFound());

    // Validation problems become 400 with a readable message, conflicts 409, missing rows 404.
    async Task<IActionResult> Run(Func<Task<IActionResult>> action)
    {
        try { return await action(); }
        catch (ArgumentException e) { return BadRequest(e.Message); }
        catch (InvalidOperationException e) { return Conflict(e.Message); }
        catch (KeyNotFoundException) { return NotFound(); }
    }
}
