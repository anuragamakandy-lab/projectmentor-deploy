using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// One-time content updates that run at start-up. Each step records a marker in system_settings ("seed:...") so it runs once:
/// admins can then edit or delete the content freely without it coming back.
/// </summary>
public static class SystemSeed
{
    public const string PageEmail = "page@projectmentor.local";

    public static async Task RunAsync(ProjectMentorDbContext db, string seedDir, CancellationToken ct = default)
    {
        await OfficialPageAsync(db, seedDir, ct);
        // Sinhala was removed: every examiner speaks English.
        await db.VivaCharacters.Where(c => c.Language == "si-LK").ExecuteUpdateAsync(x => x.SetProperty(c => c.Language, "en-GB"), ct);
        await db.VivaSessions.Where(c => c.Language == "si-LK").ExecuteUpdateAsync(x => x.SetProperty(c => c.Language, "en-GB"), ct);
        await Once(db, "seed:resources-v1", () => ResourcesAsync(db, seedDir, ct), ct);
        await Once(db, "seed:learn-extra-v1", () => LearnExtraAsync(db, seedDir, ct), ct);
    }

    static async Task Once(ProjectMentorDbContext db, string key, Func<Task> run, CancellationToken ct)
    {
        if (await db.SystemSettings.AnyAsync(s => s.Key == key, ct)) return;
        await run();
        db.SystemSettings.Add(new SystemSetting { Id = Guid.NewGuid(), Key = key, Value = DateTimeOffset.UtcNow.ToString("O") });
        await db.SaveChangesAsync(ct);
    }

    static async Task<Guid> AdminIdAsync(ProjectMentorDbContext db, CancellationToken ct) =>
        await db.Users.Where(u => u.Role == UserRole.Admin).OrderBy(u => u.CreatedAt).Select(u => u.Id).FirstAsync(ct);

    // ---------------------------------------------------------------- official ProjectMentor page

    static async Task OfficialPageAsync(ProjectMentorDbContext db, string seedDir, CancellationToken ct)
    {
        if (await db.Users.AnyAsync(u => u.IsOfficial, ct)) return;
        var now = DateTimeOffset.UtcNow;
        var page = new User
        {
            Id = Guid.NewGuid(), Email = PageEmail, FullName = "ProjectMentor", Role = UserRole.Student, IsActive = true, IsOfficial = true,
            PasswordHash = "official:" + Guid.NewGuid().ToString("N"), // can never sign in; admins post as the page from the admin panel
            Bio = "The official ProjectMentor page. Tips, announcements and new features to help you go from first idea to final viva.",
            University = "ProjectMentor", Website = "https://projectmentor.local",
            VisibilityJson = "{\"links\":\"Public\"}", CreatedAt = now, UpdatedAt = now,
        };
        db.Users.Add(page);
        await db.SaveChangesAsync(ct);

        async Task<Guid?> Image(string file, string type)
        {
            var path = Path.Combine(seedDir, "page", file);
            if (!File.Exists(path)) return null;
            var bytes = await File.ReadAllBytesAsync(path, ct);
            var up = new Upload { Id = Guid.NewGuid(), OwnerId = page.Id, FileName = file, ContentType = type, Size = bytes.Length, Data = bytes };
            db.Uploads.Add(up);
            return up.Id;
        }
        page.AvatarUploadId = await Image("avatar.png", "image/png");
        page.CoverUploadId = await Image("cover.jpg", "image/jpeg");

        var posts = new (string Kind, string Title, string Text)[]
        {
            ("Announcement", "Welcome to the ProjectMentor community",
             "Welcome! This is the place to share your project progress, ask questions and help each other.\n\nAdd friends, react and comment on posts, and share useful posts to your own feed. Every post is checked by an admin before it appears, so keep it friendly and never share passwords or personal details."),
            ("Update", "How to get your roadmap approved",
             "1. Start a new roadmap and answer the questions honestly (deadline, hours per week, team size).\n2. Chat with the mentor: it will ask about your users, key features and technology.\n3. Review the milestones, then Accept.\n\nTip: a realistic scope gets approved faster than a huge one. You can always add features later."),
            ("Update", "Mock viva tips",
             "Practise with the mock viva before the real one:\n- Know WHY you chose each technology\n- Be ready to explain your database design\n- Say what you would improve with more time\n- Keep answers short and give an example\n\nPick an examiner character and choose Strict mode for your final practice."),
            ("Announcement", "New in Learn: the Diagrams track",
             "The Learn page now has a full Diagrams track: ER, EER, system architecture, database schema, use case, class, sequence, activity and data flow diagrams, each with an example and videos. We also added lessons and templates for test reports, interim progress reports, design documents and user manuals."),
        };
        var t = now.AddMinutes(-posts.Length);
        foreach (var (kind, title, text) in posts)
        {
            t = t.AddMinutes(1);
            db.Posts.Add(new Post
            {
                Id = Guid.NewGuid(), AuthorId = page.Id, Kind = kind, ProjectTitle = title, Content = text, Status = PostStatus.Approved,
                ModeratedAt = t, CreatedAt = t, UpdatedAt = t, Visibility = "Public",
            });
        }
        // Older admin announcements move to the official page so all official posts appear in one place.
        var adminIds = await db.Users.Where(u => u.Role == UserRole.Admin).Select(u => u.Id).ToListAsync(ct);
        await db.Posts.Where(p => adminIds.Contains(p.AuthorId)).ExecuteUpdateAsync(s => s.SetProperty(p => p.AuthorId, page.Id), ct);
        await db.SaveChangesAsync(ct);
    }

    // ---------------------------------------------------------------- resources library

    static async Task ResourcesAsync(ProjectMentorDbContext db, string seedDir, CancellationToken ct)
    {
        var path = Path.Combine(seedDir, "resources.json");
        if (!File.Exists(path)) return;
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(path, ct));
        var adminId = await AdminIdAsync(db, ct);
        var existing = await db.Resources.Include(r => r.Tags).ToListAsync(ct);
        var tags = await db.Tags.ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        foreach (var r in doc.RootElement.GetProperty("resources").EnumerateArray())
        {
            string? S(string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            var url = S("url")!;
            var res = existing.FirstOrDefault(x => string.Equals(x.Url.TrimEnd('/'), url.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));
            if (res is null)
            {
                res = new Resource { Id = Guid.NewGuid(), Url = url, AddedById = adminId, CreatedAt = now };
                db.Resources.Add(res);
                existing.Add(res);
            }
            res.Title = S("title")!;
            res.ResourceType = Enum.Parse<ResourceType>(S("type") ?? "Article");
            res.Topic = S("topic")!;
            res.Description = S("description");
            res.Level = S("level") ?? "Beginner";
            res.Duration = S("duration");
            res.Provider = S("provider");
            res.IsFree = !r.TryGetProperty("free", out var f) || f.GetBoolean();
            res.Price = S("price");
            res.IsFeatured = res.IsFree && res.Level == "Beginner" && res.ResourceType is ResourceType.Course or ResourceType.Video;
            res.UpdatedAt = now;
            if (r.TryGetProperty("tags", out var tagList))
                foreach (var name in tagList.EnumerateArray().Select(x => x.GetString()!))
                {
                    var tag = tags.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
                    if (tag is null) { tag = new Tag { Id = Guid.NewGuid(), Name = name }; db.Tags.Add(tag); tags.Add(tag); }
                    if (res.Tags.All(x => x.TagId != tag.Id))
                    {
                        var link = new ResourceTag { Id = Guid.NewGuid(), ResourceId = res.Id, TagId = tag.Id };
                        db.ResourceTags.Add(link); // explicit Add: a preset key would otherwise be treated as an existing row
                        res.Tags.Add(link);
                    }
                }
        }
        await db.SaveChangesAsync(ct);
    }

    // ---------------------------------------------------------------- Learn: diagrams track, new lessons and templates

    static async Task LearnExtraAsync(ProjectMentorDbContext db, string seedDir, CancellationToken ct)
    {
        var path = Path.Combine(seedDir, "learn-extra.json");
        if (!File.Exists(path)) return;
        var root = JsonNode.Parse(await File.ReadAllTextAsync(path, ct))!.AsObject();
        var adminId = await AdminIdAsync(db, ct);
        var now = DateTimeOffset.UtcNow;

        var known = await db.LearnVideos.Select(v => v.YoutubeId).ToListAsync(ct);
        foreach (var (id, v) in root["videos"]!.AsObject())
            if (!known.Contains(id))
                db.LearnVideos.Add(new LearnVideo { Id = Guid.NewGuid(), YoutubeId = id, Title = (string)v!["title"]!, Channel = (string)v["channel"]!, CreatedAt = now, UpdatedAt = now });

        // Image blocks name a file in Seed/diagrams; store each once as an upload and point the block at it.
        var images = new Dictionary<string, Guid>();
        async Task<JsonNode> Blocks(JsonNode blocks)
        {
            foreach (var b in blocks.AsArray())
                if ((string?)b!["type"] == "image" && b["file"] is { } fileNode)
                {
                    var file = (string)fileNode!;
                    if (!images.TryGetValue(file, out var uploadId))
                    {
                        var bytes = await File.ReadAllBytesAsync(Path.Combine(seedDir, "diagrams", file), ct);
                        uploadId = Guid.NewGuid();
                        db.Uploads.Add(new Upload { Id = uploadId, OwnerId = adminId, FileName = file, ContentType = "image/png", Size = bytes.Length, Data = bytes });
                        images[file] = uploadId;
                    }
                    b.AsObject().Remove("file");
                    b["uploadId"] = uploadId.ToString();
                }
            return blocks;
        }

        var maxOrder = await db.LearnTracks.MaxAsync(t => (int?)t.SortOrder, ct) ?? 0;
        foreach (var (key, tr) in root["tracks"]!.AsObject())
        {
            if (await db.LearnTracks.AnyAsync(t => t.Key == key, ct)) continue;
            var track = new LearnTrack { Id = Guid.NewGuid(), Key = key, Label = (string)tr!["label"]!, Intro = (string?)tr["intro"] ?? "", SortOrder = ++maxOrder, CreatedAt = now, UpdatedAt = now };
            var order = 0;
            foreach (var l in tr["lessons"]!.AsArray())
                track.Lessons.Add(new LearnLesson
                {
                    Id = Guid.NewGuid(), Slug = (string)l!["id"]!, Title = (string)l["title"]!, Lead = (string?)l["lead"], SortOrder = ++order,
                    BlocksJson = (await Blocks(l["blocks"]!)).ToJsonString(), CreatedAt = now, UpdatedAt = now,
                });
            db.LearnTracks.Add(track);
        }

        foreach (var (key, lessons) in root["lessons"]!.AsObject())
        {
            var track = await db.LearnTracks.Include(t => t.Lessons).FirstOrDefaultAsync(t => t.Key == key, ct);
            if (track is null) continue;
            var order = track.Lessons.Count == 0 ? 0 : track.Lessons.Max(x => x.SortOrder);
            foreach (var l in lessons!.AsArray())
            {
                var slug = (string)l!["id"]!;
                if (track.Lessons.Any(x => x.Slug == slug)) continue;
                db.LearnLessons.Add(new LearnLesson
                {
                    Id = Guid.NewGuid(), TrackId = track.Id, Slug = slug, Title = (string)l["title"]!, Lead = (string?)l["lead"], SortOrder = ++order,
                    BlocksJson = (await Blocks(l["blocks"]!)).ToJsonString(), CreatedAt = now, UpdatedAt = now,
                });
            }
        }

        var fileOrder = await db.ContentFiles.Where(f => f.Kind == "Template").MaxAsync(f => (int?)f.SortOrder, ct) ?? 0;
        foreach (var tpl in root["templates"]!.AsArray())
        {
            var file = (string)tpl!["file"]!;
            var full = Path.Combine(seedDir, "files", file);
            if (!File.Exists(full) || await db.ContentFiles.AnyAsync(f => f.FileName == file, ct)) continue;
            var data = await File.ReadAllBytesAsync(full, ct);
            db.ContentFiles.Add(new ContentFile
            {
                Id = Guid.NewGuid(), Kind = "Template", Name = (string)tpl["name"]!, Category = (string?)tpl["category"], Format = (string?)tpl["format"],
                WhenToUse = (string?)tpl["when"], Inside = tpl["inside"]!.AsArray().Select(x => (string)x!).ToArray(), SortOrder = ++fileOrder,
                FileName = file, ContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Size = data.LongLength, Data = data,
                CreatedAt = now, UpdatedAt = now,
            });
        }
        await db.SaveChangesAsync(ct);
    }
}
