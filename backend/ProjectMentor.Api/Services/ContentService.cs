using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Learn content (videos, tracks, lessons) and downloadable files (templates, examples).
/// Everything is stored in the database and managed from the admin panel; the website and the
/// mobile app read the same public payload from <c>GET /api/content/learn</c>.
/// </summary>
public sealed partial class ContentService(ProjectMentorDbContext db)
{
    public const long MaxFileBytes = 15 * 1024 * 1024;
    public static readonly string[] Kinds = ["Template", "Example"];
    static readonly string[] DefaultCategoryOrder = ["Planning", "Requirements & design", "Testing", "Reports", "Team & Git", "Presentation & viva"];

    /// <summary>Block types the clients know how to render.</summary>
    public static readonly string[] BlockTypes = ["p", "tip", "list", "cards", "steps", "doDont", "compare", "table", "example", "videos", "quiz", "checklist", "visual"];

    public static string FileUrl(Guid id) => $"/api/content/files/{id}";

    // ---------------------------------------------------------------- public

    public async Task<LearnContentResponse> LearnAsync(CancellationToken ct)
    {
        var videos = await db.LearnVideos.AsNoTracking().OrderBy(v => v.Title).ToListAsync(ct);
        var tracks = await db.LearnTracks.AsNoTracking()
            .Include(t => t.Lessons.Where(l => l.IsPublished))
            .OrderBy(t => t.SortOrder).ToListAsync(ct);
        var files = await db.ContentFiles.AsNoTracking().Where(f => f.IsPublished)
            .OrderBy(f => f.SortOrder).ThenBy(f => f.Name)
            .Select(f => new { f.Id, f.Kind, f.Name, f.Category, f.Format, f.WhenToUse, f.Description, f.Inside, f.SaveAs, f.FileName, f.Size, f.UpdatedAt })
            .ToListAsync(ct);

        var templates = files.Where(f => f.Kind == "Template")
            .Select(f => new TemplateView(f.Id, f.FileName, f.Name, f.Format, f.Category, f.WhenToUse, f.Inside, f.SaveAs, f.Size, FileUrl(f.Id)))
            .ToList();
        var downloads = files.Where(f => f.Kind == "Example")
            .Select(f => new DownloadView(f.Id, f.FileName, f.Name, f.Format, f.Description, f.Size, FileUrl(f.Id)))
            .ToList();

        var categories = templates.Select(t => t.Category).OfType<string>().Distinct()
            .OrderBy(c => Array.IndexOf(DefaultCategoryOrder, c) is var i && i >= 0 ? i : int.MaxValue).ThenBy(c => c)
            .Prepend("All").ToList();

        var updated = new[]
        {
            videos.Select(v => v.UpdatedAt).DefaultIfEmpty().Max(),
            tracks.SelectMany(t => t.Lessons.Select(l => l.UpdatedAt).Append(t.UpdatedAt)).DefaultIfEmpty().Max(),
            files.Select(f => f.UpdatedAt).DefaultIfEmpty().Max(),
        }.Max();

        return new LearnContentResponse(
            videos.ToDictionary(v => v.YoutubeId, v => new LearnVideoView(v.Title, v.Channel, v.Duration)),
            tracks.ToDictionary(t => t.Key, t => new LearnTrackView(t.Key, t.Label, t.Intro,
                t.Lessons.OrderBy(l => l.SortOrder).Select(l => new LearnLessonView(l.Slug, l.Title, l.Lead, ParseBlocks(l.BlocksJson))).ToList())),
            categories, templates, downloads, updated);
    }

    public Task<ContentFile?> FileAsync(Guid id, bool includeUnpublished, CancellationToken ct) =>
        db.ContentFiles.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id && (includeUnpublished || f.IsPublished), ct);

    public async Task<byte[]> TemplatesZipAsync(CancellationToken ct)
    {
        var files = await db.ContentFiles.AsNoTracking().Where(f => f.IsPublished && f.Kind == "Template")
            .OrderBy(f => f.SortOrder).ToListAsync(ct);
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in files)
            {
                var name = f.FileName;
                for (var n = 2; !used.Add(name); n++) name = $"{Path.GetFileNameWithoutExtension(f.FileName)} ({n}){Path.GetExtension(f.FileName)}";
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                await using var es = entry.Open();
                await es.WriteAsync(f.Data, ct);
            }
        }
        return stream.ToArray();
    }

    // ---------------------------------------------------------------- videos

    public async Task<IReadOnlyList<AdminVideoResponse>> VideosAsync(CancellationToken ct)
    {
        var usage = await VideoUsageAsync(ct);
        return (await db.LearnVideos.AsNoTracking().OrderByDescending(v => v.UpdatedAt).ToListAsync(ct))
            .Select(v => ToAdmin(v, usage)).ToList();
    }

    public async Task<AdminVideoResponse> SaveVideoAsync(Guid? id, SaveVideoRequest body, CancellationToken ct)
    {
        var youtubeId = YoutubeIdFrom(body.Url) ?? throw new ArgumentException("Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…) or an 11-character video id.");
        var title = Clean(body.Title, 200) ?? throw new ArgumentException("Enter the video title.");
        var channel = Clean(body.Channel, 120) ?? throw new ArgumentException("Enter the channel name.");
        if (await db.LearnVideos.AnyAsync(v => v.YoutubeId == youtubeId && v.Id != id, ct))
            throw new ArgumentException("This video is already in the library.");

        var now = DateTimeOffset.UtcNow;
        LearnVideo video;
        if (id is null)
        {
            video = new LearnVideo { Id = Guid.NewGuid(), CreatedAt = now };
            db.LearnVideos.Add(video);
        }
        else
        {
            video = await db.LearnVideos.FirstOrDefaultAsync(v => v.Id == id, ct) ?? throw new KeyNotFoundException();
            if (video.YoutubeId != youtubeId && (await VideoUsageAsync(ct)).ContainsKey(video.YoutubeId))
                throw new ArgumentException("This video is used in a lesson, so its link cannot change. Add the new video instead and swap it in the lesson.");
        }
        video.YoutubeId = youtubeId;
        video.Title = title;
        video.Channel = channel;
        video.Duration = Clean(body.Duration, 20);
        video.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToAdmin(video, await VideoUsageAsync(ct));
    }

    public async Task<bool> DeleteVideoAsync(Guid id, CancellationToken ct)
    {
        var video = await db.LearnVideos.FirstOrDefaultAsync(v => v.Id == id, ct);
        if (video is null) return false;
        if ((await VideoUsageAsync(ct)).TryGetValue(video.YoutubeId, out var lessons))
            throw new InvalidOperationException($"Remove this video from these lessons first: {string.Join(", ", lessons)}.");
        db.LearnVideos.Remove(video);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public static string? YoutubeIdFrom(string? input)
    {
        var s = input?.Trim();
        if (string.IsNullOrEmpty(s)) return null;
        if (VideoIdRegex().IsMatch(s)) return s;
        var m = YoutubeUrlRegex().Match(s);
        return m.Success ? m.Groups[1].Value : null;
    }

    async Task<Dictionary<string, List<string>>> VideoUsageAsync(CancellationToken ct)
    {
        var lessons = await db.LearnLessons.AsNoTracking().Select(l => new { l.Title, l.BlocksJson }).ToListAsync(ct);
        var map = new Dictionary<string, List<string>>();
        foreach (var l in lessons)
            foreach (var vid in VideoIds(l.BlocksJson))
            {
                if (!map.TryGetValue(vid, out var list)) map[vid] = list = [];
                if (!list.Contains(l.Title)) list.Add(l.Title);
            }
        return map;
    }

    static IEnumerable<string> VideoIds(string blocksJson)
    {
        using var doc = JsonDocument.Parse(blocksJson);
        foreach (var b in doc.RootElement.EnumerateArray())
            if (b.TryGetProperty("type", out var t) && t.GetString() == "videos" && b.TryGetProperty("ids", out var ids) && ids.ValueKind == JsonValueKind.Array)
                foreach (var i in ids.EnumerateArray())
                    if (i.GetString() is { } s) yield return s;
    }

    static AdminVideoResponse ToAdmin(LearnVideo v, Dictionary<string, List<string>> usage) =>
        new(v.Id, v.YoutubeId, v.Title, v.Channel, v.Duration, usage.TryGetValue(v.YoutubeId, out var u) ? u : [], v.UpdatedAt);

    // ---------------------------------------------------------------- tracks & lessons

    public async Task<IReadOnlyList<AdminTrackResponse>> TracksAsync(CancellationToken ct)
    {
        var tracks = await db.LearnTracks.AsNoTracking().Include(t => t.Lessons).OrderBy(t => t.SortOrder).ToListAsync(ct);
        return tracks.Select(ToAdmin).ToList();
    }

    public async Task<AdminTrackResponse> SaveTrackAsync(Guid? id, SaveTrackRequest body, CancellationToken ct)
    {
        var label = Clean(body.Label, 120) ?? throw new ArgumentException("Enter a track name.");
        var now = DateTimeOffset.UtcNow;
        LearnTrack track;
        if (id is null)
        {
            var key = Slugify(body.Key ?? label, 40);
            if (key.Length == 0) throw new ArgumentException("Enter a track name.");
            if (await db.LearnTracks.AnyAsync(t => t.Key == key, ct)) throw new ArgumentException("A track with this short name already exists.");
            var order = await db.LearnTracks.Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? 0;
            track = new LearnTrack { Id = Guid.NewGuid(), Key = key, SortOrder = order + 1, CreatedAt = now };
            db.LearnTracks.Add(track);
        }
        else track = await db.LearnTracks.Include(t => t.Lessons).FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw new KeyNotFoundException();
        track.Label = label;
        track.Intro = Clean(body.Intro, 1000) ?? "";
        track.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToAdmin(track);
    }

    public async Task<bool> DeleteTrackAsync(Guid id, CancellationToken ct)
    {
        var track = await db.LearnTracks.Include(t => t.Lessons).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (track is null) return false;
        if (track.Lessons.Count > 0) throw new InvalidOperationException("Delete or move the lessons in this track first.");
        db.LearnTracks.Remove(track);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task ReorderTracksAsync(IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var tracks = await db.LearnTracks.ToListAsync(ct);
        ApplyOrder(tracks, ids, (t, i) => t.SortOrder = i);
        await db.SaveChangesAsync(ct);
    }

    public async Task<AdminLessonResponse?> LessonAsync(Guid id, CancellationToken ct) =>
        await db.LearnLessons.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id, ct) is { } l ? ToAdmin(l) : null;

    public async Task<AdminLessonResponse> SaveLessonAsync(Guid? id, SaveLessonRequest body, CancellationToken ct)
    {
        var title = Clean(body.Title, 200) ?? throw new ArgumentException("Enter the lesson title.");
        if (!await db.LearnTracks.AnyAsync(t => t.Id == body.TrackId, ct)) throw new ArgumentException("Choose a track.");
        var blocksJson = await ValidateBlocksAsync(body.Blocks, ct);
        var now = DateTimeOffset.UtcNow;

        LearnLesson lesson;
        if (id is null)
        {
            lesson = new LearnLesson { Id = Guid.NewGuid(), CreatedAt = now, Slug = "" };
            db.LearnLessons.Add(lesson);
        }
        else lesson = await db.LearnLessons.FirstOrDefaultAsync(l => l.Id == id, ct) ?? throw new KeyNotFoundException();

        if (lesson.TrackId != body.TrackId || id is null)
        {
            var order = await db.LearnLessons.Where(l => l.TrackId == body.TrackId).Select(l => (int?)l.SortOrder).MaxAsync(ct) ?? 0;
            lesson.SortOrder = order + 1;
        }
        lesson.TrackId = body.TrackId;

        // Slugs are used in app links (/learn/track/slug), so keep them stable once set.
        var slug = Slugify(string.IsNullOrWhiteSpace(body.Slug) ? (lesson.Slug.Length > 0 ? lesson.Slug : title) : body.Slug, 60);
        if (slug.Length == 0) slug = "lesson";
        var baseSlug = slug;
        for (var n = 2; await db.LearnLessons.AnyAsync(l => l.TrackId == body.TrackId && l.Slug == slug && l.Id != lesson.Id, ct); n++) slug = $"{baseSlug}-{n}";
        lesson.Slug = slug;

        lesson.Title = title;
        lesson.Lead = Clean(body.Lead, 1000);
        lesson.IsPublished = body.IsPublished;
        lesson.BlocksJson = blocksJson;
        lesson.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToAdmin(lesson);
    }

    public async Task<bool> DeleteLessonAsync(Guid id, CancellationToken ct) =>
        await db.LearnLessons.Where(l => l.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task ReorderLessonsAsync(Guid trackId, IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var lessons = await db.LearnLessons.Where(l => l.TrackId == trackId).ToListAsync(ct);
        ApplyOrder(lessons, ids, (l, i) => l.SortOrder = i);
        await db.SaveChangesAsync(ct);
    }

    async Task<string> ValidateBlocksAsync(JsonElement blocks, CancellationToken ct)
    {
        if (blocks.ValueKind != JsonValueKind.Array) throw new ArgumentException("Lesson content must be a list of blocks.");
        var known = (await db.LearnVideos.Select(v => v.YoutubeId).ToListAsync(ct)).ToHashSet();
        var n = 0;
        foreach (var b in blocks.EnumerateArray())
        {
            n++;
            if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty("type", out var t) || t.ValueKind != JsonValueKind.String)
                throw new ArgumentException($"Block {n} has no type.");
            var type = t.GetString()!;
            if (!BlockTypes.Contains(type)) throw new ArgumentException($"Block {n}: unknown type \"{type}\".");
            if (type == "videos")
            {
                if (!b.TryGetProperty("ids", out var ids) || ids.ValueKind != JsonValueKind.Array || ids.GetArrayLength() == 0)
                    throw new ArgumentException($"Block {n}: choose at least one video.");
                foreach (var i in ids.EnumerateArray())
                    if (i.GetString() is not { } vid || !known.Contains(vid))
                        throw new ArgumentException($"Block {n}: video \"{i}\" is not in the video library. Add it under Videos first.");
            }
            if ((type is "p" or "tip") && (!b.TryGetProperty("text", out var text) || string.IsNullOrWhiteSpace(text.GetString())))
                throw new ArgumentException($"Block {n}: write some text or remove the block.");
        }
        var json = blocks.GetRawText();
        if (json.Length > 200_000) throw new ArgumentException("This lesson is too long. Split it into two lessons.");
        return json;
    }

    static AdminTrackResponse ToAdmin(LearnTrack t) => new(t.Id, t.Key, t.Label, t.Intro, t.SortOrder,
        t.Lessons.OrderBy(l => l.SortOrder).Select(l => new AdminLessonSummary(l.Id, l.Slug, l.Title, l.IsPublished, l.SortOrder, CountBlocks(l.BlocksJson), l.UpdatedAt)).ToList());

    static AdminLessonResponse ToAdmin(LearnLesson l) => new(l.Id, l.TrackId, l.Slug, l.Title, l.Lead, l.IsPublished, ParseBlocks(l.BlocksJson), l.UpdatedAt);

    static int CountBlocks(string json) { using var d = JsonDocument.Parse(json); return d.RootElement.GetArrayLength(); }

    static JsonElement ParseBlocks(string json) { using var d = JsonDocument.Parse(json); return d.RootElement.Clone(); }

    // ---------------------------------------------------------------- files

    public async Task<IReadOnlyList<AdminFileResponse>> FilesAsync(CancellationToken ct) =>
        (await db.ContentFiles.AsNoTracking().OrderBy(f => f.Kind).ThenBy(f => f.SortOrder)
            .Select(f => new { f.Id, f.Kind, f.Name, f.Category, f.Format, f.WhenToUse, f.Description, f.Inside, f.SaveAs, f.SortOrder, f.IsPublished, f.FileName, f.ContentType, f.Size, f.UpdatedAt })
            .ToListAsync(ct))
        .Select(f => new AdminFileResponse(f.Id, f.Kind, f.Name, f.Category, f.Format, f.WhenToUse, f.Description, f.Inside, f.SaveAs,
            f.SortOrder, f.IsPublished, f.FileName, f.ContentType, f.Size, f.UpdatedAt, FileUrl(f.Id)))
        .ToList();

    public sealed record FileForm(string? Kind, string? Name, string? Category, string? Format, string? WhenToUse,
        string? Description, string? Inside, string? SaveAs, bool IsPublished, IFormFile? File);

    public async Task<AdminFileResponse> SaveFileAsync(Guid? id, FileForm form, CancellationToken ct)
    {
        var name = Clean(form.Name, 160) ?? throw new ArgumentException("Enter a name.");
        var kind = Kinds.FirstOrDefault(k => k.Equals(form.Kind, StringComparison.OrdinalIgnoreCase)) ?? throw new ArgumentException("Choose Template or Example.");
        var now = DateTimeOffset.UtcNow;

        ContentFile file;
        if (id is null)
        {
            if (form.File is null) throw new ArgumentException("Choose a file to upload.");
            var order = await db.ContentFiles.Where(f => f.Kind == kind).Select(f => (int?)f.SortOrder).MaxAsync(ct) ?? 0;
            file = new ContentFile { Id = Guid.NewGuid(), CreatedAt = now, SortOrder = order + 1, FileName = "", ContentType = "", Data = [] };
            db.ContentFiles.Add(file);
        }
        else file = await db.ContentFiles.FirstOrDefaultAsync(f => f.Id == id, ct) ?? throw new KeyNotFoundException();

        if (form.File is not null)
        {
            if (form.File.Length == 0) throw new ArgumentException("The file is empty.");
            if (form.File.Length > MaxFileBytes) throw new ArgumentException("Files must be 15 MB or smaller.");
            var fileName = Path.GetFileName(form.File.FileName).Trim();
            if (fileName.Length is 0 or > 200) throw new ArgumentException("The file name is not valid.");
            using var ms = new MemoryStream();
            await form.File.CopyToAsync(ms, ct);
            file.Data = ms.ToArray();
            file.Size = file.Data.LongLength;
            file.FileName = fileName;
            file.ContentType = ContentTypeFor(fileName);
        }

        file.Kind = kind;
        file.Name = name;
        file.Category = kind == "Template" ? Clean(form.Category, 80) ?? throw new ArgumentException("Choose a category.") : null;
        file.Format = Clean(form.Format, 40) ?? FormatFor(file.FileName);
        file.WhenToUse = Clean(form.WhenToUse, 500);
        file.Description = Clean(form.Description, 1000);
        file.Inside = (form.Inside ?? "").Split('\n').Select(s => s.Trim()).Where(s => s.Length > 0).Take(20).Select(s => s.Length > 300 ? s[..300] : s).ToArray();
        file.SaveAs = Clean(form.SaveAs, 160);
        file.IsPublished = form.IsPublished;
        file.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return new AdminFileResponse(file.Id, file.Kind, file.Name, file.Category, file.Format, file.WhenToUse, file.Description, file.Inside,
            file.SaveAs, file.SortOrder, file.IsPublished, file.FileName, file.ContentType, file.Size, file.UpdatedAt, FileUrl(file.Id));
    }

    public async Task<bool> DeleteFileAsync(Guid id, CancellationToken ct) =>
        await db.ContentFiles.Where(f => f.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task ReorderFilesAsync(IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var files = await db.ContentFiles.Where(f => ids.Contains(f.Id)).ToListAsync(ct);
        ApplyOrder(files, ids, (f, i) => f.SortOrder = i);
        await db.SaveChangesAsync(ct);
    }

    static readonly FileExtensionContentTypeProvider Types = new();

    static string ContentTypeFor(string fileName) =>
        Types.TryGetContentType(fileName, out var type) ? type : "application/octet-stream";

    static string FormatFor(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".docx" or ".doc" => "Word",
        ".xlsx" or ".xls" => "Excel",
        ".pptx" or ".ppt" => "PowerPoint",
        ".pdf" => "PDF",
        ".md" => "Markdown",
        ".zip" => "ZIP",
        _ => "Text",
    };

    // ---------------------------------------------------------------- home page

    public static readonly string[] Sections = ["features", "journey", "agents", "faq"];
    public static readonly string[] SiteImages = ["plan", "team", "learn", "viva", "community", "build", "present", "books", "graduation"];

    public async Task<SiteContentResponse> SiteAsync(CancellationToken ct)
    {
        var all = await db.SiteEntries.AsNoTracking().Where(e => e.IsPublished).OrderBy(e => e.SortOrder).ToListAsync(ct);
        List<SiteEntryView> Of(string section) => all.Where(e => e.Section == section)
            .Select(e => new SiteEntryView(e.Id, e.Title, e.Body, e.Image, e.LinkUrl, e.LinkLabel)).ToList();
        return new SiteContentResponse(Of("features"), Of("journey"), Of("agents"), Of("faq"),
            await db.LearnLessons.CountAsync(l => l.IsPublished, ct),
            await db.LearnVideos.CountAsync(ct),
            await db.ContentFiles.CountAsync(f => f.IsPublished && f.Kind == "Template", ct));
    }

    public async Task<IReadOnlyList<AdminSiteEntryResponse>> SiteEntriesAsync(CancellationToken ct) =>
        (await db.SiteEntries.AsNoTracking().OrderBy(e => e.Section).ThenBy(e => e.SortOrder).ToListAsync(ct)).Select(ToAdmin).ToList();

    public async Task<AdminSiteEntryResponse> SaveSiteEntryAsync(Guid? id, SaveSiteEntryRequest body, CancellationToken ct)
    {
        var section = Sections.FirstOrDefault(s => s == body.Section) ?? throw new ArgumentException("Unknown section.");
        var title = Clean(body.Title, 200) ?? throw new ArgumentException(section == "faq" ? "Enter the question." : "Enter a title.");
        var text = Clean(body.Body, 2000) ?? throw new ArgumentException(section == "faq" ? "Enter the answer." : "Enter the text.");
        var image = Clean(body.Image, 60);
        if (image is not null && !SiteImages.Contains(image)) throw new ArgumentException("Choose one of the listed images.");
        var link = Clean(body.LinkUrl, 300);
        if (link is not null && !(link.StartsWith('/') || link.StartsWith("https://"))) throw new ArgumentException("Links must start with / (a page on this site) or https://.");
        var now = DateTimeOffset.UtcNow;

        SiteEntry entry;
        if (id is null)
        {
            var order = await db.SiteEntries.Where(e => e.Section == section).Select(e => (int?)e.SortOrder).MaxAsync(ct) ?? 0;
            entry = new SiteEntry { Id = Guid.NewGuid(), CreatedAt = now, SortOrder = order + 1, Section = section };
            db.SiteEntries.Add(entry);
        }
        else entry = await db.SiteEntries.FirstOrDefaultAsync(e => e.Id == id, ct) ?? throw new KeyNotFoundException();
        if (entry.Section != section) throw new ArgumentException("An item cannot move to another section.");
        entry.Title = title;
        entry.Body = text;
        entry.Image = section == "features" ? image : null;
        entry.LinkUrl = section == "features" ? link : null;
        entry.LinkLabel = section == "features" ? Clean(body.LinkLabel, 60) : null;
        entry.IsPublished = body.IsPublished;
        entry.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToAdmin(entry);
    }

    public async Task<bool> DeleteSiteEntryAsync(Guid id, CancellationToken ct) =>
        await db.SiteEntries.Where(e => e.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task ReorderSiteEntriesAsync(IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var entries = await db.SiteEntries.Where(e => ids.Contains(e.Id)).ToListAsync(ct);
        ApplyOrder(entries, ids, (e, i) => e.SortOrder = i);
        await db.SaveChangesAsync(ct);
    }

    static AdminSiteEntryResponse ToAdmin(SiteEntry e) =>
        new(e.Id, e.Section, e.Title, e.Body, e.Image, e.LinkUrl, e.LinkLabel, e.SortOrder, e.IsPublished, e.UpdatedAt);

    // ---------------------------------------------------------------- seed

    /// <summary>Loads the original Learn content and files into an empty database (first run only).</summary>
    public static async Task SeedAsync(ProjectMentorDbContext db, string seedDir, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var jsonPath = Path.Combine(seedDir, "learn.json");
        using var doc = JsonDocument.Parse(File.Exists(jsonPath) ? await File.ReadAllTextAsync(jsonPath, ct) : "{}");
        var root = doc.RootElement;
        if (root.TryGetProperty("videos", out _))
        {

        if (!await db.LearnVideos.AnyAsync(ct))
            foreach (var v in root.GetProperty("videos").EnumerateObject())
                db.LearnVideos.Add(new LearnVideo
                {
                    Id = Guid.NewGuid(), YoutubeId = v.Name, Title = Str(v.Value, "title")!, Channel = Str(v.Value, "channel") ?? "YouTube",
                    Duration = Str(v.Value, "duration"), CreatedAt = now, UpdatedAt = now,
                });

        if (!await db.LearnTracks.AnyAsync(ct))
        {
            var t = 0;
            foreach (var tr in root.GetProperty("tracks").EnumerateObject())
            {
                var track = new LearnTrack
                {
                    Id = Guid.NewGuid(), Key = tr.Name, Label = Str(tr.Value, "label")!, Intro = Str(tr.Value, "intro") ?? "",
                    SortOrder = ++t, CreatedAt = now, UpdatedAt = now,
                };
                var l = 0;
                foreach (var lesson in tr.Value.GetProperty("lessons").EnumerateArray())
                    track.Lessons.Add(new LearnLesson
                    {
                        Id = Guid.NewGuid(), Slug = Str(lesson, "id")!, Title = Str(lesson, "title")!, Lead = Str(lesson, "lead"),
                        SortOrder = ++l, BlocksJson = lesson.GetProperty("blocks").GetRawText(), CreatedAt = now, UpdatedAt = now,
                    });
                db.LearnTracks.Add(track);
            }
        }

        if (!await db.ContentFiles.AnyAsync(ct))
        {
            var filesDir = Path.Combine(seedDir, "files");
            var order = 0;
            foreach (var tpl in root.GetProperty("templates").EnumerateArray())
            {
                var path = Path.Combine(filesDir, Str(tpl, "file")!);
                if (!File.Exists(path)) continue;
                var data = await File.ReadAllBytesAsync(path, ct);
                db.ContentFiles.Add(new ContentFile
                {
                    Id = Guid.NewGuid(), Kind = "Template", Name = Str(tpl, "name")!, Category = Str(tpl, "category"), Format = Str(tpl, "format"),
                    WhenToUse = Str(tpl, "when"), Inside = tpl.TryGetProperty("inside", out var ins) ? ins.EnumerateArray().Select(x => x.GetString()!).ToArray() : [],
                    SaveAs = Str(tpl, "saveAs"), SortOrder = ++order, FileName = Path.GetFileName(path), ContentType = ContentTypeFor(path),
                    Size = data.LongLength, Data = data, CreatedAt = now, UpdatedAt = now,
                });
            }
            order = 0;
            foreach (var ex in root.GetProperty("downloads").EnumerateArray())
            {
                var path = Path.Combine(filesDir, Path.GetFileName(Str(ex, "file")!));
                if (!File.Exists(path)) continue;
                var data = await File.ReadAllBytesAsync(path, ct);
                db.ContentFiles.Add(new ContentFile
                {
                    Id = Guid.NewGuid(), Kind = "Example", Name = Str(ex, "name")!, Format = Str(ex, "type"), Description = Str(ex, "text"),
                    SortOrder = ++order, FileName = Path.GetFileName(path), ContentType = ContentTypeFor(path),
                    Size = data.LongLength, Data = data, CreatedAt = now, UpdatedAt = now,
                });
            }
        }
        }

        var sitePath = Path.Combine(seedDir, "site.json");
        if (File.Exists(sitePath) && !await db.SiteEntries.AnyAsync(ct))
        {
            using var site = JsonDocument.Parse(await File.ReadAllTextAsync(sitePath, ct));
            foreach (var section in site.RootElement.EnumerateObject())
            {
                var order = 0;
                foreach (var e in section.Value.EnumerateArray())
                    db.SiteEntries.Add(new SiteEntry
                    {
                        Id = Guid.NewGuid(), Section = section.Name, Title = Str(e, "title")!, Body = Str(e, "body") ?? "",
                        Image = Str(e, "image"), LinkUrl = Str(e, "linkUrl"), LinkLabel = Str(e, "linkLabel"),
                        SortOrder = ++order, CreatedAt = now, UpdatedAt = now,
                    });
            }
        }

        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync(ct);
    }

    // ---------------------------------------------------------------- helpers

    static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;

    static string? Clean(string? s, int max)
    {
        s = s?.Trim();
        if (string.IsNullOrEmpty(s)) return null;
        if (s.Length > max) throw new ArgumentException($"Keep this under {max} characters.");
        return s;
    }

    static string Slugify(string s, int max)
    {
        var slug = SlugRegex().Replace(s.Trim().ToLowerInvariant(), "-").Trim('-');
        return slug.Length > max ? slug[..max].Trim('-') : slug;
    }

    static void ApplyOrder<T>(List<T> items, IReadOnlyList<Guid> ids, Action<T, int> set) where T : AuditedEntity
    {
        var now = DateTimeOffset.UtcNow;
        var position = ids.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        var i = 0;
        foreach (var item in items.OrderBy(x => position.TryGetValue(x.Id, out var p) ? p : int.MaxValue))
        {
            set(item, ++i);
            item.UpdatedAt = now;
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{11}$")]
    private static partial Regex VideoIdRegex();

    [GeneratedRegex(@"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")]
    private static partial Regex YoutubeUrlRegex();

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex SlugRegex();
}
