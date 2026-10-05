using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using ProjectMentor.Api.Services;
using ProjectMentor.Data;

var builder = WebApplication.CreateBuilder(args);

// Per-developer overrides (connection string, ADMIN_PASSWORD_HASH). Git-ignored.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// QuestPDF free Community licence (required before generating any PDF).
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var jwtSecret = builder.Configuration["JWT_SECRET"]
    ?? Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? "ProjectMentor-development-secret-change-before-production-1234567890";

var dataSourceBuilder = new NpgsqlDataSourceBuilder(builder.Configuration.GetConnectionString("DefaultConnection"));
dataSourceBuilder.MapEnum<UserRole>("user_role");
dataSourceBuilder.MapEnum<QuestionAnswerType>("question_answer_type");
dataSourceBuilder.MapEnum<RoadmapRequestStatus>("roadmap_request_status");
dataSourceBuilder.MapEnum<RoadmapStatus>("roadmap_status");
dataSourceBuilder.MapEnum<MilestonePhase>("milestone_phase");
dataSourceBuilder.MapEnum<MilestoneStatus>("milestone_status");
dataSourceBuilder.MapEnum<ResourceType>("resource_type");
dataSourceBuilder.MapEnum<AgentName>("agent_name");
dataSourceBuilder.MapEnum<WorkflowRunStatus>("workflow_run_status");
dataSourceBuilder.MapEnum<AgentStepStatus>("agent_step_status");
dataSourceBuilder.MapEnum<ApprovalDecisionType>("approval_decision_type");
dataSourceBuilder.MapEnum<NotificationType>("notification_type");
dataSourceBuilder.MapEnum<GuidanceTemplateType>("guidance_template_type");
var dataSource = dataSourceBuilder.Build();

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddDbContext<ProjectMentorDbContext>(options =>
    options.UseNpgsql(dataSource));
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<WorkflowService>();
builder.Services.AddScoped<ResourceCatalogService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ChatService>();
builder.Services.AddScoped<ProjectInsightService>();
builder.Services.AddScoped<VivaService>();
builder.Services.AddScoped<VivaAgent>();
builder.Services.AddScoped<GroupService>();
builder.Services.AddScoped<BoardService>();
builder.Services.AddScoped<SprintPlannerAgent>();
builder.Services.AddScoped<UploadService>();
builder.Services.AddScoped<CommunityService>();
builder.Services.AddScoped<ContentService>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddHostedService<ReminderService>();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddDataProtection();
builder.Services.AddHttpClient<ProjectMentor.Api.Services.Ai.LlmClient>();
builder.Services.AddScoped<IdeaAgent>();
builder.Services.AddScoped<PlannerAgent>();
builder.Services.AddScoped<ResourceAgent>();
builder.Services.AddScoped<AnalysisAgent>();
builder.Services.AddScoped<ValidationAgent>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        // A token stops working as soon as an admin deactivates the account or changes its role.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var id = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                var role = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
                var db = context.HttpContext.RequestServices.GetRequiredService<ProjectMentorDbContext>();
                var user = Guid.TryParse(id, out var userId)
                    ? await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => new { u.IsActive, u.Role, u.LastActiveAt }).FirstOrDefaultAsync()
                    : null;
                if (user is null || !user.IsActive || user.Role.ToString() != role)
                {
                    context.Fail("This account is no longer active.");
                    return;
                }
                // "Last active" for the admin panel, written at most every 5 minutes per user.
                if (user.LastActiveAt is null || user.LastActiveAt < DateTimeOffset.UtcNow.AddMinutes(-5))
                    await db.Users.Where(u => u.Id == userId).ExecuteUpdateAsync(s => s.SetProperty(u => u.LastActiveAt, DateTimeOffset.UtcNow));
            }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddPolicy("web", policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition")));
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<ProjectMentorDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitializeAsync(db, app.Configuration);
    await ContentService.SeedAsync(db, Path.Combine(AppContext.BaseDirectory, "Data", "Seed"));
    await VivaService.SeedCharactersAsync(db);
    await SystemSeed.RunAsync(db, Path.Combine(AppContext.BaseDirectory, "Data", "Seed"));
    await scope.ServiceProvider.GetRequiredService<SettingsService>().ImportFromConfigAsync(default);
}

// Configure the HTTP request pipeline.
// Swagger/OpenAPI is enabled in every environment so evaluators can reach /swagger on the deployed API.
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Friendly root so the base URL is not a bare 404.
app.MapGet("/", () => Results.Json(new
{
    name = "ProjectMentor API",
    status = "running",
    docs = "/swagger",
    health = "/health",
}));

// Liveness/readiness probe for the deployment platform and evaluators (also checks the database).
app.MapGet("/health", async (ProjectMentorDbContext db) =>
{
    bool dbOk;
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch { dbOk = false; }
    return Results.Json(new
    {
        status = dbOk ? "healthy" : "degraded",
        database = dbOk ? "connected" : "unreachable",
        time = DateTimeOffset.UtcNow,
    }, statusCode: dbOk ? 200 : 503);
});

app.Run();
