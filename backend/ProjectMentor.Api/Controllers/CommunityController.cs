using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

/// <summary>
/// The community (Facebook-style). Logged-out visitors may read public posts, comments and profiles; everything else needs a login.
/// </summary>
[ApiController]
[Authorize]
[Route("api/community")]
public sealed class CommunityController(CommunityService community, ProjectMentorDbContext db, UploadService uploads) : ControllerBase
{
    private bool IsAdmin => User.IsInRole("Admin");
    private Guid Me => User.Identity?.IsAuthenticated == true ? User.GetUserId() : Guid.Empty;

    [HttpGet("posts")]
    [AllowAnonymous]
    public async Task<ActionResult<FeedResponse>> Feed([FromQuery] string? kind, [FromQuery] bool mine, [FromQuery] string? q,
        [FromQuery] DateTimeOffset? before, [FromQuery] Guid? author, CancellationToken ct) =>
        Ok(await community.FeedAsync(Me, IsAdmin, kind, mine && Me != Guid.Empty, q, before, ct, author));

    [HttpPost("posts")]
    public async Task<ActionResult<PostResponse>> Create(CreatePostRequest body, CancellationToken ct)
    {
        try { return Ok(await community.CreateAsync(Me, IsAdmin, body, ct)); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPut("posts/{id:guid}")]
    public async Task<ActionResult<PostResponse>> Update(Guid id, UpdatePostRequest body, CancellationToken ct)
    {
        try { return await community.UpdateAsync(Me, IsAdmin, id, body, ct) is { } p ? Ok(p) : NotFound(); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("posts/{id:guid}/share")]
    public async Task<ActionResult<PostResponse>> Share(Guid id, SharePostRequest body, CancellationToken ct) =>
        await community.ShareAsync(Me, id, body, ct) is { } p ? Ok(p) : NotFound();

    [HttpDelete("posts/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct) =>
        await community.DeleteAsync(Me, IsAdmin, id, ct) ? NoContent() : NotFound();

    [HttpGet("posts/pending")]
    public async Task<ActionResult<IReadOnlyList<PostResponse>>> Pending(CancellationToken ct) =>
        Ok(await community.PendingAsync(Me, ct));

    [HttpGet("posts/{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<PostResponse>> Get(Guid id, CancellationToken ct) =>
        await community.GetAsync(Me, IsAdmin, id, ct) is { } p ? Ok(p) : NotFound();

    [HttpPost("posts/{id:guid}/react")]
    public async Task<ActionResult<ReactionResult>> React(Guid id, ReactRequest body, CancellationToken ct) =>
        await community.ReactAsync(Me, id, body.Reaction, ct) is { } r ? Ok(r) : NotFound();

    /// <summary>Old clients: toggles a plain Like.</summary>
    [HttpPost("posts/{id:guid}/like")]
    public async Task<IActionResult> Like(Guid id, CancellationToken ct)
    {
        var r = await community.ReactAsync(Me, id, "Like", ct);
        return r is null ? NotFound() : Ok(new { likeCount = r.Total, liked = r.MyReaction is not null });
    }

    [HttpGet("posts/{id:guid}/comments")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<CommentResponse>>> Comments(Guid id, CancellationToken ct)
    {
        var list = await community.CommentsAsync(Me, IsAdmin, id, ct);
        return list is null ? NotFound() : Ok(list);
    }

    [HttpPost("posts/{id:guid}/comments")]
    public async Task<ActionResult<CommentResponse>> AddComment(Guid id, CreateCommentRequest body, CancellationToken ct)
    {
        try { return await community.AddCommentAsync(Me, IsAdmin, id, body, ct) is { } c ? Ok(c) : NotFound(); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPut("comments/{id:guid}")]
    public async Task<ActionResult<CommentResponse>> UpdateComment(Guid id, UpdateCommentRequest body, CancellationToken ct)
    {
        try { return await community.UpdateCommentAsync(Me, id, body, ct) is { } c ? Ok(c) : NotFound(); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("comments/{id:guid}/react")]
    public async Task<ActionResult<ReactionResult>> ReactComment(Guid id, ReactRequest body, CancellationToken ct) =>
        await community.ReactCommentAsync(Me, id, body.Reaction, ct) is { } r ? Ok(r) : NotFound();

    [HttpDelete("comments/{id:guid}")]
    public async Task<IActionResult> DeleteComment(Guid id, CancellationToken ct) =>
        await community.DeleteCommentAsync(Me, IsAdmin, id, ct) ? NoContent() : NotFound();

    // ---------------- people, friends, page, search ----------------

    [HttpGet("search")]
    [AllowAnonymous]
    public async Task<ActionResult<CommunitySearchResponse>> Search([FromQuery] string? q, CancellationToken ct) =>
        Ok(await community.SearchAsync(Me, IsAdmin, q, ct));

    [HttpGet("friends")]
    public async Task<ActionResult<FriendsOverview>> Friends(CancellationToken ct) => Ok(await community.FriendsAsync(Me, ct));

    [HttpPost("friends/{userId:guid}/request")]
    public async Task<IActionResult> SendRequest(Guid userId, CancellationToken ct)
    {
        try { return Ok(new { relationship = await community.SendRequestAsync(Me, userId, ct) }); }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("friends/{userId:guid}/accept")]
    public async Task<IActionResult> Accept(Guid userId, CancellationToken ct)
    {
        try { return Ok(new { relationship = await community.RespondAsync(Me, userId, true, ct) }); }
        catch (KeyNotFoundException) { return NotFound("That request was cancelled."); }
    }

    [HttpPost("friends/{userId:guid}/decline")]
    public async Task<IActionResult> Decline(Guid userId, CancellationToken ct)
    {
        try { return Ok(new { relationship = await community.RespondAsync(Me, userId, false, ct) }); }
        catch (KeyNotFoundException) { return NotFound("That request was cancelled."); }
    }

    /// <summary>Cancel a sent request, or unfriend.</summary>
    [HttpDelete("friends/{userId:guid}")]
    public async Task<IActionResult> Remove(Guid userId, CancellationToken ct) =>
        await community.RemoveAsync(Me, userId, ct) ? Ok(new { relationship = "None" }) : NotFound();

    [HttpPost("pages/{pageId:guid}/follow")]
    public async Task<IActionResult> Follow(Guid pageId, CancellationToken ct)
    {
        try { return Ok(new { following = await community.ToggleFollowAsync(Me, pageId, ct) }); }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    /// <summary>Red badges for the community top bar.</summary>
    [HttpGet("counts")]
    public async Task<ActionResult<CommunityCounts>> Counts(CancellationToken ct)
    {
        var me = Me;
        return Ok(new CommunityCounts(
            await db.UserNotifications.CountAsync(n => n.UserId == me && !n.IsRead && n.Scope == "Community", ct),
            await db.Friendships.CountAsync(f => f.AddresseeId == me && f.Status == FriendStatus.Pending, ct)));
    }

    /// <summary>The official ProjectMentor page.</summary>
    [HttpGet("page")]
    [AllowAnonymous]
    public async Task<IActionResult> Page(CancellationToken ct)
    {
        var id = await community.PageIdAsync(ct);
        return id == Guid.Empty ? NotFound() : Ok(await community.ProfileAsync(Me, id, ct));
    }

    // ---------------- community profiles ----------------

    [HttpGet("profiles/{userId:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<CommunityProfileResponse>> Profile(Guid userId, CancellationToken ct) =>
        await community.ProfileAsync(Me, userId, ct) is { } p ? Ok(p) : NotFound();

    [HttpGet("profiles/{userId:guid}/friends")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<PersonCard>>> ProfileFriends(Guid userId, CancellationToken ct) =>
        await community.ProfileFriendsAsync(Me, userId, ct) is { } list ? Ok(list) : NotFound();

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(UpdateCommunityProfileRequest body, CancellationToken ct)
    {
        try { await community.UpdateProfileAsync(Me, body, ct); return Ok(await community.ProfileAsync(Me, Me, ct)); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("profile/cover")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> Cover(IFormFile file, CancellationToken ct)
    {
        try { return Ok(new { coverId = await SetCoverAsync(db, uploads, Me, file, ct) }); }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpDelete("profile/cover")]
    public async Task<IActionResult> RemoveCover(CancellationToken ct)
    {
        await SetCoverAsync(db, uploads, Me, null, ct);
        return NoContent();
    }

    /// <summary>Replaces (or removes, when file is null) a user's cover picture. Also used by the admin page editor.</summary>
    public static async Task<Guid?> SetCoverAsync(ProjectMentorDbContext db, UploadService uploads, Guid userId, IFormFile? file, CancellationToken ct)
    {
        Guid? newId = null;
        if (file is not null)
        {
            var saved = await uploads.SaveAsync(userId, file, ct);
            if (!saved.ContentType.StartsWith("image/"))
            {
                await db.Uploads.Where(x => x.Id == saved.Id).ExecuteDeleteAsync(ct);
                throw new ArgumentException("Choose an image (PNG, JPG, GIF or WebP).");
            }
            newId = saved.Id;
        }
        var u = await db.Users.FirstAsync(x => x.Id == userId, ct);
        var old = u.CoverUploadId;
        u.CoverUploadId = newId;
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (old is { } oldId) await db.Uploads.Where(x => x.Id == oldId).ExecuteDeleteAsync(ct);
        return newId;
    }
}

/// <summary>File uploads (post images/files, chat images). Upload needs a login; files are served by unguessable id.</summary>
[ApiController]
[Route("api/uploads")]
public sealed class UploadsController(UploadService uploads) : ControllerBase
{
    [HttpPost]
    [Authorize]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<ActionResult<UploadInfo>> Upload(IFormFile file, CancellationToken ct)
    {
        try { return Ok(await uploads.SaveAsync(User.GetUserId(), file, ct)); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    // Anonymous so <img src> works without a token; ids are random GUIDs that are only shown to people who can see the post/chat.
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var file = await uploads.GetAsync(id, ct);
        if (file is null) return NotFound();
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Cache-Control"] = "private, max-age=86400";
        // CORS headers are only added when the request has an Origin, so <img> and fetch() copies must be cached separately.
        Response.Headers["Vary"] = "Origin";
        var inline = file.ContentType.StartsWith("image/") || file.ContentType == "application/pdf";
        return inline ? File(file.Data, file.ContentType) : File(file.Data, file.ContentType, file.FileName);
    }
}
