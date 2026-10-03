using System.Security.Claims;
using BCrypt.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(ProjectMentorDbContext db, TokenService tokens, SettingsService settings, EmailService mailer, IHttpClientFactory http) : ControllerBase
{
    /// <summary>Allowed Google OAuth client ids (web + Android) from Admin → System settings. The first one is the web client.</summary>
    string[] GoogleClientIds => settings.GoogleClientIds;

    /// <summary>403 body the website and app use to show "Your account is deactivated" with a Contact admin form.</summary>
    ObjectResult Deactivated(User u) => StatusCode(403, new
    {
        code = "deactivated",
        message = "Your account is deactivated. Contact the ProjectMentor admins.",
        name = u.FullName, email = u.Email, reason = u.DeactivationReason,
    });

    /// <summary>Tells the website and app whether "Sign in with Google" is set up.</summary>
    [HttpGet("config")]
    public ActionResult<AuthConfigResponse> Config() => Ok(new AuthConfigResponse(settings.Get("GOOGLE_WEB_CLIENT_ID")));

    /// <summary>
    /// Sign in (or sign up) with a Google ID token from Google Identity Services (web) or google_sign_in (app).
    /// The token is checked with Google; an existing account with the same verified email is linked.
    /// </summary>
    [HttpPost("google")]
    public async Task<ActionResult<AuthResponse>> Google(GoogleSignInRequest request, CancellationToken ct)
    {
        if (GoogleClientIds.Length == 0) return BadRequest("Google sign-in is not set up on this server yet.");
        if (string.IsNullOrWhiteSpace(request.IdToken)) return BadRequest("Missing Google token.");
        System.Text.Json.JsonElement info;
        try
        {
            using var res = await http.CreateClient().GetAsync("https://oauth2.googleapis.com/tokeninfo?id_token=" + Uri.EscapeDataString(request.IdToken), ct);
            if (!res.IsSuccessStatusCode) return Unauthorized("Google could not verify this sign-in. Please try again.");
            info = System.Text.Json.JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct)).RootElement.Clone();
        }
        catch (HttpRequestException) { return StatusCode(503, "Cannot reach Google right now. Please try again."); }

        string? Get(string k) => info.TryGetProperty(k, out var v) ? v.GetString() : null;
        if (!GoogleClientIds.Contains(Get("aud"))) return Unauthorized("This Google sign-in was not made for ProjectMentor.");
        if (Get("email_verified") != "true" || string.IsNullOrEmpty(Get("email"))) return Unauthorized("Your Google email is not verified.");
        var sub = Get("sub")!;
        var email = Get("email")!.Trim().ToLowerInvariant();

        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubject == sub, ct) ?? await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        var now = DateTimeOffset.UtcNow;
        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid(), Email = email, FullName = Get("name") is { Length: > 1 } n ? n : email.Split('@')[0],
                // Google-only accounts have no usable password; "google:" marks that.
                PasswordHash = "google:" + Guid.NewGuid().ToString("N"), Role = UserRole.Student, IsActive = true, GoogleSubject = sub,
                CreatedAt = now, UpdatedAt = now,
            };
            db.Users.Add(user);
        }
        else
        {
            if (user.IsOfficial) return Unauthorized("This account cannot sign in.");
            if (!user.IsActive) return Deactivated(user);
            user.GoogleSubject ??= sub;
            user.UpdatedAt = now;
        }
        var isNew = db.Entry(user).State == EntityState.Added;
        await db.SaveChangesAsync(ct);
        if (isNew) await mailer.SendWelcomeAsync(user, ct);
        return Ok(ToResponse(user));
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password) || string.IsNullOrWhiteSpace(request.FullName))
            return BadRequest("Email, password, and full name are required.");

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, cancellationToken))
            return Conflict("A user with that email already exists.");

        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName.Trim(),
            Role = UserRole.Student,
            YearOfStudy = request.YearOfStudy,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        await mailer.SendWelcomeAsync(user, cancellationToken);
        return Ok(ToResponse(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
        if (user is null || user.IsOfficial || user.PasswordHash.StartsWith("google:") || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("Invalid email or password.");
        if (!user.IsActive) return Deactivated(user);

        return Ok(ToResponse(user));
    }

    /// <summary>Step 1 of "Forgot password": emails a 6-digit code. Always answers OK so emails cannot be probed.</summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        var addr = request.Email?.Trim().ToLowerInvariant() ?? "";
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == addr && u.IsActive && !u.IsOfficial, ct);
        if (user is not null)
        {
            // At most 5 codes per hour per account.
            var recent = await db.PasswordResetCodes.CountAsync(c => c.UserId == user.Id && c.CreatedAt > DateTimeOffset.UtcNow.AddHours(-1), ct);
            if (recent < 5)
            {
                var code = System.Security.Cryptography.RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
                await db.PasswordResetCodes.Where(c => c.UserId == user.Id && c.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, DateTimeOffset.UtcNow), ct);
                db.PasswordResetCodes.Add(new PasswordResetCode { Id = Guid.NewGuid(), UserId = user.Id, CodeHash = BCrypt.Net.BCrypt.HashPassword(code), ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15) });
                await db.SaveChangesAsync(ct);
                await mailer.SendResetCodeAsync(user, code, ct);
            }
        }
        return Ok(new { message = "If an account uses that email, we sent it a 6-digit code. It expires in 15 minutes.", emailReady = mailer.IsConfigured });
    }

    /// <summary>Step 2: checks the code and sets the new password (also works for Google-only accounts).</summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8) return BadRequest("Choose a password with at least 8 characters.");
        var addr = request.Email?.Trim().ToLowerInvariant() ?? "";
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == addr && u.IsActive && !u.IsOfficial, ct);
        var code = user is null ? null : await db.PasswordResetCodes.Where(c => c.UserId == user.Id && c.UsedAt == null && c.ExpiresAt > DateTimeOffset.UtcNow)
            .OrderByDescending(c => c.CreatedAt).FirstOrDefaultAsync(ct);
        if (user is null || code is null) return BadRequest("That code has expired. Ask for a new one.");
        if (code.Attempts >= 5) return BadRequest("Too many wrong tries. Ask for a new code.");
        if (!BCrypt.Net.BCrypt.Verify(request.Code?.Trim() ?? "", code.CodeHash))
        {
            code.Attempts++;
            await db.SaveChangesAsync(ct);
            return BadRequest("That code is not correct.");
        }
        code.UsedAt = DateTimeOffset.UtcNow;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(ToResponse(user));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var user = await db.Users.FindAsync([userId], cancellationToken);
        return user is null ? NotFound() : Ok(new CurrentUserResponse(user.Id, user.Email, user.FullName, user.Role.ToString()));
    }

    private AuthResponse ToResponse(User user) => new(user.Id, user.Email, user.FullName, user.Role.ToString(), tokens.CreateToken(user));
}

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var userId) ? userId : throw new UnauthorizedAccessException("Missing user identity.");
    }
}
