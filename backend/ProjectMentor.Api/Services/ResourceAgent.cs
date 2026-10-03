using Microsoft.EntityFrameworkCore;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Attaches up to two learning resources to every milestone. Each roadmap phase maps to library topics; within those,
/// resources whose title/tags share words with the milestone (or the student's technologies) rank first, and free
/// resources are preferred over paid ones.
/// </summary>
public sealed class ResourceAgent(ProjectMentorDbContext db)
{
    static readonly Dictionary<MilestonePhase, string[]> PhaseTopics = new()
    {
        [MilestonePhase.Title] = ["Planning"],
        [MilestonePhase.Design] = ["Design"],
        [MilestonePhase.Build] = ["Build", "Testing", "Version control"],
        [MilestonePhase.Documentation] = ["Documentation"],
        [MilestonePhase.Presentation] = ["Presentation"],
        [MilestonePhase.Deployment] = ["Deployment"],
    };

    public async Task RunAsync(WorkflowContext context, CancellationToken cancellationToken)
    {
        var step = AgentSupport.StartStep(context.Run, AgentName.ResourceAgent, 2, new { phases = context.Plan.Select(x => x.Phase.ToString()) });
        var resources = await db.Resources.AsNoTracking().Include(r => r.Tags).ThenInclude(t => t.Tag).ToListAsync(cancellationToken);
        var attached = 0;

        if (context.Roadmap is not null)
        {
            foreach (var milestone in context.Roadmap.Milestones)
            {
                var topics = PhaseTopics.GetValueOrDefault(milestone.Phase, []);
                var words = Words(milestone.Title + " " + milestone.Description);
                var matches = resources
                    .Where(r => topics.Any(t => r.Topic.StartsWith(t, StringComparison.OrdinalIgnoreCase)))
                    .Select(r => new { r, Score = Words(r.Title + " " + string.Join(' ', r.Tags.Select(t => t.Tag.Name))).Intersect(words).Count() * 3 + (r.IsFree ? 2 : 0) + (r.IsFeatured ? 1 : 0) })
                    .OrderByDescending(x => x.Score).ThenBy(x => x.r.Title).Take(2).Select(x => x.r).ToList();
                if (matches.Count == 0) matches = resources.Where(r => r.IsFree).Take(1).ToList();
                foreach (var resource in matches)
                {
                    db.MilestoneResources.Add(new MilestoneResource
                    {
                        Id = Guid.NewGuid(), MilestoneId = milestone.Id, ResourceId = resource.Id, AttachedBy = AgentName.ResourceAgent
                    });
                    attached++;
                }
            }
        }

        AgentSupport.AddToolCall(db, step, "resource_catalog_lookup", new { count = resources.Count }, new { attached });
        AgentSupport.CompleteStep(db, step, new { attached });
        await db.SaveChangesAsync(cancellationToken);
    }

    static HashSet<string> Words(string? text) =>
        (text ?? "").ToLowerInvariant().Split([' ', ',', '.', '/', '-', '(', ')', ':', '&'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2).ToHashSet();
}
