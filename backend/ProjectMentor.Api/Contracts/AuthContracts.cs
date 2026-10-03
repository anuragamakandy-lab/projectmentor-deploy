namespace ProjectMentor.Api.Contracts;

public sealed record RegisterRequest(string Email, string Password, string FullName, short? YearOfStudy);
public sealed record LoginRequest(string Email, string Password);
public sealed record AuthResponse(Guid UserId, string Email, string FullName, string Role, string Token);
public sealed record CurrentUserResponse(Guid UserId, string Email, string FullName, string Role);
public sealed record ForgotPasswordRequest(string? Email);
public sealed record ResetPasswordRequest(string? Email, string? Code, string? Password);
public sealed record SupportMessageRequest(string? Name, string? Email, string? Subject, string? Message);
