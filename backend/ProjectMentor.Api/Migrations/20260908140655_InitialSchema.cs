using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectMentor.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:agent_name", "planner,resource_agent,analysis_agent,validation_agent")
                .Annotation("Npgsql:Enum:agent_step_status", "pending,running,success,failed")
                .Annotation("Npgsql:Enum:approval_decision_type", "accepted,revision_requested")
                .Annotation("Npgsql:Enum:guidance_template_type", "report_outline,presentation_skeleton,deployment_checklist")
                .Annotation("Npgsql:Enum:milestone_phase", "title,design,build,documentation,presentation,deployment")
                .Annotation("Npgsql:Enum:milestone_status", "not_started,in_progress,blocked,done")
                .Annotation("Npgsql:Enum:notification_type", "milestone_reminder,plan_ready,overdue")
                .Annotation("Npgsql:Enum:question_answer_type", "choice,multi_select,short_text,number,date")
                .Annotation("Npgsql:Enum:resource_type", "video,article,documentation,course")
                .Annotation("Npgsql:Enum:roadmap_request_status", "submitted,planning,pending_approval,accepted,revision_requested,failed")
                .Annotation("Npgsql:Enum:roadmap_status", "draft,pending_approval,accepted,superseded,rejected")
                .Annotation("Npgsql:Enum:user_role", "student,admin")
                .Annotation("Npgsql:Enum:workflow_run_status", "running,paused_for_approval,completed,failed")
                .Annotation("Npgsql:PostgresExtension:pgcrypto", ",,");

            migrationBuilder.CreateTable(
                name: "guidance_templates",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TemplateType = table.Column<int>(type: "guidance_template_type", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    ApplicableProjectTypes = table.Column<string[]>(type: "text[]", nullable: false),
                    Content = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_guidance_templates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "questions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PromptText = table.Column<string>(type: "text", nullable: false),
                    AnswerType = table.Column<int>(type: "question_answer_type", nullable: false),
                    Options = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    IsCore = table.Column<bool>(type: "boolean", nullable: false),
                    DependsOnQuestionId = table.Column<Guid>(type: "uuid", nullable: true),
                    DependsOnValue = table.Column<string>(type: "text", nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_questions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_questions_questions_DependsOnQuestionId",
                        column: x => x.DependsOnQuestionId,
                        principalSchema: "public",
                        principalTable: "questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    FullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<int>(type: "user_role", nullable: false),
                    YearOfStudy = table.Column<short>(type: "smallint", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "resources",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: false),
                    ResourceType = table.Column<int>(type: "resource_type", nullable: false),
                    Topic = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    AddedById = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_resources", x => x.Id);
                    table.ForeignKey(
                        name: "FK_resources_users_AddedById",
                        column: x => x.AddedById,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "roadmap_requests",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "roadmap_request_status", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roadmap_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_roadmap_requests_users_StudentId",
                        column: x => x.StudentId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "resource_tags",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_resource_tags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_resource_tags_resources_ResourceId",
                        column: x => x.ResourceId,
                        principalSchema: "public",
                        principalTable: "resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_resource_tags_tags_TagId",
                        column: x => x.TagId,
                        principalSchema: "public",
                        principalTable: "tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "agent_workflow_runs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RoadmapRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    Objective = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "workflow_run_status", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_workflow_runs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_agent_workflow_runs_roadmap_requests_RoadmapRequestId",
                        column: x => x.RoadmapRequestId,
                        principalSchema: "public",
                        principalTable: "roadmap_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "question_answers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RoadmapRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnswerValue = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_question_answers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_question_answers_questions_QuestionId",
                        column: x => x.QuestionId,
                        principalSchema: "public",
                        principalTable: "questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_question_answers_roadmap_requests_RoadmapRequestId",
                        column: x => x.RoadmapRequestId,
                        principalSchema: "public",
                        principalTable: "roadmap_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "roadmaps",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RoadmapRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "roadmap_status", nullable: false),
                    GeneratedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roadmaps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_roadmaps_roadmap_requests_RoadmapRequestId",
                        column: x => x.RoadmapRequestId,
                        principalSchema: "public",
                        principalTable: "roadmap_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_roadmaps_users_StudentId",
                        column: x => x.StudentId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "agent_steps",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    WorkflowRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentName = table.Column<int>(type: "agent_name", nullable: false),
                    StepOrder = table.Column<int>(type: "integer", nullable: false),
                    InputPayload = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    OutputPayload = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Status = table.Column<int>(type: "agent_step_status", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_steps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_agent_steps_agent_workflow_runs_WorkflowRunId",
                        column: x => x.WorkflowRunId,
                        principalSchema: "public",
                        principalTable: "agent_workflow_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "approval_decisions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    WorkflowRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Decision = table.Column<int>(type: "approval_decision_type", nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    DecidedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_approval_decisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_approval_decisions_agent_workflow_runs_WorkflowRunId",
                        column: x => x.WorkflowRunId,
                        principalSchema: "public",
                        principalTable: "agent_workflow_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_approval_decisions_users_StudentId",
                        column: x => x.StudentId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "validation_results",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    WorkflowRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleName = table.Column<string>(type: "text", nullable: false),
                    Passed = table.Column<bool>(type: "boolean", nullable: false),
                    Details = table.Column<string>(type: "text", nullable: true),
                    CheckedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_validation_results", x => x.Id);
                    table.ForeignKey(
                        name: "FK_validation_results_agent_workflow_runs_WorkflowRunId",
                        column: x => x.WorkflowRunId,
                        principalSchema: "public",
                        principalTable: "agent_workflow_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "milestones",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RoadmapId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Phase = table.Column<int>(type: "milestone_phase", nullable: false),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "milestone_status", nullable: false),
                    EstimatedHours = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_milestones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_milestones_roadmaps_RoadmapId",
                        column: x => x.RoadmapId,
                        principalSchema: "public",
                        principalTable: "roadmaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "tool_calls",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    AgentStepId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToolName = table.Column<string>(type: "text", nullable: false),
                    InputParams = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    OutputResult = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Success = table.Column<bool>(type: "boolean", nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    DurationMs = table.Column<int>(type: "integer", nullable: true),
                    CalledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tool_calls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tool_calls_agent_steps_AgentStepId",
                        column: x => x.AgentStepId,
                        principalSchema: "public",
                        principalTable: "agent_steps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "milestone_resources",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    MilestoneId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttachedBy = table.Column<int>(type: "agent_name", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_milestone_resources", x => x.Id);
                    table.ForeignKey(
                        name: "FK_milestone_resources_milestones_MilestoneId",
                        column: x => x.MilestoneId,
                        principalSchema: "public",
                        principalTable: "milestones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_milestone_resources_resources_ResourceId",
                        column: x => x.ResourceId,
                        principalSchema: "public",
                        principalTable: "resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "milestone_status_history",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    MilestoneId = table.Column<Guid>(type: "uuid", nullable: false),
                    OldStatus = table.Column<int>(type: "milestone_status", nullable: true),
                    NewStatus = table.Column<int>(type: "milestone_status", nullable: false),
                    ChangedById = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_milestone_status_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_milestone_status_history_milestones_MilestoneId",
                        column: x => x.MilestoneId,
                        principalSchema: "public",
                        principalTable: "milestones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_milestone_status_history_users_ChangedById",
                        column: x => x.ChangedById,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationType = table.Column<int>(type: "notification_type", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    RelatedMilestoneId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_notifications_milestones_RelatedMilestoneId",
                        column: x => x.RelatedMilestoneId,
                        principalSchema: "public",
                        principalTable: "milestones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_notifications_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_agent_steps_WorkflowRunId_StepOrder",
                schema: "public",
                table: "agent_steps",
                columns: new[] { "WorkflowRunId", "StepOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_agent_workflow_runs_RoadmapRequestId",
                schema: "public",
                table: "agent_workflow_runs",
                column: "RoadmapRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_agent_workflow_runs_Status",
                schema: "public",
                table: "agent_workflow_runs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_approval_decisions_StudentId",
                schema: "public",
                table: "approval_decisions",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_approval_decisions_WorkflowRunId",
                schema: "public",
                table: "approval_decisions",
                column: "WorkflowRunId");

            migrationBuilder.CreateIndex(
                name: "IX_milestone_resources_MilestoneId_ResourceId",
                schema: "public",
                table: "milestone_resources",
                columns: new[] { "MilestoneId", "ResourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_milestone_resources_ResourceId",
                schema: "public",
                table: "milestone_resources",
                column: "ResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_milestone_status_history_ChangedById",
                schema: "public",
                table: "milestone_status_history",
                column: "ChangedById");

            migrationBuilder.CreateIndex(
                name: "IX_milestone_status_history_MilestoneId",
                schema: "public",
                table: "milestone_status_history",
                column: "MilestoneId");

            migrationBuilder.CreateIndex(
                name: "IX_milestones_DueDate",
                schema: "public",
                table: "milestones",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_milestones_RoadmapId_Status",
                schema: "public",
                table: "milestones",
                columns: new[] { "RoadmapId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_RelatedMilestoneId",
                schema: "public",
                table: "notifications",
                column: "RelatedMilestoneId");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_UserId_IsRead",
                schema: "public",
                table: "notifications",
                columns: new[] { "UserId", "IsRead" });

            migrationBuilder.CreateIndex(
                name: "IX_question_answers_QuestionId",
                schema: "public",
                table: "question_answers",
                column: "QuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_question_answers_RoadmapRequestId",
                schema: "public",
                table: "question_answers",
                column: "RoadmapRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_question_answers_RoadmapRequestId_QuestionId",
                schema: "public",
                table: "question_answers",
                columns: new[] { "RoadmapRequestId", "QuestionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_questions_Code",
                schema: "public",
                table: "questions",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_questions_DependsOnQuestionId",
                schema: "public",
                table: "questions",
                column: "DependsOnQuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_resource_tags_ResourceId_TagId",
                schema: "public",
                table: "resource_tags",
                columns: new[] { "ResourceId", "TagId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_resource_tags_TagId",
                schema: "public",
                table: "resource_tags",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_resources_AddedById",
                schema: "public",
                table: "resources",
                column: "AddedById");

            migrationBuilder.CreateIndex(
                name: "IX_roadmap_requests_StudentId_Status",
                schema: "public",
                table: "roadmap_requests",
                columns: new[] { "StudentId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_roadmaps_RoadmapRequestId",
                schema: "public",
                table: "roadmaps",
                column: "RoadmapRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_roadmaps_StudentId",
                schema: "public",
                table: "roadmaps",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_tags_Name",
                schema: "public",
                table: "tags",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tool_calls_AgentStepId",
                schema: "public",
                table: "tool_calls",
                column: "AgentStepId");

            migrationBuilder.CreateIndex(
                name: "ix_users_email_lower",
                schema: "public",
                table: "users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_validation_results_WorkflowRunId",
                schema: "public",
                table: "validation_results",
                column: "WorkflowRunId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "approval_decisions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "guidance_templates",
                schema: "public");

            migrationBuilder.DropTable(
                name: "milestone_resources",
                schema: "public");

            migrationBuilder.DropTable(
                name: "milestone_status_history",
                schema: "public");

            migrationBuilder.DropTable(
                name: "notifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "question_answers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "resource_tags",
                schema: "public");

            migrationBuilder.DropTable(
                name: "tool_calls",
                schema: "public");

            migrationBuilder.DropTable(
                name: "validation_results",
                schema: "public");

            migrationBuilder.DropTable(
                name: "milestones",
                schema: "public");

            migrationBuilder.DropTable(
                name: "questions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "resources",
                schema: "public");

            migrationBuilder.DropTable(
                name: "tags",
                schema: "public");

            migrationBuilder.DropTable(
                name: "agent_steps",
                schema: "public");

            migrationBuilder.DropTable(
                name: "roadmaps",
                schema: "public");

            migrationBuilder.DropTable(
                name: "agent_workflow_runs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "roadmap_requests",
                schema: "public");

            migrationBuilder.DropTable(
                name: "users",
                schema: "public");
        }
    }
}
