using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;

namespace ProjectMentor.Api.Controllers;

/// <summary>
/// Public Learn content shared by the website and the mobile app. Everything here is managed
/// from the admin panel (<see cref="AdminController"/>), so no client ships its own copy.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/content")]
public sealed class ContentController(ContentService content) : ControllerBase
{
    /// <summary>Videos, tracks with published lessons, templates and example files.</summary>
    [HttpGet("learn")]
    public async Task<ActionResult<LearnContentResponse>> Learn(CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(await content.LearnAsync(ct));
    }

    /// <summary>Home page sections: feature cards, journey steps, AI agents and FAQ.</summary>
    [HttpGet("site")]
    public async Task<ActionResult<SiteContentResponse>> Site(CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(await content.SiteAsync(ct));
    }

    /// <summary>Download one published template or example file. Downloads need an account (lessons stay public).</summary>
    [HttpGet("files/{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var file = await content.FileAsync(id, includeUnpublished: false, ct);
        if (file is null) return NotFound();
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Cache-Control"] = "no-cache";
        return File(file.Data, file.ContentType, file.FileName);
    }

    /// <summary>All published templates in one ZIP, built on the fly so it always matches the library.</summary>
    [HttpGet("templates.zip")]
    [Authorize]
    public async Task<IActionResult> TemplatesZip(CancellationToken ct) =>
        File(await content.TemplatesZipAsync(ct), "application/zip", "projectmentor-templates.zip");
}
