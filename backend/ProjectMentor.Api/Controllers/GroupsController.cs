using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectMentor.Api.Contracts;
using ProjectMentor.Api.Services;
using ProjectMentor.Api.Services.Ai;

namespace ProjectMentor.Api.Controllers;

/// <summary>Private project groups, invitation links, group chat and the weekly sprint board.</summary>
[ApiController]
[Authorize(Roles = "Student")]
[Route("api/groups")]
public sealed class GroupsController(GroupService groups, BoardService board) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GroupSummary>>> List(CancellationToken ct) => Ok(await groups.ListAsync(User.GetUserId(), ct));

    [HttpPost]
    public Task<ActionResult<GroupDetail>> Create(CreateGroupRequest body, CancellationToken ct) =>
        Run<GroupDetail>(async () => await groups.CreateAsync(User.GetUserId(), body, ct));

    [HttpGet("{id:guid}")]
    public Task<ActionResult<GroupDetail>> Get(Guid id, CancellationToken ct) => Run(() => groups.GetAsync(User.GetUserId(), id, ct));

    [HttpPut("{id:guid}")]
    public Task<ActionResult<GroupDetail>> Update(Guid id, UpdateGroupRequest body, CancellationToken ct) =>
        Run(() => groups.UpdateAsync(User.GetUserId(), id, body, ct));

    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, CancellationToken ct) => RunBool(() => groups.DeleteAsync(User.GetUserId(), id, ct));

    [HttpPost("{id:guid}/leave")]
    public Task<IActionResult> Leave(Guid id, CancellationToken ct) => RunBool(() => groups.LeaveAsync(User.GetUserId(), id, ct));

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    public Task<IActionResult> RemoveMember(Guid id, Guid memberId, CancellationToken ct) =>
        RunBool(() => groups.RemoveMemberAsync(User.GetUserId(), id, memberId, ct));

    // ----- invitations -----
    [HttpGet("{id:guid}/invites")]
    public Task<ActionResult<IReadOnlyList<InviteResponse>>> Invites(Guid id, CancellationToken ct) => Run(() => groups.ListInvitesAsync(User.GetUserId(), id, ct));

    [HttpPost("{id:guid}/invites")]
    public Task<ActionResult<InviteResponse>> CreateInvite(Guid id, CreateInviteRequest body, CancellationToken ct) =>
        Run(() => groups.CreateInviteAsync(User.GetUserId(), id, body, ct));

    [HttpDelete("{id:guid}/invites/{inviteId:guid}")]
    public Task<IActionResult> RevokeInvite(Guid id, Guid inviteId, CancellationToken ct) =>
        RunBool(() => groups.RevokeInviteAsync(User.GetUserId(), id, inviteId, ct));

    // Preview + join work for any signed-in user who has the link.
    [HttpGet("join/{token}")]
    public async Task<ActionResult<InvitePreview>> PreviewInvite(string token, CancellationToken ct) => Ok(await groups.PreviewInviteAsync(User.GetUserId(), token, ct));

    [HttpPost("join/{token}")]
    public async Task<IActionResult> Join(string token, CancellationToken ct)
    {
        try
        {
            var groupId = await groups.JoinAsync(User.GetUserId(), token, ct);
            // Tell the group owner someone joined (once; joining twice returns early in JoinAsync).
            var db = HttpContext.RequestServices.GetRequiredService<ProjectMentor.Data.ProjectMentorDbContext>();
            var info = await db.StudyGroups.Where(g => g.Id == groupId).Select(g => new { g.OwnerId, g.Name }).FirstAsync(ct);
            var me = User.GetUserId();
            if (info.OwnerId != me && await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == me && m.JoinedAt > DateTimeOffset.UtcNow.AddMinutes(-1), ct))
            {
                var name = await db.Users.Where(u => u.Id == me).Select(u => u.FullName).FirstAsync(ct);
                await HttpContext.RequestServices.GetRequiredService<AccountService>()
                    .NotifyAsync(info.OwnerId, "GroupJoin", $"{name} joined {info.Name}", null, $"/groups/{groupId}", ct);
            }
            return Ok(new { groupId });
        }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    // ----- chat -----
    [HttpGet("{id:guid}/messages")]
    public Task<ActionResult<IReadOnlyList<MessageResponse>>> Messages(Guid id, [FromQuery] DateTimeOffset? after, CancellationToken ct) =>
        Run(() => groups.MessagesAsync(User.GetUserId(), id, after, ct));

    [HttpPost("{id:guid}/messages")]
    public Task<ActionResult<MessageResponse>> Send(Guid id, SendMessageRequest body, CancellationToken ct) =>
        Run(() => groups.SendAsync(User.GetUserId(), id, body, ct));

    // ----- sprint board -----
    [HttpGet("{id:guid}/board")]
    public Task<ActionResult<BoardResponse>> Board(Guid id, CancellationToken ct) => Run(() => board.GetAsync(User.GetUserId(), id, ct));

    [HttpPost("{id:guid}/board/tasks")]
    public Task<ActionResult<BoardResponse>> CreateTask(Guid id, CreateTaskRequest body, CancellationToken ct) =>
        Run(() => board.CreateAsync(User.GetUserId(), id, body, ct));

    [HttpPatch("{id:guid}/board/tasks/{taskId:guid}")]
    public Task<ActionResult<BoardResponse>> UpdateTask(Guid id, Guid taskId, UpdateTaskRequest body, CancellationToken ct) =>
        Run(() => board.UpdateAsync(User.GetUserId(), id, taskId, body, ct));

    [HttpDelete("{id:guid}/board/tasks/{taskId:guid}")]
    public Task<ActionResult<BoardResponse>> DeleteTask(Guid id, Guid taskId, CancellationToken ct) =>
        Run(() => board.DeleteAsync(User.GetUserId(), id, taskId, ct));

    [HttpPost("{id:guid}/board/generate")]
    public Task<ActionResult<GenerateTasksResponse>> Generate(Guid id, GenerateTasksRequest body, CancellationToken ct) =>
        Run(() => board.GenerateAsync(User.GetUserId(), id, body, ct));

    // ----- error mapping -----
    private async Task<ActionResult<T>> Run<T>(Func<Task<T?>> action) where T : class
    {
        try
        {
            var result = await action();
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (UnauthorizedAccessException ex) { return StatusCode(StatusCodes.Status403Forbidden, ex.Message); }
        catch (InvalidOperationException ex) { return Conflict(ex.Message); }
        catch (AiUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, ex.Message); }
    }

    private async Task<IActionResult> RunBool(Func<Task<bool>> action)
    {
        try { return await action() ? NoContent() : NotFound(); }
        catch (UnauthorizedAccessException ex) { return StatusCode(StatusCodes.Status403Forbidden, ex.Message); }
        catch (InvalidOperationException ex) { return Conflict(ex.Message); }
    }
}
