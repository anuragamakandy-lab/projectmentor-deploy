using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>What goes into the ProjectMentor EmailJS template.</summary>
public sealed record EmailContent(string Subject, string Heading, string Category, string MessageHtml,
    string? ActionUrl = null, string? ActionLabel = null, string? FooterNote = null);

/// <summary>
/// Sends every system email through EmailJS (REST API, server side) using the single ProjectMentor template.
/// Keys come from <see cref="SettingsService"/>, every attempt is written to email_logs, and failures never break
/// the request that triggered the email.
/// </summary>
public sealed class EmailService(ProjectMentorDbContext db, SettingsService settings, IHttpClientFactory http, ILogger<EmailService> log)
{
    public bool IsConfigured =>
        new[] { "EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY" }.All(k => !string.IsNullOrWhiteSpace(settings.Get(k)));

    public static string Esc(string? s) => WebUtility.HtmlEncode(s ?? "");

    /// <summary>Turns plain text (with blank-line paragraphs) into safe HTML paragraphs.</summary>
    public static string Paragraphs(string text) =>
        string.Join("", text.Replace("\r", "").Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(p => $"<p style=\"margin:0 0 12px;\">{Esc(p.Trim()).Replace("\n", "<br>")}</p>"));

    /// <summary>Sends one email. Returns true when EmailJS accepted it. A dedupe key makes automatic emails send only once.</summary>
    public async Task<bool> SendAsync(string toEmail, string? toName, string kind, EmailContent c, string? dedupeKey = null, Guid? sentById = null, CancellationToken ct = default)
    {
        if (dedupeKey is not null && await db.EmailLogs.AnyAsync(e => e.DedupeKey == dedupeKey, ct)) return false;
        var entry = new EmailLog
        {
            Id = Guid.NewGuid(), ToEmail = toEmail, ToName = toName, Subject = c.Subject.Length > 300 ? c.Subject[..300] : c.Subject,
            Kind = kind, DedupeKey = dedupeKey, SentById = sentById, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        };

        if (!IsConfigured) { entry.Status = "Skipped"; entry.Error = "EmailJS is not set up in Admin → System settings."; }
        else
        {
            var site = settings.WebsiteUrl;
            var payload = new
            {
                service_id = settings.Get("EMAILJS_SERVICE_ID"),
                template_id = settings.Get("EMAILJS_TEMPLATE_ID"),
                user_id = settings.Get("EMAILJS_PUBLIC_KEY"),
                accessToken = settings.Get("EMAILJS_PRIVATE_KEY"),
                template_params = new Dictionary<string, string>
                {
                    ["to_email"] = toEmail,
                    ["to_name"] = string.IsNullOrWhiteSpace(toName) ? "there" : toName!,
                    ["from_name"] = "ProjectMentor",
                    ["reply_to"] = settings.Get("ADMIN_EMAIL") ?? "",
                    ["subject"] = c.Subject,
                    ["heading"] = c.Heading,
                    ["category"] = c.Category,
                    ["message_html"] = c.MessageHtml,
                    ["action_url"] = c.ActionUrl ?? site,
                    ["action_label"] = c.ActionLabel ?? "Open ProjectMentor",
                    ["footer_note"] = c.FooterNote ?? "",
                    ["preheader"] = c.Heading,
                    ["year"] = DateTime.UtcNow.Year.ToString(),
                },
            };
            try
            {
                using var res = await http.CreateClient().PostAsJsonAsync("https://api.emailjs.com/api/v1.0/email/send", payload, ct);
                if (res.IsSuccessStatusCode) entry.Status = "Sent";
                else
                {
                    entry.Status = "Failed";
                    var body = await res.Content.ReadAsStringAsync(ct);
                    entry.Error = $"EmailJS {(int)res.StatusCode}: {(body.Length > 900 ? body[..900] : body)}";
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                entry.Status = "Failed";
                entry.Error = "Could not reach EmailJS: " + ex.Message;
            }
        }

        if (entry.Status != "Sent") log.LogWarning("Email {Kind} to {Email} {Status}: {Error}", kind, toEmail, entry.Status, entry.Error);
        db.EmailLogs.Add(entry);
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { /* same dedupe key raced */ }
        return entry.Status == "Sent";
    }

    // ---------------------------------------------------------------- the system emails

    public Task SendWelcomeAsync(User u, CancellationToken ct) => !settings.IsOn("EMAIL_WELCOME") ? Task.CompletedTask :
        SendAsync(u.Email, u.FullName, "Welcome", new EmailContent(
            "Welcome to ProjectMentor", "Your project journey starts here", "Welcome",
            Paragraphs("Your ProjectMentor account is ready.\n\nStart a roadmap and our AI mentor will turn your idea into clear milestones with deadlines and learning resources. When you are ready, practise your viva with a mock examiner and share progress with the community.\n\nYou can use the same account on the website and in the mobile app."),
            settings.WebsiteUrl + "/student/intake", "Start my first roadmap"), $"welcome:{u.Id}", ct: ct);

    public Task SendResetCodeAsync(User u, string code, CancellationToken ct) =>
        SendAsync(u.Email, u.FullName, "PasswordReset", new EmailContent(
            $"Your ProjectMentor reset code: {code}", "Reset your password", "Security",
            $"<p style=\"margin:0 0 12px;\">Use this code to choose a new password. It expires in 15 minutes.</p>" +
            $"<p style=\"margin:0 0 16px;font-size:30px;font-weight:800;letter-spacing:8px;color:#172D4C;\">{code}</p>" +
            "<p style=\"margin:0;\">If you did not ask to reset your password, you can ignore this email. Your password stays the same.</p>",
            settings.WebsiteUrl + "/forgot-password", "Reset password", "Never share this code with anyone. ProjectMentor staff will never ask for it."), ct: ct);

    public Task<bool> SendVerifyCodeAsync(string email, string name, string code, CancellationToken ct) =>
        SendAsync(email, name, "VerifyEmail", new EmailContent(
            $"Your ProjectMentor verification code: {code}", "Confirm your email", "Security",
            $"<p style=\"margin:0 0 12px;\">Hi {Esc(name)}, enter this code to finish creating your ProjectMentor account. It expires in 15 minutes.</p>" +
            $"<p style=\"margin:0 0 16px;font-size:30px;font-weight:800;letter-spacing:8px;color:#172D4C;\">{code}</p>" +
            "<p style=\"margin:0;\">If you did not try to create an account, you can ignore this email.</p>",
            settings.WebsiteUrl + "/register", "Create account", "Never share this code with anyone. ProjectMentor staff will never ask for it."), ct: ct);

    public Task SendDueSoonAsync(User u, Milestone m, string project, int days, CancellationToken ct) => !settings.IsOn("EMAIL_DUE_SOON") ? Task.CompletedTask :
        SendAsync(u.Email, u.FullName, "DueSoon", new EmailContent(
            $"Due in {days} day{(days == 1 ? "" : "s")}: {m.Title}", $"\"{m.Title}\" is due {(days == 1 ? "tomorrow" : $"in {days} days")}", "Deadline reminder",
            Paragraphs($"A milestone in your project \"{project}\" is due on {m.DueDate:dddd, d MMMM yyyy}.\n\nIf you have finished it, mark it as done so your progress stays up to date. If you are stuck, open the roadmap and ask the mentor chatbot for help."),
            $"{settings.WebsiteUrl}/student/roadmaps/{m.Roadmap.RoadmapRequestId}", "Open my roadmap"), $"due{days}:{m.Id}:{m.DueDate:yyyyMMdd}", ct: ct);

    public Task SendOverdueAsync(User u, Milestone m, string project, CancellationToken ct) => !settings.IsOn("EMAIL_OVERDUE") ? Task.CompletedTask :
        SendAsync(u.Email, u.FullName, "Overdue", new EmailContent(
            $"Overdue: {m.Title}", $"\"{m.Title}\" is overdue", "Overdue milestone",
            Paragraphs($"This milestone in \"{project}\" was due on {m.DueDate:dddd, d MMMM yyyy} and is not marked as done yet.\n\nCatch up by finishing it this week, or update its status if it is already complete. Small steps every day keep the whole project on track."),
            $"{settings.WebsiteUrl}/student/roadmaps/{m.Roadmap.RoadmapRequestId}", "Catch up now"), $"overdue:{m.Id}:{m.DueDate:yyyyMMdd}", ct: ct);

    public Task SendAccountStatusAsync(User u, bool active, string? reason, CancellationToken ct) => !settings.IsOn("EMAIL_ACCOUNT_STATUS") ? Task.CompletedTask :
        SendAsync(u.Email, u.FullName, "AccountStatus", active
            ? new EmailContent("Your ProjectMentor account is active again", "Welcome back", "Account",
                Paragraphs("An administrator has reactivated your account. You can sign in again on the website and in the mobile app, and all your roadmaps, posts and groups are back."),
                settings.WebsiteUrl + "/login", "Sign in")
            : new EmailContent("Your ProjectMentor account has been deactivated", "Your account has been deactivated", "Account",
                Paragraphs("An administrator has deactivated your ProjectMentor account, so you cannot sign in for now. Your community profile and posts are hidden while the account is inactive.") +
                (string.IsNullOrWhiteSpace(reason) ? "" : $"<p style=\"margin:0 0 12px;\"><strong>Reason:</strong> {Esc(reason)}</p>") +
                Paragraphs("If you think this is a mistake, contact the ProjectMentor admins using the button below."),
                settings.WebsiteUrl + "/contact-admin", "Contact the admins"), ct: ct);

    public async Task SendSupportReceivedAsync(SupportRequest r, CancellationToken ct)
    {
        if (!settings.IsOn("EMAIL_SUPPORT")) return;
        await SendAsync(r.Email, r.Name, "Support", new EmailContent(
            "We received your message", "Thanks, we got your message", "Support",
            Paragraphs("A ProjectMentor admin will read your message and reply to this email address as soon as possible.") +
            $"<p style=\"margin:0 0 6px;\"><strong>Subject:</strong> {Esc(r.Subject)}</p><div style=\"padding:12px 14px;background:#F5F1E8;border-radius:8px;\">{Paragraphs(r.Message)}</div>",
            settings.WebsiteUrl, "Visit ProjectMentor"), ct: ct);
        if (settings.Get("ADMIN_EMAIL") is { Length: > 3 } admin)
            await SendAsync(admin, "ProjectMentor admin", "Support", new EmailContent(
                $"Support request: {r.Subject}", $"New message from {r.Name}", "Support inbox",
                $"<p style=\"margin:0 0 6px;\"><strong>From:</strong> {Esc(r.Name)} &lt;{Esc(r.Email)}&gt;</p><p style=\"margin:0 0 6px;\"><strong>Subject:</strong> {Esc(r.Subject)}</p><div style=\"padding:12px 14px;background:#F5F1E8;border-radius:8px;\">{Paragraphs(r.Message)}</div>",
                settings.WebsiteUrl + "/admin/support", "Open the support inbox"), ct: ct);
    }

    /// <summary>Admin-written email (custom message, announcement or support reply).</summary>
    public Task<bool> SendAdminMessageAsync(string toEmail, string? toName, string kind, string subject, string heading, string body, Guid adminId, CancellationToken ct) =>
        SendAsync(toEmail, toName, kind, new EmailContent(subject, heading,
            kind == "Announcement" ? "Announcement" : kind == "SupportReply" ? "Support" : "Message from ProjectMentor",
            Paragraphs(body), settings.WebsiteUrl, "Open ProjectMentor",
            "This message was sent by a ProjectMentor administrator."), sentById: adminId, ct: ct);
}
