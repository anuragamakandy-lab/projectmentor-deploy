using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Component B (Resource Hub) business logic: searching, filtering, sorting and paginating the
/// learning-resource catalog, plus admin CRUD. Kept separate from the controller so the query
/// rules are unit-testable and reusable by the Resource agent's search tool.
/// </summary>
public sealed class ResourceCatalogService(ProjectMentorDbContext db)
{
    private const int MaxPageSize = 50;

    private static readonly IReadOnlyDictionary<string, ResourceType> ResourceTypeLookup =
        Enum.GetValues<ResourceType>().ToDictionary(x => x.ToString(), x => x, StringComparer.OrdinalIgnoreCase);

    public static readonly string[] Levels = ["Beginner", "Intermediate", "Advanced"];

    static string Level(string? v) => Levels.FirstOrDefault(l => string.Equals(l, v?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? "Beginner";
    static string? Opt(string? v, int max) => string.IsNullOrWhiteSpace(v) ? null : v.Trim().Length > max ? v.Trim()[..max] : v.Trim();

    public async Task<PagedResponse<ResourceItemResponse>> SearchAsync(ResourceQuery query, CancellationToken cancellationToken, Guid userId = default)
    {
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var resources = db.Resources.AsNoTracking().Include(x => x.Tags).ThenInclude(x => x.Tag).AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = $"%{query.Search.Trim()}%";
            resources = resources.Where(x =>
                EF.Functions.ILike(x.Title, term) ||
                EF.Functions.ILike(x.Topic, term) ||
                (x.Provider != null && EF.Functions.ILike(x.Provider, term)) ||
                x.Tags.Any(t => EF.Functions.ILike(t.Tag.Name, term)) ||
                (x.Description != null && EF.Functions.ILike(x.Description, term)));
        }

        if (!string.IsNullOrWhiteSpace(query.Topic))
            resources = resources.Where(x => x.Topic == query.Topic);

        if (!string.IsNullOrWhiteSpace(query.Type) && ResourceTypeLookup.TryGetValue(query.Type.Trim(), out var type))
            resources = resources.Where(x => x.ResourceType == type);

        if (!string.IsNullOrWhiteSpace(query.Tag))
            resources = resources.Where(x => x.Tags.Any(t => t.Tag.Name == query.Tag));

        if (!string.IsNullOrWhiteSpace(query.Level)) resources = resources.Where(x => x.Level == query.Level);
        if (query.Price == "free") resources = resources.Where(x => x.IsFree);
        if (query.Price == "paid") resources = resources.Where(x => !x.IsFree);

        // Per-student extras: bookmarks and resources linked to their roadmap milestones.
        var bookmarks = userId == default ? [] : await db.ResourceBookmarks.Where(b => b.UserId == userId).Select(b => b.ResourceId).ToListAsync(cancellationToken);
        var linked = userId == default ? [] : await db.MilestoneResources
            .Where(m => m.Milestone.Roadmap.StudentId == userId && m.Milestone.Roadmap.Status != RoadmapStatus.Superseded)
            .Select(m => new { m.ResourceId, m.Milestone.Title }).ToListAsync(cancellationToken);
        if (query.Bookmarked) resources = resources.Where(x => bookmarks.Contains(x.Id));
        if (query.Linked)
        {
            var linkedIds = linked.Select(l => l.ResourceId).Distinct().ToList();
            resources = resources.Where(x => linkedIds.Contains(x.Id));
        }

        resources = ApplySort(resources, query.SortBy, query.SortDir);

        var totalItems = await resources.CountAsync(cancellationToken);
        var rows = await resources
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var items = rows.Select(x => ToResponse(x) with
        {
            Bookmarked = bookmarks.Contains(x.Id),
            LinkedMilestones = linked.Where(l => l.ResourceId == x.Id).Select(l => l.Title).Distinct().ToList(),
        }).ToList();

        var totalPages = totalItems == 0 ? 0 : (int)Math.Ceiling(totalItems / (double)pageSize);
        return new PagedResponse<ResourceItemResponse>(items, page, pageSize, totalItems, totalPages);
    }

    public async Task<ResourceItemResponse?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var resource = await db.Resources.AsNoTracking().Include(x => x.Tags).ThenInclude(x => x.Tag)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return resource is null ? null : ToResponse(resource);
    }

    public async Task<ResourceFacetsResponse> GetFacetsAsync(CancellationToken cancellationToken)
    {
        var topics = await db.Resources.AsNoTracking().Select(x => x.Topic).Distinct().OrderBy(x => x).ToListAsync(cancellationToken);
        var tags = await db.Tags.AsNoTracking().Select(x => x.Name).OrderBy(x => x).ToListAsync(cancellationToken);
        var types = Enum.GetNames<ResourceType>().OrderBy(x => x).ToList();
        var total = await db.Resources.CountAsync(cancellationToken);
        var free = await db.Resources.CountAsync(x => x.IsFree, cancellationToken);
        return new ResourceFacetsResponse(topics, types, tags, Levels, total, free, total - free);
    }

    /// <summary>Adds or removes a bookmark. Returns the new state, or null when the resource does not exist.</summary>
    public async Task<bool?> ToggleBookmarkAsync(Guid userId, Guid resourceId, CancellationToken ct)
    {
        if (!await db.Resources.AnyAsync(r => r.Id == resourceId, ct)) return null;
        var existing = await db.ResourceBookmarks.FirstOrDefaultAsync(b => b.UserId == userId && b.ResourceId == resourceId, ct);
        if (existing is not null) { db.ResourceBookmarks.Remove(existing); await db.SaveChangesAsync(ct); return false; }
        db.ResourceBookmarks.Add(new ResourceBookmark { Id = Guid.NewGuid(), UserId = userId, ResourceId = resourceId });
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { }
        return true;
    }

    public async Task<ResourceItemResponse> CreateAsync(Guid actorId, CreateResourceRequest request, CancellationToken cancellationToken)
    {
        var resourceType = ParseType(request.ResourceType);
        ValidateContent(request.Title, request.Url, request.Topic);

        var resource = new Resource
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Url = request.Url.Trim(),
            ResourceType = resourceType,
            Topic = request.Topic.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Level = Level(request.Level), Duration = Opt(request.Duration, 40), IsFree = request.IsFree,
            Price = request.IsFree ? null : Opt(request.Price, 60), Provider = Opt(request.Provider, 80), IsFeatured = request.IsFeatured,
            AddedById = actorId
        };
        db.Resources.Add(resource);
        await AttachTagsAsync(resource, request.Tags, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return (await GetAsync(resource.Id, cancellationToken))!;
    }

    public async Task<ResourceItemResponse?> UpdateAsync(Guid id, UpdateResourceRequest request, CancellationToken cancellationToken)
    {
        var resource = await db.Resources.Include(x => x.Tags).SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (resource is null) return null;

        resource.ResourceType = ParseType(request.ResourceType);
        ValidateContent(request.Title, request.Url, request.Topic);
        resource.Title = request.Title.Trim();
        resource.Url = request.Url.Trim();
        resource.Topic = request.Topic.Trim();
        resource.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        resource.Level = Level(request.Level);
        resource.Duration = Opt(request.Duration, 40);
        resource.IsFree = request.IsFree;
        resource.Price = request.IsFree ? null : Opt(request.Price, 60);
        resource.Provider = Opt(request.Provider, 80);
        resource.IsFeatured = request.IsFeatured;
        resource.UpdatedAt = DateTimeOffset.UtcNow;

        db.ResourceTags.RemoveRange(resource.Tags);
        resource.Tags.Clear();
        await AttachTagsAsync(resource, request.Tags, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(resource.Id, cancellationToken);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var resource = await db.Resources.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (resource is null) return false;

        var attachedToMilestones = await db.MilestoneResources.AnyAsync(x => x.ResourceId == id, cancellationToken);
        if (attachedToMilestones)
            throw new InvalidOperationException("This resource is attached to a roadmap milestone and cannot be deleted.");

        db.Resources.Remove(resource);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static IQueryable<Resource> ApplySort(IQueryable<Resource> query, string? sortBy, string? sortDir)
    {
        var descending = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        return (sortBy?.Trim().ToLowerInvariant()) switch
        {
            "topic" => descending ? query.OrderByDescending(x => x.Topic) : query.OrderBy(x => x.Topic),
            "type" => descending ? query.OrderByDescending(x => x.ResourceType) : query.OrderBy(x => x.ResourceType),
            "featured" => query.OrderByDescending(x => x.IsFeatured).ThenByDescending(x => x.IsFree).ThenBy(x => x.Title),
            "level" => descending ? query.OrderByDescending(x => x.Level) : query.OrderBy(x => x.Level),
            "createdat" => descending ? query.OrderByDescending(x => x.CreatedAt) : query.OrderBy(x => x.CreatedAt),
            _ => descending ? query.OrderByDescending(x => x.Title) : query.OrderBy(x => x.Title),
        };
    }

    private async Task AttachTagsAsync(Resource resource, IReadOnlyList<string>? tagNames, CancellationToken cancellationToken)
    {
        if (tagNames is null) return;
        var normalized = tagNames.Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (normalized.Count == 0) return;

        var existing = await db.Tags.Where(x => normalized.Contains(x.Name)).ToListAsync(cancellationToken);
        foreach (var name in normalized)
        {
            var tag = existing.SingleOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
            if (tag is null)
            {
                tag = new Tag { Id = Guid.NewGuid(), Name = name };
                db.Tags.Add(tag);
                existing.Add(tag);
            }
            resource.Tags.Add(new ResourceTag { Id = Guid.NewGuid(), ResourceId = resource.Id, TagId = tag.Id });
        }
    }

    private static ResourceType ParseType(string value) =>
        ResourceTypeLookup.TryGetValue((value ?? string.Empty).Trim(), out var type)
            ? type
            : throw new ArgumentException($"Unknown resource type '{value}'. Valid values: {string.Join(", ", Enum.GetNames<ResourceType>())}.");

    private static void ValidateContent(string title, string url, string topic)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("Title is required.");
        if (string.IsNullOrWhiteSpace(topic)) throw new ArgumentException("Topic is required.");
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var parsed) ||
            (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps))
            throw new ArgumentException("A valid http(s) URL is required.");
    }

    private static ResourceItemResponse ToResponse(Resource resource) => new(
        resource.Id,
        resource.Title,
        resource.Url,
        resource.ResourceType.ToString(),
        resource.Topic,
        resource.Description,
        resource.Tags.Select(t => t.Tag.Name).OrderBy(x => x).ToList(),
        resource.Level, resource.Duration, resource.IsFree, resource.Price, resource.Provider, resource.IsFeatured);
}
