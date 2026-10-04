using System.Security.Claims;
using BCrypt.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(ProjectMentorDbContext db, TokenService tokens, SettingsService settings, EmailService mailer, IHttpClientFactory http,
    IDataProtectionProvider protection, IMemoryCache cache) : ControllerBase
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

    static readonly System.Text.RegularExpressions.Regex EmailRx = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$");

    /// <summary>Shared rules for every new password (register, Google register, reset).</summary>
    internal static string? PasswordProblem(string? p) =>
        string.IsNullOrEmpty(p) || p.Length < 8 ? "Use at least 8 characters for your password."
        : p.Length > 128 ? "Use 128 characters or fewer for your password."
        : !p.Any(char.IsLetter) || !p.Any(char.IsDigit) ? "Your password needs at least one letter and one number."
        : null;

    static string? DetailsProblem(string? email, string? name, short? year)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length < 2) return "Enter your full name.";
        if (name.Trim().Length > 120) return "Your name is too long.";
        if (string.IsNullOrWhiteSpace(email) || email.Trim().Length > 254 || !EmailRx.IsMatch(email.Trim())) return "Enter a valid email address.";
        if (year is not null and (< 1 or > 4)) return "Choose a year of study between 1 and 4.";
        return null;
    }

    ITimeLimitedDataProtector Protector => protection.CreateProtector("ProjectMentor.RegisterVerify").ToTimeLimitedDataProtector();

    /// <summary>Checks a Google ID token with Google. Returns the token's claims, or an error result.</summary>
    async Task<(System.Text.Json.JsonElement info, ActionResult? error)> VerifyGoogle(string? idToken, CancellationToken ct)
    {
        if (GoogleClientIds.Length == 0) return (default, BadRequest("Google sign-in is not set up on this server yet."));
        if (string.IsNullOrWhiteSpace(idToken)) return (default, BadRequest("Missing Google token."));
        System.Text.Json.JsonElement info;
        try
        {
            using var res = await http.CreateClient().GetAsync("https://oauth2.googleapis.com/tokeninfo?id_token=" + Uri.EscapeDataString(idToken), ct);
            if (!res.IsSuccessStatusCode) return (default, Unauthorized("Google could not verify this sign-in. Please try again."));
            info = System.Text.Json.JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct)).RootElement.Clone();
        }
        catch (HttpRequestException) { return (default, StatusCode(503, "Cannot reach Google right now. Please try again.")); }
        if (!GoogleClientIds.Contains(Claim(info, "aud"))) return (default, Unauthorized("This Google sign-in was not made for ProjectMentor."));
        if (Claim(info, "email_verified") != "true" || string.IsNullOrEmpty(Claim(info, "email"))) return (default, Unauthorized("Your Google email is not verified."));
        return (info, null);
    }

    static string? Claim(System.Text.Json.JsonElement info, string k) => info.TryGetProperty(k, out var v) ? v.GetString() : null;

    /// <summary>
    /// Sign in with Google (Google Identity Services on web, google_sign_in in the app). Only signs in an EXISTING account;
    /// a Google account without a ProjectMentor account gets 404 "no_account" and must go through Create account.
    /// </summary>
    [HttpPost("google")]
    public async Task<ActionResult<AuthResponse>> Google(GoogleSignInRequest request, CancellationToken ct)
    {
        var (info, error) = await VerifyGoogle(request.IdToken, ct);
        if (error is not null) return error;
        var sub = Claim(info, "sub")!;
        var email = Claim(info, "email")!.Trim().ToLowerInvariant();

        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubject == sub, ct) ?? await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null)
            return NotFound(new { code = "no_account", email, name = Claim(info, "name"), message = "There is no ProjectMentor account for this Google email yet. Create an account first." });
        if (user.IsOfficial) return Unauthorized("This account cannot sign in.");
        if (!user.IsActive) return Deactivated(user);
        user.GoogleSubject ??= sub;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(ToResponse(user));
    }

    /// <summary>Create account with Google: Google proves the email, and the student must also choose a password.</summary>
    [HttpPost("google/register")]
    public async Task<ActionResult<AuthResponse>> GoogleRegister(GoogleRegisterRequest request, CancellationToken ct)
    {
        var (info, error) = await VerifyGoogle(request.IdToken, ct);
        if (error is not null) return error;
        var sub = Claim(info, "sub")!;
        var email = Claim(info, "email")!.Trim().ToLowerInvariant();
        var name = string.IsNullOrWhiteSpace(request.FullName) ? Claim(info, "name") : request.FullName;
        if (DetailsProblem(email, name, request.YearOfStudy) is { } bad) return BadRequest(bad);
        if (PasswordProblem(request.Password) is { } weak) return BadRequest(weak);
        if (await db.Users.AnyAsync(u => u.Email == email || u.GoogleSubject == sub, ct))
            return Conflict("This Google account already has a ProjectMentor account. Log in instead.");

        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(), Email = email, FullName = name!.Trim(), PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = UserRole.Student, YearOfStudy = request.YearOfStudy, IsActive = true, GoogleSubject = sub, CreatedAt = now, UpdatedAt = now,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return Ok(ToResponse(user));
    }

    /// <summary>Create account step 1: checks the details and emails a 6-digit code to prove the email is real.</summary>
    [HttpPost("register/start")]
    public async Task<ActionResult<RegisterStartResponse>> RegisterStart(RegisterRequest request, CancellationToken ct)
    {
        if (DetailsProblem(request.Email, request.FullName, request.YearOfStudy) is { } bad) return BadRequest(bad);
        if (PasswordProblem(request.Password) is { } weak) return BadRequest(weak);
        var email = request.Email!.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) return Conflict("A user with that email already exists. Log in instead.");
        if (!mailer.IsConfigured) return StatusCode(503, "Email verification is not available right now. Please try again later.");

        // At most 5 codes per email per hour.
        var sent = cache.GetOrCreate("regsent:" + email, e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1); return new int[1]; })!;
        if (sent[0] >= 5) return StatusCode(429, "Too many codes sent to this email. Try again in an hour.");
        sent[0]++;

        var code = System.Security.Cryptography.RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var token = Protector.Protect(email + "\n" + BCrypt.Net.BCrypt.HashPassword(code), TimeSpan.FromMinutes(15));
        if (!await mailer.SendVerifyCodeAsync(email, request.FullName!.Trim(), code, ct))
            return StatusCode(503, "We could not send the verification email. Check the address and try again.");
        return Ok(new RegisterStartResponse(token, email, $"We sent a 6-digit code to {email}. It expires in 15 minutes."));
    }

    /// <summary>Create account step 2: checks the emailed code, then creates the account.</summary>
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (DetailsProblem(request.Email, request.FullName, request.YearOfStudy) is { } bad) return BadRequest(bad);
        if (PasswordProblem(request.Password) is { } weak) return BadRequest(weak);
        if (string.IsNullOrWhiteSpace(request.VerificationToken) || string.IsNullOrWhiteSpace(request.Code))
            return BadRequest("Enter the 6-digit code we emailed you.");
        var email = request.Email!.Trim().ToLowerInvariant();

        string payload;
        try { payload = Protector.Unprotect(request.VerificationToken); }
        catch (System.Security.Cryptography.CryptographicException) { return BadRequest("That code has expired. Ask for a new one."); }
        var parts = payload.Split('\n', 2);
        if (parts.Length != 2 || parts[0] != email) return BadRequest("That code was sent to a different email. Ask for a new one.");

        var tries = cache.GetOrCreate("regtries:" + request.VerificationToken, e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(20); return new int[1]; })!;
        if (tries[0] >= 5) return BadRequest("Too many wrong tries. Ask for a new code.");
        if (!BCrypt.Net.BCrypt.Verify(request.Code.Trim(), parts[1])) { tries[0]++; return BadRequest("That code is not correct."); }

        if (await db.Users.AnyAsync(x => x.Email == email, cancellationToken))
            return Conflict("A user with that email already exists. Log in instead.");

        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName!.Trim(),
            Role = UserRole.Student,
            YearOfStudy = request.YearOfStudy,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        tries[0] = 5; // the code is used up
        return Ok(ToResponse(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password)) return BadRequest("Enter your email and password.");
        if (!EmailRx.IsMatch(request.Email.Trim())) return BadRequest("Enter a valid email address.");
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
        if (PasswordProblem(request.Password) is { } weak) return BadRequest(weak);
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
