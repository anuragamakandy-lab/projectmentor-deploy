using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>One setting shown on the admin "System settings" page.</summary>
public sealed record SettingDefinition(string Key, string Group, string Label, string Help, bool Secret = false, string Type = "text", string? Default = null);

/// <summary>
/// Admin-managed system settings (API keys, ids, addresses, email switches). Values live in the system_settings table;
/// secrets are AES-encrypted with a key derived from JWT_SECRET. Values are cached and the cache is cleared on save,
/// so a new key works immediately without restarting the server. Missing values fall back to appsettings / env vars.
/// </summary>
public sealed class SettingsService(IServiceScopeFactory scopes, IConfiguration config)
{
    public static readonly SettingDefinition[] Definitions =
    [
        new("GEMINI_API_KEY", "AI (Google Gemini)", "Gemini API key",
            "Powers every AI feature: roadmap idea generation, roadmap planning, the roadmap mentor chatbot, the mock viva examiner and the group sprint-board planner. Get it from aistudio.google.com.", true),
        new("GEMINI_MODEL", "AI (Google Gemini)", "Gemini model", "Model name used by all AI features, e.g. gemini-flash-lite-latest.", Default: "gemini-flash-lite-latest"),

        new("EMAILJS_SERVICE_ID", "Email (EmailJS)", "EmailJS service ID", "Email Services → your Gmail service, e.g. service_xxxxxxx."),
        new("EMAILJS_TEMPLATE_ID", "Email (EmailJS)", "EmailJS template ID", "Email Templates → the ProjectMentor template, e.g. template_xxxxxxx. Every system email uses it."),
        new("EMAILJS_PUBLIC_KEY", "Email (EmailJS)", "EmailJS public key", "Account → General → Public Key."),
        new("EMAILJS_PRIVATE_KEY", "Email (EmailJS)", "EmailJS private key", "Account → General → Private Key. Needed because the server sends the emails.", true),

        new("GOOGLE_WEB_CLIENT_ID", "Google sign-in", "Google client ID (web)", "Google Cloud → Clients → Web client ID. Used by the website and as the server client id in the mobile app."),
        new("GOOGLE_ANDROID_CLIENT_ID", "Google sign-in", "Google client ID (Android)", "Google Cloud → Clients → Android client ID (package com.projectmentor.projectmentor_mobile)."),

        new("ADMIN_EMAIL", "General", "Admin email", "Receives support requests and copies of contact messages.", Type: "email"),
        new("WEBSITE_URL", "General", "Website address", "Used for links inside emails and share links. Change it to the deployed address after deployment.", Default: "http://localhost:5173"),
        new("API_URL", "General", "API address", "The public address of this server.", Default: "http://localhost:5220"),
        new("EMAIL_PASSWORD_RESET", "Automatic emails", "Password reset code", "Sent when a student uses Forgot password.", Type: "bool", Default: "true"),
        new("REMINDER_DAYS", "Automatic emails", "Reminder days before due date", "In-app bell reminders only (no email). Comma separated, e.g. 3,1.", Default: "3,1"),
        new("EMAIL_OVERDUE", "Automatic emails", "Milestone overdue", "Sent once, the day after a milestone due date.", Type: "bool", Default: "true"),
        new("EMAIL_ACCOUNT_STATUS", "Automatic emails", "Account deactivated / reactivated", "Sent when an admin changes an account's status.", Type: "bool", Default: "true"),
        new("EMAIL_SUPPORT", "Automatic emails", "Support request received", "Confirmation to the student and a copy to the admin email.", Type: "bool", Default: "true"),
    ];

    /// <summary>Old appsettings names that still work as a fallback.</summary>
    static readonly Dictionary<string, string> Aliases = new() { ["GOOGLE_WEB_CLIENT_ID"] = "GOOGLE_CLIENT_IDS" };

    readonly object _lock = new();
    Dictionary<string, string?>? _cache;

    public static SettingDefinition? Find(string key) => Definitions.FirstOrDefault(d => d.Key == key);

    public string? Get(string key)
    {
        var all = Load();
        if (all.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
        var fromConfig = config[key] ?? Environment.GetEnvironmentVariable(key);
        if (string.IsNullOrWhiteSpace(fromConfig) && Aliases.TryGetValue(key, out var alias))
            fromConfig = (config[alias] ?? Environment.GetEnvironmentVariable(alias))?.Split(',')[0].Trim();
        return string.IsNullOrWhiteSpace(fromConfig) ? Find(key)?.Default : fromConfig;
    }

    public bool IsOn(string key) => !string.Equals(Get(key), "false", StringComparison.OrdinalIgnoreCase);

    public string WebsiteUrl => (Get("WEBSITE_URL") ?? "http://localhost:5173").TrimEnd('/');

    public string[] GoogleClientIds => new[] { Get("GOOGLE_WEB_CLIENT_ID"), Get("GOOGLE_ANDROID_CLIENT_ID") }
        .Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!.Trim()).Distinct().ToArray();

    public void Invalidate() { lock (_lock) _cache = null; }

    Dictionary<string, string?> Load()
    {
        lock (_lock)
        {
            if (_cache is not null) return _cache;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ProjectMentorDbContext>();
            try
            {
                _cache = db.SystemSettings.AsNoTracking().ToList()
                    .ToDictionary(s => s.Key, s => Find(s.Key)?.Secret == true ? Decrypt(s.Value) : s.Value);
            }
            catch { _cache = new(); } // table not created yet (first migration run)
            return _cache;
        }
    }

    /// <summary>Saves values from the admin page. Empty secret values are ignored, so a masked field left blank keeps the old key.</summary>
    public async Task SaveAsync(IReadOnlyDictionary<string, string?> values, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ProjectMentorDbContext>();
        foreach (var (key, raw) in values)
        {
            var def = Find(key);
            if (def is null) continue;
            var value = raw?.Trim();
            if (def.Secret && string.IsNullOrEmpty(value)) continue;
            if (def.Type == "bool") value = value is "true" or "True" ? "true" : "false";
            var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
            if (row is null) db.SystemSettings.Add(row = new SystemSetting { Id = Guid.NewGuid(), Key = key });
            row.Value = def.Secret ? Encrypt(value) : value;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        Invalidate();
    }

    /// <summary>Admin view: secrets are never sent back, only whether they are set and their last 4 characters.</summary>
    public async Task<IReadOnlyList<object>> AdminViewAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ProjectMentorDbContext>();
        var updated = await db.SystemSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.UpdatedAt, ct);
        return Definitions.Select(d =>
        {
            var v = Get(d.Key);
            return (object)new
            {
                d.Key, d.Group, d.Label, d.Help, d.Secret, d.Type,
                Value = d.Secret ? null : v,
                IsSet = !string.IsNullOrWhiteSpace(v),
                Hint = d.Secret && !string.IsNullOrEmpty(v) ? "••••••••" + v[^Math.Min(4, v.Length)..] : null,
                UpdatedAt = updated.TryGetValue(d.Key, out var u) ? u : (DateTimeOffset?)null,
            };
        }).ToList();
    }

    /// <summary>First start: copy keys from appsettings.Local.json into the database so admins can manage them.</summary>
    public async Task ImportFromConfigAsync(CancellationToken ct)
    {
        var existing = Load();
        var toSave = new Dictionary<string, string?>();
        foreach (var d in Definitions)
        {
            if (existing.ContainsKey(d.Key)) continue;
            var v = config[d.Key] ?? Environment.GetEnvironmentVariable(d.Key);
            if (string.IsNullOrWhiteSpace(v) && Aliases.TryGetValue(d.Key, out var alias)) v = config[alias]?.Split(',')[0].Trim();
            if (!string.IsNullOrWhiteSpace(v)) toSave[d.Key] = v;
        }
        if (toSave.Count > 0) await SaveAsync(toSave, ct);
    }

    // ---------------- encryption ----------------

    byte[] Key => SHA256.HashData(Encoding.UTF8.GetBytes(config["JWT_SECRET"] ?? Environment.GetEnvironmentVariable("JWT_SECRET")
        ?? "ProjectMentor-development-secret-change-before-production-1234567890"));

    string? Encrypt(string? plain)
    {
        if (string.IsNullOrEmpty(plain)) return plain;
        using var aes = Aes.Create();
        aes.Key = Key;
        aes.GenerateIV();
        var data = aes.EncryptCbc(Encoding.UTF8.GetBytes(plain), aes.IV);
        return "enc:" + Convert.ToBase64String(aes.IV.Concat(data).ToArray());
    }

    string? Decrypt(string? stored)
    {
        if (string.IsNullOrEmpty(stored) || !stored.StartsWith("enc:")) return stored;
        try
        {
            var bytes = Convert.FromBase64String(stored[4..]);
            using var aes = Aes.Create();
            aes.Key = Key;
            return Encoding.UTF8.GetString(aes.DecryptCbc(bytes[16..], bytes[..16]));
        }
        catch { return null; }
    }
}
