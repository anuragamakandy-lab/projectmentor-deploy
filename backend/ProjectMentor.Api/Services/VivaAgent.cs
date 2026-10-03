using System.Text;
using System.Text.Json;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services.Ai;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Viva Examiner Agent — the fifth agent. It plays a university viva panel:
///   1. Plan: reads the student's project details and drafts tailored questions.
///   2. Evaluate: scores each spoken/typed answer (0-10), reacts, explains what was missing,
///      writes a high-scoring model answer and, if the answer was vague, a follow-up question.
///   3. Summarise: turns the whole run into a grade, strengths, weak areas and next steps.
/// Every LLM output is validated/clamped before it reaches the database. Question planning and
/// the summary have deterministic fallbacks; evaluation needs the LLM and fails with a clear message.
/// </summary>
public sealed class VivaAgent(LlmClient llm)
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString };
    private static readonly string[] Verdicts = ["Excellent", "Good", "Fair", "Weak", "No answer"];
    private static readonly string[] Reactions = ["impressed", "satisfied", "unsure", "concerned"];

    public bool Available => llm.IsConfigured;

    public sealed record PlannedQuestion(string Topic, string Question, string LookingFor);
    public sealed record Plan(string Greeting, IReadOnlyList<PlannedQuestion> Questions);
    public sealed record Evaluation(int Score, string Verdict, string Reaction, string Feedback,
        IReadOnlyList<string> Strengths, IReadOnlyList<string> Improvements, string ModelAnswer, string? FollowUp);

    // ---------- 1. Plan ----------

    public async Task<Plan> PlanAsync(VivaDetails d, string stage, string difficulty, int count, string studentName, CancellationToken ct,
        string examiner = "Dr. Mentor", string language = "en-GB")
    {
        if (llm.IsConfigured)
        {
            try
            {
                var system =
                    $"You are {examiner}, an experienced university examiner running an undergraduate software project viva. {LanguageRule(language)} " +
                    $"Viva stage: {stage}. Examiner style: {StyleFor(difficulty)} " +
                    $"Plan exactly {count} viva questions that are SPECIFIC to this student's project — mention their actual features, " +
                    "technologies, data and decisions. Never ask generic textbook questions. " +
                    "Cover a spread of these topics, in a natural viva order: Motivation & problem, Requirements & users, " +
                    "Design decisions (why X instead of Y), Architecture, Database design, Implementation, Security, Testing, " +
                    "Integrations/AI, Challenges, Limitations & future work, Team contribution (only if it is a team project). " +
                    StageFocus(stage) +
                    " Each question must be one clear spoken sentence or two, under 35 words, asking one thing. " +
                    "Return ONLY JSON: {\"greeting\": string (2 short friendly spoken sentences welcoming the student by first name " +
                    "and saying how many questions there will be), \"questions\": [{\"topic\": string (2-3 words), \"question\": string, " +
                    "\"lookingFor\": string (what a top answer must include, one sentence)}]}.";
                var user = $"Student first name: {studentName}.\n\nPROJECT DETAILS\n{Describe(d)}";

                var json = await llm.CompleteJsonAsync(system, user, ct, temperature: 0.8);
                var raw = JsonSerializer.Deserialize<RawPlan>(json, Json);
                var questions = (raw?.Questions ?? [])
                    .Where(q => !string.IsNullOrWhiteSpace(q.Question))
                    .Select(q => new PlannedQuestion(Clip(q.Topic, 60, "General"), Clip(q.Question, 600, ""), Clip(q.LookingFor, 600, "")))
                    .Take(count)
                    .ToList();
                if (questions.Count >= Math.Min(3, count))
                    return new Plan(Clip(raw?.Greeting, 500, DefaultGreeting(studentName, questions.Count)), questions);
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException) { /* fall back below */ }
        }

        var fallback = FallbackQuestions(d).Take(count).ToList();
        return new Plan(DefaultGreeting(studentName, fallback.Count), fallback);
    }

    // ---------- 2. Evaluate ----------

    public async Task<Evaluation> EvaluateAsync(VivaDetails d, string stage, string difficulty, string question, string? lookingFor,
        string answer, bool allowFollowUp, CancellationToken ct, string examiner = "Dr. Mentor", string language = "en-GB")
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            // Skipped: still teach them what a strong answer sounds like.
            var model = await ModelAnswerOnlyAsync(d, question, lookingFor, ct);
            return new Evaluation(0, "No answer", "concerned",
                "That's alright, let's move on. Have a look at the model answer afterwards so you're ready if this comes up.",
                [], ["Give at least a short answer — examiners award partial marks for a reasonable attempt."], model, null);
        }

        var system =
            $"You are {examiner}, a fair university viva examiner. Evaluate ONE answer from an undergraduate student. {LanguageRule(language)} " +
            $"Viva stage: {stage}. Examiner style: {StyleFor(difficulty)} " +
            "The answer may be transcribed from speech: ignore filler words, small grammar slips and transcription errors. " +
            "Score 0-10 using this rubric: 9-10 precise, justified, uses project specifics and correct terms; " +
            "7-8 correct and clear with minor gaps; 5-6 partly correct or too general; 3-4 vague or confused; 1-2 mostly wrong; 0 no real answer. " +
            (difficulty == "Strict" ? "Be demanding: reward only justified, specific answers. " :
             difficulty == "Friendly" ? "Be encouraging, but keep the score honest. " : "") +
            "Return ONLY JSON with keys: " +
            "score (integer 0-10), verdict (one of \"Excellent\",\"Good\",\"Fair\",\"Weak\"), " +
            "reaction (one of \"impressed\",\"satisfied\",\"unsure\",\"concerned\"), " +
            "feedback (1-2 short spoken sentences to the student, natural examiner voice, do not reveal the full model answer), " +
            "strengths (array of 0-3 short phrases), improvements (array of 1-3 short, specific, actionable phrases), " +
            "modelAnswer (a first-person answer of 80-150 words this student could say to score 10/10, using THEIR project's real details; " +
            "do not invent results or numbers they did not give — use phrases like 'we plan to measure' instead), " +
            (allowFollowUp
                ? "followUp (if the score is 6 or lower and a probing question would help, ONE short follow-up question under 25 words; otherwise empty string)."
                : "followUp (always empty string).");
        var user =
            $"PROJECT DETAILS\n{Describe(d)}\n\nQUESTION: {question}\nWHAT A TOP ANSWER INCLUDES: {lookingFor}\n\nSTUDENT'S ANSWER: {Clip(answer, 4000, "")}";

        var json = await llm.CompleteJsonAsync(system, user, ct, temperature: 0.3);
        RawEvaluation? raw;
        try { raw = JsonSerializer.Deserialize<RawEvaluation>(json, Json); }
        catch (JsonException) { throw new AiUnavailableException("The examiner's marking came back garbled. Please submit again."); }
        if (raw is null || string.IsNullOrWhiteSpace(raw.ModelAnswer))
            throw new AiUnavailableException("The examiner could not mark that answer. Please submit again.");

        var score = Math.Clamp((int)Math.Round(raw.Score), 0, 10);
        var verdict = Verdicts.Contains(raw.Verdict) ? raw.Verdict! : VerdictFor(score);
        var reaction = Reactions.Contains(raw.Reaction) ? raw.Reaction! : ReactionFor(score);
        var followUp = allowFollowUp && score <= 6 && !string.IsNullOrWhiteSpace(raw.FollowUp) ? Clip(raw.FollowUp, 400, "") : null;

        return new Evaluation(score, verdict, reaction,
            Clip(raw.Feedback, 600, "Thank you. Let's continue."),
            CleanList(raw.Strengths), CleanList(raw.Improvements),
            Clip(raw.ModelAnswer, 2000, ""), followUp);
    }

    private async Task<string> ModelAnswerOnlyAsync(VivaDetails d, string question, string? lookingFor, CancellationToken ct)
    {
        if (!llm.IsConfigured) return lookingFor ?? "";
        try
        {
            var json = await llm.CompleteJsonAsync(
                "You help undergraduate students prepare for a project viva. Return ONLY JSON {\"modelAnswer\": string}: a first-person, " +
                "80-150 word answer this student could give to score 10/10, using their real project details and never inventing results.",
                $"PROJECT DETAILS\n{Describe(d)}\n\nQUESTION: {question}\nWHAT A TOP ANSWER INCLUDES: {lookingFor}", ct, temperature: 0.4);
            var raw = JsonSerializer.Deserialize<RawEvaluation>(json, Json);
            return Clip(raw?.ModelAnswer, 2000, lookingFor ?? "");
        }
        catch (Exception ex) when (ex is AiUnavailableException or JsonException)
        {
            return lookingFor ?? "";
        }
    }

    // ---------- 3. Summarise ----------

    public async Task<VivaSummary> SummariseAsync(VivaDetails d, IReadOnlyList<(string Topic, string Question, int Score, string? Feedback)> results,
        int percent, CancellationToken ct, string examiner = "Dr. Mentor", string language = "en-GB")
    {
        var grade = GradeFor(percent);
        if (llm.IsConfigured)
        {
            try
            {
                var sb = new StringBuilder();
                foreach (var r in results) sb.AppendLine($"- [{r.Topic}] {r.Score}/10 — Q: {r.Question} — examiner said: {r.Feedback}");
                var json = await llm.CompleteJsonAsync(
                    $"You are {examiner}, summarising a student's mock viva. Be honest, warm and specific. {LanguageRule(language)} Return ONLY JSON: " +
                    "{\"overall\": string (2-3 sentences, second person), \"strengths\": [2-3 short phrases], " +
                    "\"weakAreas\": [{\"topic\": string, \"tip\": string (one practical sentence)}] (1-3 items, the lowest-scoring topics), " +
                    "\"nextSteps\": [3 short actionable steps to prepare for the real viva]}.",
                    $"Project: {d.Title}. Overall score: {percent}% (grade {grade}).\nResults:\n{sb}", ct, temperature: 0.5);
                var raw = JsonSerializer.Deserialize<RawSummary>(json, Json);
                if (raw is not null && !string.IsNullOrWhiteSpace(raw.Overall))
                    return new VivaSummary(Clip(raw.Overall, 1000, ""), grade, CleanList(raw.Strengths),
                        (raw.WeakAreas ?? []).Where(w => !string.IsNullOrWhiteSpace(w.Topic))
                            .Take(3).Select(w => new VivaWeakArea(Clip(w.Topic, 80, ""), Clip(w.Tip, 400, ""))).ToList(),
                        CleanList(raw.NextSteps));
            }
            catch (Exception ex) when (ex is AiUnavailableException or JsonException) { /* fall back below */ }
        }

        var weakest = results.OrderBy(r => r.Score).Take(2)
            .Select(r => new VivaWeakArea(r.Topic, "Re-read the model answer for this question and practise saying it aloud in your own words.")).ToList();
        var best = results.Where(r => r.Score >= 7).Select(r => r.Topic).Distinct().Take(3).ToList();
        return new VivaSummary(
            $"You scored {percent}% overall. Keep practising the weaker topics below and you will walk into your real viva much more confident.",
            grade, best.Count > 0 ? best : ["You completed the full viva — that is the hardest step."], weakest,
            ["Practise each model answer aloud twice.", "Prepare one diagram you can point to for architecture questions.", "Run another mock viva on Strict mode."]);
    }

    // ---------- helpers ----------

    public static string GradeFor(int percent) => percent switch
    {
        >= 75 => "A", >= 65 => "B", >= 55 => "C", >= 45 => "D", _ => "F"
    };

    private static string VerdictFor(int s) => s >= 9 ? "Excellent" : s >= 7 ? "Good" : s >= 5 ? "Fair" : "Weak";
    private static string ReactionFor(int s) => s >= 9 ? "impressed" : s >= 7 ? "satisfied" : s >= 5 ? "unsure" : "concerned";

    private static string StyleFor(string difficulty) => difficulty switch
    {
        "Friendly" => "a friendly tutor — warm, patient, clear questions.",
        "Strict" => "a strict external examiner — probing, asks 'why' and challenges trade-offs.",
        _ => "a professional examiner — polite, focused, fair."
    };

    private static string StageFocus(string stage) => stage switch
    {
        "Proposal" => " Because this is a PROPOSAL viva, focus on the problem, objectives, feasibility, planned design and planned methodology rather than finished results.",
        "Progress" => " Because this is a PROGRESS viva, balance design decisions with what has been built so far, problems met and the plan to finish.",
        _ => " Because this is a FINAL viva, focus on what was built, why, how it was tested, results, limitations and future work."
    };

    private static string DefaultGreeting(string name, int count) =>
        $"Good day {name}, welcome to your mock viva. I'll ask you {count} questions about your project — take your time and answer as you would in the real thing.";

    /// <summary>Turn the student's form into a compact, labelled description for prompts.</summary>
    public static string Describe(VivaDetails d)
    {
        var sb = new StringBuilder();
        void Line(string label, string? value) { if (!string.IsNullOrWhiteSpace(value)) sb.AppendLine($"{label}: {Clip(value, 1500, "")}"); }
        Line("Title", d.Title);
        Line("Project type", d.ProjectType);
        Line("Module / course", d.Module);
        Line("Team size", d.TeamSize is > 0 ? d.TeamSize.ToString() : null);
        Line("Student's own role", d.YourRole);
        Line("Problem", d.Problem);
        Line("Target users", d.TargetUsers);
        Line("Objectives", d.Objectives);
        Line("What makes it different", d.Novelty);
        Line("Key features", d.Features);
        Line("Frontend", d.Frontend);
        Line("Backend", d.Backend);
        Line("Database", d.Database);
        Line("AI / APIs / other tech", d.OtherTech);
        Line("Architecture", d.Architecture);
        Line("Main data / entities", d.DataModel);
        Line("Security", d.Security);
        Line("Testing", d.Testing);
        Line("Deployment", d.Deployment);
        Line("Challenges faced", d.Challenges);
        Line("Current progress", d.Progress);
        Line("Known limitations", d.Limitations);
        Line("Future work", d.FutureWork);
        Line("Other notes", d.Notes);
        return sb.ToString();
    }

    private static IEnumerable<PlannedQuestion> FallbackQuestions(VivaDetails d)
    {
        var db = string.IsNullOrWhiteSpace(d.Database) ? "your database" : d.Database!.Split(',')[0].Trim();
        var be = string.IsNullOrWhiteSpace(d.Backend) ? "your backend technology" : d.Backend!.Split(',')[0].Trim();
        yield return new("Motivation", $"In your own words, what problem does {d.Title} solve, and who exactly has that problem?", "A clear problem statement, the specific users, and why existing solutions are not enough.");
        yield return new("Design decisions", $"Why did you choose {be} for the backend instead of an alternative?", "At least two concrete reasons tied to the project's needs, plus one alternative considered and why it was rejected.");
        yield return new("Database", $"Walk me through the main tables or collections in {db} and how they relate.", "Main entities, keys and relationships, and one example of a query the app depends on.");
        yield return new("Architecture", "Explain what happens, step by step, when a user performs the most important action in your system.", "The request path from UI to backend to database and back, naming the real components.");
        yield return new("Security", "How do you protect user data and stop one user seeing another user's information?", "Authentication, authorisation/role checks, password hashing, input validation and secrets handling.");
        yield return new("Testing", "How did you test that your system works correctly?", "Types of testing (unit, integration, user), specific examples, and how failures were found and fixed.");
        yield return new("Challenges", "What was the hardest technical problem you faced, and how did you solve it?", "A specific problem, the investigation steps, the fix, and what was learned.");
        yield return new("Limitations", "What are the main limitations of your system, and what would you improve with more time?", "Honest limitations with reasons, and concrete, prioritised future work.");
        if (d.TeamSize is > 1)
            yield return new("Team contribution", "What was your personal contribution to the project, and how did the team coordinate work?", "Specific components the student built, tools for collaboration (Git, boards), and how conflicts were handled.");
        yield return new("Requirements", "Which requirement was the most important to get right, and how do you know you met it?", "One named requirement, why it matters to users, and the evidence it was met.");
    }

    private static string Clip(string? value, int max, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        var v = value.Trim();
        return v.Length <= max ? v : v[..max];
    }

    private static List<string> CleanList(IEnumerable<string>? items) =>
        (items ?? []).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => Clip(s, 300, "")).Take(4).ToList();

    private sealed class RawPlan { public string? Greeting { get; set; } public List<RawQuestion>? Questions { get; set; } }
    private sealed class RawQuestion { public string? Topic { get; set; } public string? Question { get; set; } public string? LookingFor { get; set; } }
    private sealed class RawEvaluation
    {
        public double Score { get; set; }
        public string? Verdict { get; set; }
        public string? Reaction { get; set; }
        public string? Feedback { get; set; }
        public List<string>? Strengths { get; set; }
        public List<string>? Improvements { get; set; }
        public string? ModelAnswer { get; set; }
        public string? FollowUp { get; set; }
    }
    private sealed class RawSummary
    {
        public string? Overall { get; set; }
        public List<string>? Strengths { get; set; }
        public List<RawWeak>? WeakAreas { get; set; }
        public List<string>? NextSteps { get; set; }
    }
    private sealed class RawWeak { public string? Topic { get; set; } public string? Tip { get; set; } }

    /// <summary>
    /// Sinhala examiners speak everyday spoken Sinhala (කතා කරන භාෂාව), not formal written Sinhala, and keep
    /// technical terms in English as Sri Lankan lecturers do. JSON keys always stay in English.
    /// </summary>
    static string LanguageRule(string language) => language == "si-LK"
        ? "Write every student-facing text (greeting, questions, feedback, model answers, summaries) in natural, everyday SPOKEN Sinhala " +
          "(කතා කරන භාෂාව) in Sinhala script — the friendly way a Sri Lankan lecturer talks in a viva, not formal written Sinhala. " +
          "Keep technical terms (database, API, React, testing, etc.) in English. JSON keys stay in English."
        : "Use clear, simple English.";
}
