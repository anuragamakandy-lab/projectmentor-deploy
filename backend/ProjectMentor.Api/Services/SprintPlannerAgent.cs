using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ProjectMentor.Api.Services.Ai;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Sprint Planner Agent — breaks roadmap milestones into small, concrete weekly tasks for a team.
/// Each milestone has a "window" of sprint weeks (from after the previous deadline up to its own due date);
/// the agent may only place tasks inside that window. LLM output is validated (window, hours, duplicates)
/// and a deterministic phase-based template is used when the LLM is unavailable or returns junk.
/// </summary>
public sealed class SprintPlannerAgent(LlmClient llm)
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, NumberHandling = JsonNumberHandling.AllowReadingFromString };

    public sealed record MilestoneInput(Guid Id, string Title, string? Description, string Phase, DateOnly DueDate, IReadOnlyList<DateOnly> Weeks);
    public sealed record PlannedTask(Guid MilestoneId, string Title, string? Description, decimal Hours, DateOnly Week);
    public sealed record Result(IReadOnlyList<PlannedTask> Tasks, string Source);

    public static DateOnly Monday(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    /// <summary>Sprint weeks for each milestone: after the previous milestone's due week, up to its own due week, never in the past.</summary>
    public static IReadOnlyList<DateOnly> WindowFor(DateOnly? previousDue, DateOnly due, DateOnly today)
    {
        var thisWeek = Monday(today);
        var end = Monday(due);
        if (end < thisWeek) return [thisWeek]; // overdue: catch up this week
        var start = previousDue is { } p ? Monday(p) : thisWeek;
        if (start < thisWeek) start = thisWeek;
        if (start > end) start = end;
        var weeks = new List<DateOnly>();
        for (var w = start; w <= end; w = w.AddDays(7)) weeks.Add(w);
        return weeks;
    }

    public async Task<Result> PlanAsync(IReadOnlyList<MilestoneInput> milestones, int teamSize, decimal? hoursPerWeek, string projectTitle, CancellationToken ct)
    {
        if (milestones.Count == 0) return new Result([], "Rules");
        if (llm.IsConfigured)
        {
            try
            {
                var planned = await LlmPlanAsync(milestones, teamSize, hoursPerWeek, projectTitle, ct);
                if (planned.Count >= milestones.Count) return new Result(planned, "AI");
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException) { /* fall back to rules */ }
        }
        return new Result(RulePlan(milestones, teamSize), "Rules");
    }

    private async Task<List<PlannedTask>> LlmPlanAsync(IReadOnlyList<MilestoneInput> milestones, int teamSize, decimal? hoursPerWeek, string projectTitle, CancellationToken ct)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < milestones.Count; i++)
        {
            var m = milestones[i];
            sb.AppendLine($"[{i}] {m.Phase} — {m.Title} (due {m.DueDate:yyyy-MM-dd}). {m.Description}");
            sb.AppendLine($"    allowed weeks: {string.Join(", ", m.Weeks.Select(w => w.ToString("yyyy-MM-dd")))}");
        }
        var capacity = hoursPerWeek is > 0 ? $"Each member has about {hoursPerWeek} hours per week, so the team has ~{hoursPerWeek * teamSize} hours per week." : "";
        var tasksPer = teamSize >= 3 ? "4-8" : "3-6";

        var system =
            "You are an agile coach planning sprints for an undergraduate software project team. " +
            $"Break EACH milestone into {tasksPer} small, concrete tasks that one person can finish in 1-8 hours. " +
            "Task titles start with a verb and name the real thing to build or write (e.g. \"Create the users table and migration\", " +
            "\"Write the Testing chapter of the report\"). Order tasks logically. Spread tasks across the milestone's allowed weeks " +
            "and never use a week that is not in its allowed list. Do not exceed the team's weekly capacity. " +
            "Return ONLY JSON: {\"tasks\": [{\"m\": milestone index (int), \"title\": string (max 90 chars), " +
            "\"description\": string (one short sentence: what 'done' means), \"hours\": number, \"week\": \"YYYY-MM-DD\"}]}.";
        var user = $"Project: {projectTitle}. Team size: {teamSize}. {capacity}\nMilestones:\n{sb}";

        var json = await llm.CompleteJsonAsync(system, user, ct, temperature: 0.4);
        var raw = JsonSerializer.Deserialize<RawPlan>(json, Json);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<PlannedTask>();
        foreach (var t in raw?.Tasks ?? [])
        {
            if (t.M is null || t.M < 0 || t.M >= milestones.Count || string.IsNullOrWhiteSpace(t.Title)) continue;
            var m = milestones[t.M.Value];
            var title = Clip(t.Title, 120);
            if (!seen.Add($"{m.Id}:{title}")) continue;
            var week = DateOnly.TryParse(t.Week, out var w) ? Monday(w) : m.Weeks[0];
            if (!m.Weeks.Contains(week)) week = week < m.Weeks[0] ? m.Weeks[0] : m.Weeks[^1]; // clamp into the window
            var hours = Math.Clamp(Math.Round((decimal)(t.Hours ?? 3) * 2) / 2, 0.5m, 12m);
            result.Add(new PlannedTask(m.Id, title, string.IsNullOrWhiteSpace(t.Description) ? null : Clip(t.Description, 300), hours, week));
            if (result.Count >= milestones.Count * 10) break;
        }
        // every milestone must get at least one task, otherwise treat the answer as incomplete
        return milestones.All(m => result.Any(r => r.MilestoneId == m.Id)) ? result : [];
    }

    // ---------- deterministic fallback ----------

    private static readonly Dictionary<string, (string Title, string Done, decimal Hours)[]> Templates = new()
    {
        ["Title"] = [("Agree on the project idea and scope", "Everyone agrees on what is in and out of scope.", 2), ("Write the problem statement and objectives", "3 measurable objectives are written.", 3),
                     ("Research 3 existing solutions", "A short comparison table exists.", 3), ("Draft and submit the proposal", "Proposal is submitted.", 4)],
        ["Design"] = [("List functional and non-functional requirements", "Requirements table with IDs is done.", 3), ("Draw the ER diagram", "ER diagram reviewed by the team.", 3),
                      ("Design the system architecture diagram", "Architecture diagram is in the repo.", 2), ("Sketch wireframes for the main screens", "Wireframes for key screens exist.", 4),
                      ("Set up the Git repository and project skeleton", "Everyone can clone, build and run it.", 2)],
        ["Build"] = [("Set up the database and migrations", "Tables are created by migrations.", 3), ("Build register and login with roles", "Users can sign up and log in.", 6),
                     ("Build the core feature APIs", "Endpoints work in Postman.", 8), ("Build the main UI screens", "Screens match the wireframes.", 8),
                     ("Connect the UI to the API", "Main user journey works end to end.", 6), ("Write unit tests for the core logic", "Tests pass in CI.", 4)],
        ["Documentation"] = [("Write the README and setup guide", "A new member can run the app from the README.", 2), ("Write the Introduction and Literature review", "Chapters 1–2 drafted.", 6),
                             ("Write the Design and Implementation chapters", "Chapters with diagrams drafted.", 6), ("Write the Testing and Results chapter", "Test summary table included.", 4),
                             ("Proofread and format the whole report", "Captions, references and contents are correct.", 3)],
        ["Presentation"] = [("Plan the talk outline (about 10 slides)", "Slide headlines agreed.", 2), ("Build the slides", "Deck is complete and consistent.", 4),
                            ("Record a backup demo video", "2–3 minute video saved.", 2), ("Rehearse with a timer three times", "Talk fits the time limit.", 3),
                            ("Practise viva questions (try the AI Mock Viva)", "Each member scores 70%+.", 2)],
        ["Deployment"] = [("Choose hosting and create the environments", "Hosting accounts are ready.", 2), ("Configure environment variables and secrets", "No secrets in Git.", 2),
                          ("Deploy the backend and database", "API is live and healthy.", 4), ("Deploy the frontend and test end to end", "Live site works on mobile and desktop.", 3),
                          ("Tag the final release on GitHub", "v1.0 release exists.", 1)],
    };

    private static List<PlannedTask> RulePlan(IReadOnlyList<MilestoneInput> milestones, int teamSize)
    {
        var result = new List<PlannedTask>();
        foreach (var m in milestones)
        {
            var list = Templates.TryGetValue(m.Phase, out var t) ? t :
                [("Break this milestone into steps", "Steps are agreed by the team.", 1m), ($"Complete: {m.Title}", "Milestone deliverable is finished.", 6m), ("Review the work as a team", "Everyone has checked it.", 1m)];
            for (var i = 0; i < list.Length; i++)
            {
                var week = m.Weeks[Math.Min(m.Weeks.Count - 1, i * m.Weeks.Count / list.Length)];
                result.Add(new PlannedTask(m.Id, list[i].Title, list[i].Done, list[i].Hours, week));
            }
        }
        return result;
    }

    private static string Clip(string? s, int max) { var v = (s ?? "").Trim(); return v.Length <= max ? v : v[..max]; }

    private sealed class RawPlan { public List<RawTask>? Tasks { get; set; } }
    private sealed class RawTask
    {
        public int? M { get; set; }
        public string? Title { get; set; }
        public string? Description { get; set; }
        public double? Hours { get; set; }
        public string? Week { get; set; }
    }
}
