using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Services.Ai;
using ProjectMentor.Data;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Report Builder — generates a clean, professional PDF project report for an accepted roadmap:
/// overview, phase-by-phase plan with dates, suggested database design, and proposal/report guidance.
/// Uses the LLM for the rich prose when available, with a template fallback so a report is always produced.
/// </summary>
public sealed class ReportService(ProjectMentorDbContext db, LlmClient llm, ChatService chat, ProjectInsightService insights)
{
    private static readonly string Ink = "#12140F";
    private static readonly string Emerald = "#0E7A52";
    private static readonly string Gold = "#A9832B";
    private static readonly string Muted = "#5A6B60";
    private static readonly string Line = "#DDE1D8";

    public async Task<(string FileName, byte[] Pdf)?> BuildAsync(Guid studentId, Guid requestId, CancellationToken cancellationToken)
    {
        var request = await db.RoadmapRequests.AsNoTracking().AsSplitQuery()
            .Include(r => r.Student)
            .Include(r => r.Roadmaps).ThenInclude(rm => rm.Milestones).ThenInclude(m => m.Resources).ThenInclude(mr => mr.Resource)
            .SingleOrDefaultAsync(r => r.Id == requestId && r.StudentId == studentId, cancellationToken);
        if (request is null) return null;

        var roadmap = request.Roadmaps.OrderByDescending(r => r.Version).FirstOrDefault();
        if (roadmap is null) return null;

        var milestones = roadmap.Milestones.OrderBy(m => m.OrderIndex).ToList();
        var title = string.IsNullOrWhiteSpace(request.Title) ? "Untitled project" : request.Title!;
        var ai = llm.IsConfigured ? await TryAiSectionsAsync(title, milestones, cancellationToken) : null;

        var overview = ai?.Overview ?? $"{title} is an undergraduate project. This report lays out the plan, a suggested data model, and guidance to carry it from idea to deployment.";
        var dbDesign = ai?.DatabaseDesign ?? "Model the core entities as normalized tables with primary keys, foreign keys and audit fields (CreatedAt, UpdatedAt). Start from the nouns in your project description and give each its own table, linking them with foreign keys.";
        var facts = await chat.FactsAsync(studentId, requestId, cancellationToken);
        var concerns = facts is null ? [] : await insights.ConcernsAsync(facts, cancellationToken);
        var guidance = ai?.ProposalGuidance ?? "Proposal: problem, objectives, scope, chosen tech and a short plan. Final report: introduction, related work, design & implementation, testing, evaluation and conclusion. Write the introduction and conclusion last.";

        var bytes = Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(44);
                page.DefaultTextStyle(t => t.FontSize(10.5f).FontColor(Ink).LineHeight(1.35f));

                // Header band
                page.Header().Column(h =>
                {
                    h.Item().Text("PROJECTMENTOR · PROJECT REPORT").FontSize(8).FontColor(Gold).LetterSpacing(0.2f);
                    h.Item().PaddingTop(4).Text(title).FontSize(22).Bold().FontColor(Ink);
                    h.Item().PaddingTop(2).Text($"{request.Student.FullName}   ·   {DateTimeOffset.UtcNow:dd MMM yyyy}   ·   {roadmap.Status}").FontSize(9).FontColor(Muted);
                    h.Item().PaddingTop(10).LineHorizontal(1).LineColor(Line);
                });

                page.Content().PaddingVertical(16).Column(col =>
                {
                    col.Spacing(18);

                    Section(col, "1. Project overview", overview);

                    col.Item().Column(s =>
                    {
                        s.Item().Text("2. Roadmap — phases, dates & tasks").FontSize(13).Bold().FontColor(Emerald);
                        s.Item().PaddingTop(8).Column(list =>
                        {
                            list.Spacing(10);
                            foreach (var m in milestones)
                            {
                                list.Item().Border(1).BorderColor(Line).Padding(10).Column(card =>
                                {
                                    card.Item().Row(r =>
                                    {
                                        r.RelativeItem().Text($"{m.OrderIndex}. {m.Title}").Bold().FontColor(Ink);
                                        r.ConstantItem(130).AlignRight().Text($"{m.Phase}  ·  {m.DueDate:dd MMM}").FontSize(8.5f).FontColor(Gold);
                                    });
                                    card.Item().PaddingTop(2).Text($"Status: {m.Status}" + (m.EstimatedHours is > 0 ? $"   ·   Est: {m.EstimatedHours:0}h" : "")).FontSize(8.5f).FontColor(Muted);
                                    if (!string.IsNullOrWhiteSpace(m.Description))
                                        card.Item().PaddingTop(4).Text(m.Description!).FontSize(9.5f);
                                    foreach (var link in m.Resources)
                                        card.Item().PaddingTop(2).Text($"• {link.Resource.Title} — {link.Resource.Url}").FontSize(8.5f).FontColor(Emerald);
                                });
                            }
                        });
                    });

                    Section(col, "3. Suggested database design", dbDesign);
                    Section(col, "4. Writing your proposal & report", guidance);

                    // Written professionally from the mentor chat (not a copy of the questions and answers).
                    if (concerns.Count > 0)
                        col.Item().Column(s =>
                        {
                            s.Item().Text("5. Concerns and solutions").FontSize(13).Bold().FontColor(Emerald);
                            s.Item().PaddingTop(4).Text("The following concerns were identified while planning the project with the mentor, together with the agreed approach for each.")
                                .FontSize(9.5f).FontColor(Muted);
                            var n = 0;
                            foreach (var c in concerns)
                                s.Item().PaddingTop(10).Border(1).BorderColor(Line).Padding(10).Column(card =>
                                {
                                    card.Item().Text($"5.{++n}  {CleanMarkdown(c.Title)}").Bold().FontColor(Ink);
                                    card.Item().PaddingTop(4).Text("Concern").FontSize(8.5f).Bold().FontColor(Gold);
                                    card.Item().Text(CleanMarkdown(c.Description)).FontSize(9.5f);
                                    card.Item().PaddingTop(4).Text("Solution").FontSize(8.5f).Bold().FontColor(Emerald);
                                    card.Item().Text(CleanMarkdown(c.Solution)).FontSize(9.5f);
                                });
                        });
                });

                page.Footer().AlignCenter().Text(t =>
                {
                    t.Span("Generated by ProjectMentor   ·   page ").FontSize(8).FontColor(Muted);
                    t.CurrentPageNumber().FontSize(8).FontColor(Muted);
                });
            });
        }).GeneratePdf();

        var safeName = new string(title.Where(c => char.IsLetterOrDigit(c) || c is ' ' or '-' or '_').ToArray()).Trim().Replace(' ', '_');
        if (string.IsNullOrWhiteSpace(safeName)) safeName = "project";
        return ($"{safeName}_report.pdf", bytes);
    }

    private void Section(ColumnDescriptor col, string heading, string body)
    {
        col.Item().Column(s =>
        {
            s.Item().Text(heading).FontSize(13).Bold().FontColor(Emerald);
            s.Item().PaddingTop(6).Text(CleanMarkdown(body)).FontSize(10).LineHeight(1.4f);
        });
    }

    // Gemini sometimes returns light markdown; strip the noisiest markers for a clean PDF read.
    private static string CleanMarkdown(string text) =>
        text.Replace("**", "").Replace("`", "").Replace("### ", "").Replace("## ", "").Replace("- ", "• ");

    private sealed record AiSections(string? Overview, string? DatabaseDesign, string? ProposalGuidance);

    private async Task<AiSections?> TryAiSectionsAsync(string title, List<Milestone> milestones, CancellationToken cancellationToken)
    {
        try
        {
            const string system =
                "You write concise, practical sections for an undergraduate project report. " +
                "Return ONLY JSON: { \"overview\": string (1 paragraph), \"databaseDesign\": string (list the main tables with key columns and relationships for THIS project), " +
                "\"proposalGuidance\": string (how to write the proposal and final report for THIS project) }. Plain text, no markdown symbols.";
            var phases = string.Join(", ", milestones.Select(m => m.Title));
            var user = $"Project: {title}. Planned milestones: {phases}. Write the three sections tailored to this project.";
            var json = await llm.CompleteJsonAsync(system, user, cancellationToken);
            return System.Text.Json.JsonSerializer.Deserialize<AiSections>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex) when (ex is AiUnavailableException or System.Text.Json.JsonException)
        {
            return null;
        }
    }
}
