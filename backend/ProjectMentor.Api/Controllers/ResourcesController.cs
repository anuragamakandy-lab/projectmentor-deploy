using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;

namespace ProjectMentor.Api.Controllers;

/// <summary>
/// Component B — Resource Hub. Any authenticated user (Student or Admin, React or Flutter) can
/// browse the catalog; only Admins can create, update or delete resources.
/// </summary>
[ApiController]
[Authorize]
[Route("api/resources")]
public sealed class ResourcesController(ResourceCatalogService catalog) : ControllerBase
{
    /// <summary>Search, filter, sort and paginate the resource catalog.</summary>
    // Logged-out visitors can browse the whole library; bookmarks and roadmap links need a login.
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResponse<ResourceItemResponse>>> Search([FromQuery] ResourceQuery query, CancellationToken cancellationToken)
        => Ok(await catalog.SearchAsync(query, cancellationToken, User.Identity?.IsAuthenticated == true ? User.GetUserId() : default));

    [HttpPost("{id:guid}/bookmark")]
    public async Task<IActionResult> Bookmark(Guid id, CancellationToken cancellationToken) =>
        await catalog.ToggleBookmarkAsync(User.GetUserId(), id, cancellationToken) is { } on ? Ok(new { bookmarked = on }) : NotFound();

    /// <summary>Distinct topics, types and tags for building filter controls.</summary>
    [HttpGet("facets")]
    [AllowAnonymous]
    public async Task<ActionResult<ResourceFacetsResponse>> Facets(CancellationToken cancellationToken)
        => Ok(await catalog.GetFacetsAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<ResourceItemResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var resource = await catalog.GetAsync(id, cancellationToken);
        return resource is null ? NotFound() : Ok(resource);
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ResourceItemResponse>> Create(CreateResourceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var created = await catalog.CreateAsync(User.GetUserId(), request, cancellationToken);
            return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ResourceItemResponse>> Update(Guid id, UpdateResourceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var updated = await catalog.UpdateAsync(id, request, cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return await catalog.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }
}
