using Microsoft.EntityFrameworkCore;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Background job (runs at start-up and every 3 hours): milestone "due soon" reminders (REMINDER_DAYS before the due date)
/// and one "overdue" notice the day after a due date, as an in-app notification and an email. Each is sent only once.
/// Overdue milestones are also flagged live in every API response (IsOverdue), so calendars and lists mark them.
/// </summary>
public sealed class ReminderService(IServiceScopeFactory scopes, ILogger<ReminderService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException) { log.LogWarning(ex, "Reminder run failed"); }
            await Task.Delay(TimeSpan.FromHours(3), stoppingToken);
        }
    }

    public async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ProjectMentorDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<SettingsService>();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();
        var accounts = scope.ServiceProvider.GetRequiredService<AccountService>();

        var today = DateOnly.FromDateTime(DateTime.Now);
        var days = (settings.Get("REMINDER_DAYS") ?? "3,1").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(d => int.TryParse(d, out var n) ? n : -1).Where(n => n is > 0 and <= 30).Distinct().ToList();
        var soonDates = days.Select(d => today.AddDays(d)).ToList();
        var overdueFrom = today.AddDays(-3); // catch up if the server was off for a couple of days

        var milestones = await db.Milestones.Include(m => m.Roadmap).ThenInclude(r => r.Student).Include(m => m.Roadmap).ThenInclude(r => r.RoadmapRequest)
            .Where(m => m.Status != MilestoneStatus.Done && m.Roadmap.Status == RoadmapStatus.Accepted && m.Roadmap.Student.IsActive
                        && (soonDates.Contains(m.DueDate) || (m.DueDate < today && m.DueDate >= overdueFrom)))
            .ToListAsync(ct);

        foreach (var m in milestones)
        {
            var user = m.Roadmap.Student;
            var project = m.Roadmap.RoadmapRequest.Title ?? "your project";
            var link = $"/student/roadmaps/{m.Roadmap.RoadmapRequestId}";
            if (m.DueDate < today)
            {
                var key = $"{link}#overdue-{m.Id}";
                if (!await db.UserNotifications.AnyAsync(n => n.UserId == user.Id && n.Link == key, ct))
                    await accounts.NotifyAsync(user.Id, "Overdue", $"Overdue: {m.Title}", $"This milestone in \"{project}\" was due on {m.DueDate:d MMM}. Catch up or update its status.", key, ct);
                await email.SendOverdueAsync(user, m, project, ct);
            }
            else
            {
                var left = m.DueDate.DayNumber - today.DayNumber;
                var key = $"{link}#due{left}-{m.Id}";
                if (!await db.UserNotifications.AnyAsync(n => n.UserId == user.Id && n.Link == key, ct))
                    // Due-soon reminders are in-app only (no email) to save the email quota.
                    await accounts.NotifyAsync(user.Id, "DueSoon", $"Due {(left == 1 ? "tomorrow" : $"in {left} days")}: {m.Title}", $"Part of \"{project}\".", key, ct);
            }
        }
    }
}
