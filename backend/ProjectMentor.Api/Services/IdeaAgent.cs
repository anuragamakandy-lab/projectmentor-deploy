using System.Text.Json;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services.Ai;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Idea Agent — the "brainstormer". Given the student's intake answers it asks the LLM for a short
/// list of realistic, tailored project ideas. Used only when the student needs suggestions; the
/// "I already have an idea" path skips it. Output is validated into a strict shape before returning.
/// </summary>
public sealed class IdeaAgent(LlmClient llm)
{
    public bool Available => llm.IsConfigured;

    public async Task<IReadOnlyList<ProjectIdea>> SuggestAsync(
        IntakeRequest intake, IReadOnlyList<string> exclude, CancellationToken cancellationToken)
    {
        const string system =
            "You generate undergraduate software project ideas. " +
            "Return ONLY a JSON array of exactly 4 objects, each with keys: " +
            "title (string), summary (2 sentences), whyItFits (1 sentence on why it suits this student), " +
            "techStack (array of 3-6 strings), difficulty (one of \"Simple\", \"Moderate\", \"Ambitious\"). " +
            "Ideas must be buildable within the deadline and weekly hours given, and match the project type. " +
            "No text outside the JSON array.";

        var excludeText = exclude.Count > 0
            ? $" Avoid repeating or closely resembling these already-shown ideas: {string.Join("; ", exclude)}."
            : string.Empty;

        var tech = string.IsNullOrWhiteSpace(intake.Technologies) ? "" : $" Comfortable with: {intake.Technologies}.";
        var team = intake.TeamSize is > 1 ? $" Team of {intake.TeamSize}." : " Working solo.";
        var user =
            $"Student profile — year of study: {intake.Year}; project type: {intake.ProjectType}; " +
            $"deadline: {intake.Deadline:yyyy-MM-dd}; available time: about {intake.HoursPerWeek} hours per week.{team}{tech} " +
            $"Suggest 4 distinct, original project ideas suitable for them.{excludeText}";

        var json = await llm.CompleteJsonAsync(system, user, cancellationToken);

        List<ProjectIdea>? ideas;
        try
        {
            ideas = JsonSerializer.Deserialize<List<ProjectIdea>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException)
        {
            throw new AiUnavailableException("The AI returned ideas in an unexpected format. Please try again.");
        }

        // Deterministic guardrail: reject anything malformed instead of showing junk.
        var valid = (ideas ?? [])
            .Where(i => !string.IsNullOrWhiteSpace(i.Title) && !string.IsNullOrWhiteSpace(i.Summary))
            .Take(4)
            .ToList();

        if (valid.Count == 0)
            throw new AiUnavailableException("The AI did not return any usable ideas. Please try again.");

        return valid;
    }
}
