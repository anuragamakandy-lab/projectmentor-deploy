using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Data;

namespace ProjectMentor.Api.Services;

/// <summary>
/// Files for posts and chat. Stored in PostgreSQL so they survive redeploys. Only safe types are accepted,
/// and the first bytes are checked so a renamed file cannot pretend to be an image. SVG/HTML are never allowed.
/// </summary>
public sealed class UploadService(ProjectMentorDbContext db)
{
    public const long MaxImageBytes = 5 * 1024 * 1024;
    public const long MaxDocBytes = 10 * 1024 * 1024;

    private static readonly Dictionary<string, (string Type, byte[][] Magic)> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = ("image/png", [[0x89, 0x50, 0x4E, 0x47]]),
        [".jpg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
        [".jpeg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
        [".gif"] = ("image/gif", [[0x47, 0x49, 0x46, 0x38]]),
        [".webp"] = ("image/webp", [[0x52, 0x49, 0x46, 0x46]]),
        [".pdf"] = ("application/pdf", [[0x25, 0x50, 0x44, 0x46]]),
        [".docx"] = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [[0x50, 0x4B, 0x03, 0x04]]),
        [".pptx"] = ("application/vnd.openxmlformats-officedocument.presentationml.presentation", [[0x50, 0x4B, 0x03, 0x04]]),
        [".xlsx"] = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [[0x50, 0x4B, 0x03, 0x04]]),
    };

    public static string AcceptList => string.Join(",", Allowed.Keys);

    public async Task<UploadInfo> SaveAsync(Guid userId, IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) throw new ArgumentException("Choose a file to upload.");
        var ext = Path.GetExtension(file.FileName);
        if (!Allowed.TryGetValue(ext, out var kind))
            throw new ArgumentException("Only images (PNG, JPG, GIF, WebP), PDF, Word, PowerPoint and Excel files can be uploaded.");
        var isImage = kind.Type.StartsWith("image/");
        var limit = isImage ? MaxImageBytes : MaxDocBytes;
        if (file.Length > limit) throw new ArgumentException($"That file is too big. The limit is {limit / 1024 / 1024} MB for {(isImage ? "images" : "documents")}.");

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();
        if (!kind.Magic.Any(m => bytes.Length >= m.Length && bytes.AsSpan(0, m.Length).SequenceEqual(m)))
            throw new ArgumentException("That file does not look like a real " + ext.TrimStart('.').ToUpperInvariant() + " file.");

        var name = Path.GetFileName(file.FileName);
        if (name.Length > 200) name = name[^200..];
        var upload = new Upload { Id = Guid.NewGuid(), OwnerId = userId, FileName = name, ContentType = kind.Type, Size = bytes.Length, Data = bytes };
        db.Uploads.Add(upload);
        await db.SaveChangesAsync(ct);
        return new UploadInfo(upload.Id, upload.FileName, upload.ContentType, upload.Size);
    }

    public Task<Upload?> GetAsync(Guid id, CancellationToken ct) => db.Uploads.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, ct);
}

