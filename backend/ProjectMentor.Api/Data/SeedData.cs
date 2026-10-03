using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ProjectMentor.Data;

public static class SeedData
{
    private static readonly Guid AdminId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static async Task InitializeAsync(ProjectMentorDbContext db, IConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var admin = await db.Users.SingleOrDefaultAsync(x => x.Email == "admin@projectmentor.local", cancellationToken);
        if (admin is null)
        {
            var passwordHash = configuration["ADMIN_PASSWORD_HASH"] ?? Environment.GetEnvironmentVariable("ADMIN_PASSWORD_HASH");
            if (string.IsNullOrWhiteSpace(passwordHash))
                throw new InvalidOperationException("ADMIN_PASSWORD_HASH must be configured before seeding the admin user.");

            admin = new User
            {
                Id = AdminId, Email = "admin@projectmentor.local", PasswordHash = passwordHash,
                FullName = "System Administrator", Role = UserRole.Admin, IsActive = true,
                CreatedAt = now, UpdatedAt = now
            };
            db.Users.Add(admin);
        }

        if (!await db.Questions.AnyAsync(cancellationToken))
            db.Questions.AddRange(CreateQuestions(now));
        if (!await db.Resources.AnyAsync(cancellationToken))
            db.Resources.AddRange(CreateResources(now));
        if (!await db.GuidanceTemplates.AnyAsync(cancellationToken))
            db.GuidanceTemplates.AddRange(CreateTemplates(now));
        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(cancellationToken);
    }

    private static List<Question> CreateQuestions(DateTimeOffset now)
    {
        var projectTypeId = Guid.Parse("20000000-0000-0000-0000-000000000003");
        var questions = new List<Question>
        {
            Question("20000000-0000-0000-0000-000000000001", "year_of_study", "What is your current year of study?", QuestionAnswerType.Number, 1, now, true),
            Question("20000000-0000-0000-0000-000000000002", "has_title", "Do you already have a project title?", QuestionAnswerType.Choice, 2, now, true, "[{\"value\":true,\"label\":\"Yes\"},{\"value\":false,\"label\":\"No\"}]"),
            Question(projectTypeId.ToString(), "project_type", "What type of project are you planning?", QuestionAnswerType.Choice, 3, now, true, "[{\"value\":\"web\",\"label\":\"Web application\"},{\"value\":\"mobile\",\"label\":\"Mobile application\"},{\"value\":\"data\",\"label\":\"Data or AI project\"}]"),
            Question("20000000-0000-0000-0000-000000000004", "deadline", "When is the project due?", QuestionAnswerType.Date, 4, now, true),
            Question("20000000-0000-0000-0000-000000000005", "hours_per_week", "How many hours per week can you dedicate?", QuestionAnswerType.Number, 5, now, true),
            Question("20000000-0000-0000-0000-000000000006", "team_size", "How many people are on your team?", QuestionAnswerType.Number, 6, now, true),
            Question("20000000-0000-0000-0000-000000000007", "technologies_known", "Which technologies do you already know?", QuestionAnswerType.MultiSelect, 7, now, false, "[{\"value\":\"csharp\",\"label\":\"C#\"},{\"value\":\"javascript\",\"label\":\"JavaScript\"},{\"value\":\"python\",\"label\":\"Python\"},{\"value\":\"sql\",\"label\":\"SQL\"}]"),
            Question("20000000-0000-0000-0000-000000000008", "least_confident", "Which areas are you least confident in?", QuestionAnswerType.MultiSelect, 8, now, false, "[{\"value\":\"planning\",\"label\":\"Planning\"},{\"value\":\"coding\",\"label\":\"Coding\"},{\"value\":\"testing\",\"label\":\"Testing\"},{\"value\":\"presentation\",\"label\":\"Presentation\"}]"),
            Question("20000000-0000-0000-0000-000000000009", "project_title", "What is your working project title?", QuestionAnswerType.ShortText, 9, now, false, dependsOnQuestionId: Guid.Parse("20000000-0000-0000-0000-000000000002"), dependsOnValue: "true"),
            Question("20000000-0000-0000-0000-000000000010", "deployment_target", "Where do you plan to deploy the project?", QuestionAnswerType.Choice, 10, now, false, "[{\"value\":\"cloud\",\"label\":\"Cloud hosting\"},{\"value\":\"campus\",\"label\":\"University infrastructure\"},{\"value\":\"none\",\"label\":\"Not decided\"}]", projectTypeId, "web"),
            Question("20000000-0000-0000-0000-000000000011", "mobile_platform", "Which mobile platform is your priority?", QuestionAnswerType.Choice, 11, now, false, "[{\"value\":\"android\",\"label\":\"Android\"},{\"value\":\"ios\",\"label\":\"iOS\"},{\"value\":\"both\",\"label\":\"Both\"}]", projectTypeId, "mobile")
        };
        return questions;
    }

    private static Question Question(string id, string code, string prompt, QuestionAnswerType type, int order, DateTimeOffset now, bool core, string? options = null, Guid? dependsOnQuestionId = null, string? dependsOnValue = null) => new()
    {
        Id = Guid.Parse(id), Code = code, PromptText = prompt, AnswerType = type, DisplayOrder = order, IsCore = core,
        Options = options is null ? null : JsonDocument.Parse(options), DependsOnQuestionId = dependsOnQuestionId,
        DependsOnValue = dependsOnValue, IsActive = true, CreatedAt = now, UpdatedAt = now
    };

    private static List<Resource> CreateResources(DateTimeOffset now)
    {
        var values = new[]
        {
            ("ER Diagrams Explained", "https://www.lucidchart.com/pages/er-diagrams", ResourceType.Article, "ER diagrams"),
            ("Database Design Course", "https://www.khanacademy.org/computing/computer-programming/sql", ResourceType.Course, "ER diagrams"),
            ("Git Handbook", "https://guides.github.com/introduction/git-handbook/", ResourceType.Documentation, "Git basics"),
            ("Git Branching Tutorial", "https://learngitbranching.js.org/", ResourceType.Course, "Git basics"),
            ("REST API Design Guide", "https://learn.microsoft.com/aspnet/core/web-api/", ResourceType.Documentation, "REST APIs"),
            ("HTTP Crash Course", "https://developer.mozilla.org/en-US/docs/Web/HTTP", ResourceType.Article, "REST APIs"),
            ("React State Management", "https://react.dev/learn/managing-state", ResourceType.Documentation, "React state"),
            ("Thinking in React", "https://react.dev/learn/thinking-in-react", ResourceType.Article, "React state"),
            ("Testing ASP.NET Core APIs", "https://learn.microsoft.com/aspnet/core/test/integration-tests", ResourceType.Documentation, "Testing"),
            ("Docker Get Started", "https://docs.docker.com/get-started/", ResourceType.Course, "Deployment"),
            ("Azure App Service Overview", "https://learn.microsoft.com/azure/app-service/overview", ResourceType.Documentation, "Deployment")
        };
        return values.Select(value => new Resource
        {
            Id = Guid.NewGuid(), Title = value.Item1, Url = value.Item2, ResourceType = value.Item3, Topic = value.Item4,
            AddedById = AdminId, CreatedAt = now, UpdatedAt = now
        }).ToList();
    }

    private static List<GuidanceTemplate> CreateTemplates(DateTimeOffset now) =>
    [
        Template("30000000-0000-0000-0000-000000000001", GuidanceTemplateType.ReportOutline, "Project Report Outline", "{\"sections\":[\"Introduction\",\"Related Work\",\"Design and Implementation\",\"Evaluation\",\"Conclusion\"]}", now),
        Template("30000000-0000-0000-0000-000000000002", GuidanceTemplateType.PresentationSkeleton, "Project Presentation Skeleton", "{\"slides\":[\"Problem and users\",\"Goals and requirements\",\"Solution architecture\",\"Demonstration\",\"Evaluation\",\"Lessons learned\",\"Next steps\"]}", now),
        Template("30000000-0000-0000-0000-000000000003", GuidanceTemplateType.DeploymentChecklist, "Deployment Readiness Checklist", "{\"checks\":[\"Configuration is externalized\",\"Secrets use a secret manager\",\"Migrations are tested\",\"Health checks are available\",\"Rollback is documented\"]}", now)
    ];

    private static GuidanceTemplate Template(string id, GuidanceTemplateType type, string name, string content, DateTimeOffset now) => new()
    {
        Id = Guid.Parse(id), TemplateType = type, Name = name, ApplicableProjectTypes = ["web", "mobile", "data"],
        Content = JsonDocument.Parse(content), CreatedAt = now, UpdatedAt = now
    };
}
