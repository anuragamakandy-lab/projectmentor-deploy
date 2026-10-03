using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

/// <summary>The signed-in user's own profile: details, picture, progress, activity and account deletion.</summary>
[ApiController]
[Authorize]
[Route("api/profile")]
public sealed class ProfileController(ProjectMentorDbContext db, AccountService accounts, UploadService uploads) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ProfileResponse>> Get(CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == User.GetUserId(), ct);
        if (u is null) return NotFound();
        return Ok(new ProfileResponse(u.Id, u.FullName, u.Email, u.Role.ToString(), u.YearOfStudy, u.Bio, u.AvatarUploadId, u.Badge,
            !u.PasswordHash.StartsWith("google:"), u.GoogleSubject is not null, u.CreatedAt,
            await accounts.UsageAsync(u.Id, ct)));
    }

    [HttpPut]
    public async Task<IActionResult> Update(UpdateProfileRequest body, CancellationToken ct)
    {
        var name = body.FullName?.Trim() ?? "";
        if (name.Length is < 2 or > 120) return BadRequest("Enter your full name (2 to 120 characters).");
        if (body.YearOfStudy is < 1 or > 6) return BadRequest("Year of study must be 1 to 6.");
        var bio = string.IsNullOrWhiteSpace(body.Bio) ? null : body.Bio.Trim();
        if (bio?.Length > 500) return BadRequest("Keep your bio under 500 characters.");
        var u = await db.Users.FirstAsync(x => x.Id == User.GetUserId(), ct);
        u.FullName = name;
        u.YearOfStudy = body.YearOfStudy;
        u.Bio = bio;
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("avatar")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> Avatar(IFormFile file, CancellationToken ct)
    {
        try
        {
            var userId = User.GetUserId();
            var saved = await uploads.SaveAsync(userId, file, ct);
            if (!saved.ContentType.StartsWith("image/"))
            {
                await db.Uploads.Where(x => x.Id == saved.Id).ExecuteDeleteAsync(ct);
                return BadRequest("Choose an image (PNG, JPG, GIF or WebP).");
            }
            var u = await db.Users.FirstAsync(x => x.Id == userId, ct);
            var old = u.AvatarUploadId;
            u.AvatarUploadId = saved.Id;
            u.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            if (old is { } oldId) await db.Uploads.Where(x => x.Id == oldId && x.OwnerId == userId).ExecuteDeleteAsync(ct);
            return Ok(new { avatarId = saved.Id });
        }
        catch (ArgumentException e) { return BadRequest(e.Message); }
    }

    [HttpDelete("avatar")]
    public async Task<IActionResult> RemoveAvatar(CancellationToken ct)
    {
        var u = await db.Users.FirstAsync(x => x.Id == User.GetUserId(), ct);
        var old = u.AvatarUploadId;
        u.AvatarUploadId = null;
        await db.SaveChangesAsync(ct);
        if (old is { } oldId) await db.Uploads.Where(x => x.Id == oldId && x.OwnerId == u.Id).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    /// <summary>Permanently deletes the account and everything that belongs to it. Needs the password (or the email for Google-only accounts).</summary>
    [HttpPost("delete")]
    public async Task<IActionResult> Delete(DeleteAccountRequest body, CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().FirstAsync(x => x.Id == User.GetUserId(), ct);
        if (u.Role == UserRole.Admin) return BadRequest("Admin accounts cannot be deleted here.");
        var googleOnly = u.PasswordHash.StartsWith("google:");
        var ok = googleOnly
            ? string.Equals(body.ConfirmEmail?.Trim(), u.Email, StringComparison.OrdinalIgnoreCase)
            : !string.IsNullOrEmpty(body.Password) && BCrypt.Net.BCrypt.Verify(body.Password, u.PasswordHash);
        if (!ok) return BadRequest(googleOnly ? "Type your email address exactly to confirm." : "That password is not correct.");
        await accounts.DeleteUserAsync(u.Id, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(AccountService accounts) : ControllerBase
{
    /// <summary>scope=System (navbar bell, default) or Community (inside the Community page).</summary>
    [HttpGet]
    public async Task<ActionResult<NotificationsResponse>> List([FromQuery] string? scope, CancellationToken ct) =>
        Ok(await accounts.NotificationsAsync(User.GetUserId(), ct, scope ?? "System"));

    [HttpPost("read")]
    public async Task<IActionResult> ReadAll([FromQuery] string? scope, CancellationToken ct)
    {
        await accounts.MarkAllReadAsync(User.GetUserId(), ct, scope is "Community" or "System" ? scope : null);
        return NoContent();
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> ReadOne(Guid id, CancellationToken ct)
    {
        await accounts.MarkReadAsync(User.GetUserId(), id, ct);
        return NoContent();
    }
}
