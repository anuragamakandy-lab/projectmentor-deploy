using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

public sealed record SaveSettingsRequest(Dictionary<string, string?> Values);
public sealed record TestEmailRequest(string? To);
public sealed record AdminSendEmailRequest(string Audience, IReadOnlyList<Guid>? UserIds, string? Badge, string Subject, string? Heading, string Body);
public sealed record SupportReplyRequest(string Body);
public sealed record SupportStatusRequest(string Status);
public sealed record PageDetailsRequest(string? Bio, string? University, string? Location, string? Website, string? Skills);
public sealed record PagePostRequest(string? Content, string? Kind, string? ProjectTitle, IReadOnlyList<Guid>? UploadIds, string? Visibility);
public sealed record PageCommentRequest(string? Content, Guid? ParentId);

/// <summary>
/// Admin panel: System settings (API keys and switches), emails (send + log), the support inbox and the official
/// ProjectMentor community page.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public sealed class AdminSystemController(ProjectMentorDbContext db, SettingsService settings, EmailService email,
    CommunityService community, UploadService uploads) : ControllerBase
{
    // ---------------------------------------------------------------- system settings

    [HttpGet("settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) =>
        Ok(new { items = await settings.AdminViewAsync(ct), emailReady = email.IsConfigured, aiReady = !string.IsNullOrWhiteSpace(settings.Get("GEMINI_API_KEY")) });

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings(SaveSettingsRequest body, CancellationToken ct)
    {
        foreach (var (key, value) in body.Values ?? [])
        {
            var def = SettingsService.Find(key);
            if (def is null) return BadRequest($"Unknown setting {key}.");
            if (def.Type == "email" && !string.IsNullOrWhiteSpace(value) && !value.Contains('@')) return BadRequest($"{def.Label} must be an email address.");
            if (key.EndsWith("_URL") && !string.IsNullOrWhiteSpace(value) && !Uri.TryCreate(value, UriKind.Absolute, out _)) return BadRequest($"{def.Label} must be a full web address, e.g. https://example.com");
        }
        await settings.SaveAsync(body.Values ?? [], ct);
        return await Settings(ct);
    }

    [HttpPost("settings/test-email")]
    public async Task<IActionResult> TestEmail(TestEmailRequest body, CancellationToken ct)
    {
        var to = string.IsNullOrWhiteSpace(body.To) ? settings.Get("ADMIN_EMAIL") : body.To.Trim();
        if (string.IsNullOrWhiteSpace(to)) return BadRequest("Enter an email address or set the admin email first.");
        var ok = await email.SendAsync(to, "ProjectMentor admin", "Test", new EmailContent(
            "ProjectMentor test email", "Your email settings work", "Test",
            EmailService.Paragraphs("This is a test email from Admin → System settings. If you can read it, EmailJS and the ProjectMentor template are set up correctly.")), ct: ct);
        if (ok) return Ok(new { message = $"Test email sent to {to}." });
        var last = await db.EmailLogs.OrderByDescending(e => e.CreatedAt).Select(e => e.Error).FirstOrDefaultAsync(ct);
        return BadRequest(last ?? "The email could not be sent.");
    }

    // ---------------------------------------------------------------- emails

    [HttpGet("emails")]
    public async Task<IActionResult> Emails([FromQuery] string? kind, [FromQuery] string? status, [FromQuery] string? q, CancellationToken ct)
    {
        var list = db.EmailLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(kind)) list = list.Where(e => e.Kind == kind);
        if (!string.IsNullOrWhiteSpace(status)) list = list.Where(e => e.Status == status);
        if (!string.IsNullOrWhiteSpace(q)) { var t = $"%{q.Trim()}%"; list = list.Where(e => EF.Functions.ILike(e.ToEmail, t) || EF.Functions.ILike(e.Subject, t)); }
        var items = await list.OrderByDescending(e => e.CreatedAt).Take(300)
            .Select(e => new { e.Id, e.ToEmail, e.ToName, e.Subject, e.Kind, e.Status, e.Error, e.CreatedAt }).ToListAsync(ct);
        var since = DateTimeOffset.UtcNow.AddDays(-30);
        var month = await db.EmailLogs.CountAsync(e => e.Status == "Sent" && e.CreatedAt > since, ct);
        return Ok(new { items, sentLast30Days = month, ready = email.IsConfigured });
    }

    /// <summary>Audience: user (UserIds), all (every active student), badge (students with that badge).</summary>
    [HttpPost("emails/send")]
    public async Task<IActionResult> SendEmail(AdminSendEmailRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Subject) || string.IsNullOrWhiteSpace(body.Body)) return BadRequest("Write a subject and a message.");
        if (!email.IsConfigured) return BadRequest("Set up EmailJS in System settings first.");
        var students = db.Users.AsNoTracking().Where(u => u.Role == UserRole.Student && !u.IsOfficial);
        students = body.Audience switch
        {
            "user" => students.Where(u => (body.UserIds ?? new List<Guid>()).Contains(u.Id)),
            "badge" => students.Where(u => u.IsActive && u.Badge == body.Badge),
            "all" => students.Where(u => u.IsActive),
            _ => students.Where(_ => false),
        };
        var recipients = await students.Select(u => new { u.Email, u.FullName }).Take(500).ToListAsync(ct);
        if (recipients.Count == 0) return BadRequest("No students match that audience.");
        var kind = body.Audience == "user" ? "Custom" : "Announcement";
        var heading = string.IsNullOrWhiteSpace(body.Heading) ? body.Subject.Trim() : body.Heading.Trim();
        var sent = 0;
        foreach (var r in recipients)
            if (await email.SendAdminMessageAsync(r.Email, r.FullName, kind, body.Subject.Trim(), heading, body.Body.Trim(), User.GetUserId(), ct)) sent++;
        return Ok(new { sent, failed = recipients.Count - sent, message = $"Sent {sent} of {recipients.Count} email(s)." });
    }

    // ---------------------------------------------------------------- support inbox

    [HttpGet("support")]
    public async Task<IActionResult> Support([FromQuery] string? status, CancellationToken ct)
    {
        var list = db.SupportRequests.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) list = list.Where(s => s.Status == status);
        var items = await list.OrderByDescending(s => s.CreatedAt).Take(300).Select(s => new
        {
            s.Id, s.UserId, s.Name, s.Email, s.Subject, s.Message, s.Status, s.Reply, s.RepliedAt, s.CreatedAt,
            AccountActive = s.UserId == null ? (bool?)null : db.Users.Where(u => u.Id == s.UserId).Select(u => (bool?)u.IsActive).FirstOrDefault(),
        }).ToListAsync(ct);
        return Ok(new { items, open = await db.SupportRequests.CountAsync(s => s.Status == "Open", ct) });
    }

    [HttpPost("support/{id:guid}/reply")]
    public async Task<IActionResult> Reply(Guid id, SupportReplyRequest body, CancellationToken ct)
    {
        var r = await db.SupportRequests.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (r is null) return NotFound();
        if (string.IsNullOrWhiteSpace(body.Body)) return BadRequest("Write a reply first.");
        var ok = await email.SendAdminMessageAsync(r.Email, r.Name, "SupportReply", "Re: " + r.Subject, "A reply from ProjectMentor", body.Body.Trim(), User.GetUserId(), ct);
        r.Reply = body.Body.Trim().Length > 4000 ? body.Body.Trim()[..4000] : body.Body.Trim();
        r.RepliedAt = DateTimeOffset.UtcNow;
        r.Status = "Replied";
        r.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { emailed = ok, message = ok ? "Reply sent by email." : "Reply saved, but the email could not be sent. Check System settings." });
    }

    [HttpPatch("support/{id:guid}")]
    public async Task<IActionResult> SupportStatus(Guid id, SupportStatusRequest body, CancellationToken ct)
    {
        if (body.Status is not ("Open" or "Replied" or "Closed")) return BadRequest("Unknown status.");
        return await db.SupportRequests.Where(s => s.Id == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, body.Status), ct) > 0 ? NoContent() : NotFound();
    }

    [HttpDelete("support/{id:guid}")]
    public async Task<IActionResult> DeleteSupport(Guid id, CancellationToken ct) =>
        await db.SupportRequests.Where(s => s.Id == id).ExecuteDeleteAsync(ct) > 0 ? NoContent() : NotFound();

    // ---------------------------------------------------------------- official ProjectMentor page

    async Task<Guid> PageId(CancellationToken ct) => await community.PageIdAsync(ct);

    [HttpGet("page")]
    public async Task<IActionResult> Page(CancellationToken ct)
    {
        var id = await PageId(ct);
        if (id == Guid.Empty) return NotFound("The ProjectMentor page has not been created yet. Restart the server.");
        var profile = await community.ProfileAsync(id, id, ct);
        var feed = await community.FeedAsync(id, true, null, false, null, null, ct, id);
        return Ok(new { profile, posts = feed.Posts, nextBefore = feed.NextBefore });
    }

    [HttpGet("page/posts")]
    public async Task<IActionResult> PagePosts([FromQuery] DateTimeOffset? before, CancellationToken ct)
    {
        var id = await PageId(ct);
        return Ok(await community.FeedAsync(id, true, null, false, null, before, ct, id));
    }

    [HttpPut("page")]
    public async Task<IActionResult> SavePage(PageDetailsRequest body, CancellationToken ct)
    {
        var id = await PageId(ct);
        var u = await db.Users.FirstAsync(x => x.Id == id, ct);
        try
        {
            await community.UpdateProfileAsync(id, new UpdateCommunityProfileRequest(body.Bio, null, true, body.University, null, body.Location, body.Skills,
                null, null, body.Website, new Dictionary<string, string> { ["university"] = "Public", ["location"] = "Public", ["skills"] = "Public", ["links"] = "Public" }), ct);
        }
        catch (ArgumentException e) { return BadRequest(e.Message); }
        return Ok(await community.ProfileAsync(id, id, ct));
    }

    [HttpPost("page/avatar")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> PageAvatar(IFormFile file, CancellationToken ct)
    {
        var id = await PageId(ct);
        try
        {
            var saved = await uploads.SaveAsync(id, file, ct);
            if (!saved.ContentType.StartsWith("image/")) return BadRequest("Choose an image.");
            var u = await db.Users.FirstAsync(x => x.Id == id, ct);
            var old = u.AvatarUploadId;
            u.AvatarUploadId = saved.Id;
            await db.SaveChangesAsync(ct);
            if (old is { } o) await db.Uploads.Where(x => x.Id == o).ExecuteDeleteAsync(ct);
            return Ok(new { avatarId = saved.Id });
        }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpPost("page/cover")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> PageCover(IFormFile file, CancellationToken ct)
    {
        try { return Ok(new { coverId = await CommunityController.SetCoverAsync(db, uploads, await PageId(ct), file, ct) }); }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpPost("page/posts")]
    public async Task<IActionResult> PagePost(PagePostRequest body, CancellationToken ct)
    {
        try
        {
            return Ok(await community.CreateAsync(await PageId(ct), true, new CreatePostRequest(body.Content,
                body.Kind == "Announcement" ? "Announcement" : body.Kind ?? "Update", body.ProjectTitle, body.UploadIds, null, body.Visibility ?? "Public"), ct, autoApprove: true));
        }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpPut("page/posts/{id:guid}")]
    public async Task<IActionResult> EditPagePost(Guid id, PagePostRequest body, CancellationToken ct)
    {
        try
        {
            return await community.UpdateAsync(await PageId(ct), true, id, new UpdatePostRequest(body.Content, body.Visibility, body.Kind, body.ProjectTitle), ct) is { } p
                ? Ok(p) : NotFound();
        }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpDelete("page/posts/{id:guid}")]
    public async Task<IActionResult> DeletePagePost(Guid id, CancellationToken ct) =>
        await community.DeleteAsync(await PageId(ct), true, id, ct) ? NoContent() : NotFound();

    [HttpGet("page/posts/{id:guid}/comments")]
    public async Task<IActionResult> PageComments(Guid id, CancellationToken ct) =>
        await community.CommentsAsync(await PageId(ct), true, id, ct) is { } list ? Ok(list) : NotFound();

    /// <summary>Reply to comments as ProjectMentor.</summary>
    [HttpPost("page/posts/{id:guid}/comments")]
    public async Task<IActionResult> PageComment(Guid id, PageCommentRequest body, CancellationToken ct)
    {
        try { return await community.AddCommentAsync(await PageId(ct), true, id, new CreateCommentRequest(body.Content, body.ParentId), ct) is { } c ? Ok(c) : NotFound(); }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpDelete("page/comments/{id:guid}")]
    public async Task<IActionResult> DeletePageComment(Guid id, CancellationToken ct) =>
        await community.DeleteCommentAsync(await PageId(ct), true, id, ct) ? NoContent() : NotFound();

    [HttpGet("page/followers")]
    public async Task<IActionResult> Followers(CancellationToken ct)
    {
        var id = await PageId(ct);
        return Ok(await db.PageFollows.AsNoTracking().Where(f => f.PageUserId == id).OrderByDescending(f => f.CreatedAt).Take(500)
            .Join(db.Users, f => f.UserId, u => u.Id, (f, u) => new { u.Id, u.FullName, u.Email, u.AvatarUploadId, Since = f.CreatedAt }).ToListAsync(ct));
    }
}

/// <summary>Public "Contact the admins" form (used by deactivated accounts and logged-out visitors).</summary>
[ApiController]
[Route("api/support")]
public sealed class SupportController(ProjectMentorDbContext db, EmailService email) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(SupportMessageRequest body, CancellationToken ct)
    {
        var name = body.Name?.Trim() ?? "";
        var addr = body.Email?.Trim().ToLowerInvariant() ?? "";
        var subject = body.Subject?.Trim() ?? "";
        var message = body.Message?.Trim() ?? "";
        if (name.Length is < 2 or > 200) return BadRequest("Enter your name.");
        if (addr.Length > 320 || !System.Net.Mail.MailAddress.TryCreate(addr, out _)) return BadRequest("Enter a valid email address.");
        if (subject.Length is < 3 or > 200) return BadRequest("Enter a short subject.");
        if (message.Length is < 10 or > 4000) return BadRequest("Write a message of at least 10 characters.");
        // Simple flood protection: at most 5 messages per email address per day.
        if (await db.SupportRequests.CountAsync(s => s.Email == addr && s.CreatedAt > DateTimeOffset.UtcNow.AddDays(-1), ct) >= 5)
            return StatusCode(429, "You have sent several messages today. Please wait for a reply.");
        var userId = await db.Users.Where(u => u.Email == addr).Select(u => (Guid?)u.Id).FirstOrDefaultAsync(ct);
        var r = new SupportRequest { Id = Guid.NewGuid(), UserId = userId, Name = name, Email = addr, Subject = subject, Message = message };
        db.SupportRequests.Add(r);
        await db.SaveChangesAsync(ct);
        await email.SendSupportReceivedAsync(r, ct);
        return Ok(new { message = "Thanks! Your message was sent to the ProjectMentor admins. They will reply by email." });
    }
}
