using System.Text.Json;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services.Ai;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Planner agent — the "team lead". Builds a personalised 6-phase roadmap for the chosen project.
/// When an LLM key is present it asks Gemini for project-specific milestone titles and descriptions;
/// otherwise it falls back to a generic rule-based plan. Either way the phase set and the due dates
/// are computed deterministically so the Validation agent's checks always hold.
/// </summary>
public sealed class PlannerAgent(ProjectMentorDbContext db, LlmClient llm)
{
    private static readonly MilestonePhase[] Phases =
        [MilestonePhase.Title, MilestonePhase.Design, MilestonePhase.Build, MilestonePhase.Documentation, MilestonePhase.Presentation, MilestonePhase.Deployment];

    private sealed record PlannedPhase(string Phase, string Title, string Description, decimal? EstimatedHours);

    public async Task RunAsync(WorkflowContext context, CancellationToken cancellationToken)
    {
        var step = AgentSupport.StartStep(context.Run, AgentName.Planner, 1, context.Intake);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // Real days left (short deadlines are allowed); every milestone lands strictly before the deadline.
        var totalDays = Math.Max(2, context.Intake.Deadline.DayNumber - today.DayNumber);

        Dictionary<MilestonePhase, PlannedPhase>? aiPlan = null;
        var usedAi = false;

        if (llm.IsConfigured)
        {
            try
            {
                aiPlan = await GeneratePlanAsync(context, cancellationToken);
                usedAi = aiPlan is not null;
            }
            catch (AiUnavailableException)
            {
                aiPlan = null; // fall back to the deterministic plan below
            }
        }

        for (var index = 0; index < Phases.Length; index++)
        {
            var phase = Phases[index];
            var dueDate = today.AddDays(Math.Max(1, totalDays * (index + 1) / (Phases.Length + 1)));

            string title, description;
            decimal hours = Math.Max(1, context.Intake.HoursPerWeek);
            if (aiPlan is not null && aiPlan.TryGetValue(phase, out var p) && !string.IsNullOrWhiteSpace(p.Title))
            {
                title = p.Title.Trim();
                description = string.IsNullOrWhiteSpace(p.Description) ? $"Complete the {phase} phase." : p.Description.Trim();
                if (p.EstimatedHours is > 0) hours = p.EstimatedHours.Value;
            }
            else
            {
                title = $"{phase} project milestone";
                description = $"Complete the {phase} phase for the project.";
            }

            context.Plan.Add(new PlannedMilestone(phase, title, description, dueDate, hours));
        }

        if (usedAi)
            AgentSupport.AddToolCall(db, step, "llm_project_planner",
                new { project = context.Request.Title, context.Intake.ProjectType, context.Intake.Year },
                new { milestoneCount = context.Plan.Count, personalised = true });
        else
            AgentSupport.AddToolCall(db, step, "deadline_calculator",
                new { context.Intake.Deadline, context.Intake.HoursPerWeek },
                new { totalDays, milestoneCount = context.Plan.Count });

        AgentSupport.CompleteStep(db, step, context.Plan);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Dictionary<MilestonePhase, PlannedPhase>?> GeneratePlanAsync(WorkflowContext context, CancellationToken cancellationToken)
    {
        const string system =
            "You are an expert project planner for undergraduate students. Produce a PERSONALISED roadmap for the given project. " +
            "Return ONLY a JSON array of exactly 6 objects, one per phase, in this order: Title, Design, Build, Documentation, Presentation, Deployment. " +
            "Each object: { \"phase\": one of those 6 words, \"title\": a short milestone title SPECIFIC to this project (max 8 words), " +
            "\"description\": 2-3 sentences of concrete, project-specific tasks for that phase, \"estimatedHours\": a number. } " +
            "Tailor everything to the project idea, the student's year, the project type and the available weekly hours. No text outside the JSON array.";

        var idea = string.IsNullOrWhiteSpace(context.Request.Title) ? "(no title given)" : context.Request.Title;
        var summary = string.IsNullOrWhiteSpace(context.IdeaSummary) ? "" : $" Idea details: {context.IdeaSummary}.";
        var team = context.Intake.TeamSize is > 1 ? $" Team of {context.Intake.TeamSize} (add collaboration/Git tasks)." : " Solo project.";
        var tech = string.IsNullOrWhiteSpace(context.Intake.Technologies) ? "" : $" Known tech: {context.Intake.Technologies}.";
        var weak = string.IsNullOrWhiteSpace(context.Intake.LeastConfident) ? "" : $" Weak areas needing extra guidance: {context.Intake.LeastConfident}.";
        var user =
            $"Project idea: {idea}.{summary} " +
            $"Student: year {context.Intake.Year}; {context.Intake.ProjectType} project; deadline {context.Intake.Deadline:yyyy-MM-dd}; " +
            $"about {context.Intake.HoursPerWeek} hours per week.{team}{tech}{weak} Produce the personalised 6-phase roadmap.";

        var json = await llm.CompleteJsonAsync(system, user, cancellationToken);

        List<PlannedPhase>? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<List<PlannedPhase>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException)
        {
            return null; // malformed → caller falls back to the deterministic plan
        }
        if (parsed is null || parsed.Count == 0) return null;

        var byPhase = new Dictionary<MilestonePhase, PlannedPhase>();
        foreach (var item in parsed)
        {
            if (Enum.TryParse<MilestonePhase>((item.Phase ?? "").Trim(), ignoreCase: true, out var phase))
                byPhase[phase] = item;
        }
        return byPhase.Count > 0 ? byPhase : null;
    }
}
