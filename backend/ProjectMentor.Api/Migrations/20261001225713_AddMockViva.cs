using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectMentor.Migrations
{
    /// <inheritdoc />
    public partial class AddMockViva : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "viva_sessions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoadmapRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Stage = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Difficulty = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Greeting = table.Column<string>(type: "text", nullable: true),
                    Details = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    Summary = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ScorePercent = table.Column<int>(type: "integer", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_viva_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_viva_sessions_roadmap_requests_RoadmapRequestId",
                        column: x => x.RoadmapRequestId,
                        principalSchema: "public",
                        principalTable: "roadmap_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_viva_sessions_users_StudentId",
                        column: x => x.StudentId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "viva_questions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    VivaSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    Topic = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false),
                    LookingFor = table.Column<string>(type: "text", nullable: true),
                    IsFollowUp = table.Column<bool>(type: "boolean", nullable: false),
                    Answer = table.Column<string>(type: "text", nullable: true),
                    Score = table.Column<int>(type: "integer", nullable: true),
                    Verdict = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Reaction = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Feedback = table.Column<string>(type: "text", nullable: true),
                    Strengths = table.Column<string[]>(type: "text[]", nullable: false),
                    Improvements = table.Column<string[]>(type: "text[]", nullable: false),
                    ModelAnswer = table.Column<string>(type: "text", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    AnsweredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_viva_questions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_viva_questions_viva_sessions_VivaSessionId",
                        column: x => x.VivaSessionId,
                        principalSchema: "public",
                        principalTable: "viva_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_viva_questions_VivaSessionId_Sequence",
                schema: "public",
                table: "viva_questions",
                columns: new[] { "VivaSessionId", "Sequence" });

            migrationBuilder.CreateIndex(
                name: "IX_viva_sessions_RoadmapRequestId",
                schema: "public",
                table: "viva_sessions",
                column: "RoadmapRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_viva_sessions_StudentId_CreatedAt",
                schema: "public",
                table: "viva_sessions",
                columns: new[] { "StudentId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "viva_questions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "viva_sessions",
                schema: "public");
        }
    }
}
