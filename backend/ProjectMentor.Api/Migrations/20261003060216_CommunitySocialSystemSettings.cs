using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectMentor.Migrations
{
    /// <inheritdoc />
    public partial class CommunitySocialSystemSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "Birthday",
                schema: "public",
                table: "users",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "BirthdayShowYear",
                schema: "public",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CoverUploadId",
                schema: "public",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeactivationReason",
                schema: "public",
                table: "users",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Degree",
                schema: "public",
                table: "users",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GithubUrl",
                schema: "public",
                table: "users",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsOfficial",
                schema: "public",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "LinkedinUrl",
                schema: "public",
                table: "users",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                schema: "public",
                table: "users",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Skills",
                schema: "public",
                table: "users",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "University",
                schema: "public",
                table: "users",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisibilityJson",
                schema: "public",
                table: "users",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'{}'::jsonb");

            migrationBuilder.AddColumn<string>(
                name: "Website",
                schema: "public",
                table: "users",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ActorId",
                schema: "public",
                table: "user_notifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Scope",
                schema: "public",
                table: "user_notifications",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "System");

            migrationBuilder.AddColumn<string>(
                name: "SummaryJson",
                schema: "public",
                table: "roadmaps",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "public",
                table: "roadmap_requests",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Duration",
                schema: "public",
                table: "resources",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFeatured",
                schema: "public",
                table: "resources",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsFree",
                schema: "public",
                table: "resources",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Level",
                schema: "public",
                table: "resources",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Beginner");

            migrationBuilder.AddColumn<string>(
                name: "Price",
                schema: "public",
                table: "resources",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                schema: "public",
                table: "resources",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EditedAt",
                schema: "public",
                table: "posts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SharedPostId",
                schema: "public",
                table: "posts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Visibility",
                schema: "public",
                table: "posts",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Public");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EditedAt",
                schema: "public",
                table: "post_comments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentCommentId",
                schema: "public",
                table: "post_comments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "comment_reactions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CommentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reaction = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comment_reactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_comment_reactions_post_comments_CommentId",
                        column: x => x.CommentId,
                        principalSchema: "public",
                        principalTable: "post_comments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_comment_reactions_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "email_logs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ToEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    ToName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Subject = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Error = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DedupeKey = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    SentById = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_email_logs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "friendships",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RequesterId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddresseeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RespondedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_friendships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_friendships_users_AddresseeId",
                        column: x => x.AddresseeId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_friendships_users_RequesterId",
                        column: x => x.RequesterId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "page_follows",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PageUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_page_follows", x => x.Id);
                    table.ForeignKey(
                        name: "FK_page_follows_users_PageUserId",
                        column: x => x.PageUserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_page_follows_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "password_reset_codes",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CodeHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_password_reset_codes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_password_reset_codes_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "resource_bookmarks",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_resource_bookmarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_resource_bookmarks_resources_ResourceId",
                        column: x => x.ResourceId,
                        principalSchema: "public",
                        principalTable: "resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_resource_bookmarks_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "support_requests",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Message = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Reply = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RepliedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_support_requests_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "system_settings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_system_settings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_posts_SharedPostId",
                schema: "public",
                table: "posts",
                column: "SharedPostId");

            migrationBuilder.CreateIndex(
                name: "IX_post_comments_ParentCommentId",
                schema: "public",
                table: "post_comments",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_comment_reactions_CommentId_UserId",
                schema: "public",
                table: "comment_reactions",
                columns: new[] { "CommentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_comment_reactions_UserId",
                schema: "public",
                table: "comment_reactions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_email_logs_CreatedAt",
                schema: "public",
                table: "email_logs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_email_logs_DedupeKey",
                schema: "public",
                table: "email_logs",
                column: "DedupeKey",
                unique: true,
                filter: "\"DedupeKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_friendships_AddresseeId",
                schema: "public",
                table: "friendships",
                column: "AddresseeId");

            migrationBuilder.CreateIndex(
                name: "IX_friendships_RequesterId_AddresseeId",
                schema: "public",
                table: "friendships",
                columns: new[] { "RequesterId", "AddresseeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_page_follows_PageUserId",
                schema: "public",
                table: "page_follows",
                column: "PageUserId");

            migrationBuilder.CreateIndex(
                name: "IX_page_follows_UserId_PageUserId",
                schema: "public",
                table: "page_follows",
                columns: new[] { "UserId", "PageUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_password_reset_codes_UserId",
                schema: "public",
                table: "password_reset_codes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_resource_bookmarks_ResourceId",
                schema: "public",
                table: "resource_bookmarks",
                column: "ResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_resource_bookmarks_UserId_ResourceId",
                schema: "public",
                table: "resource_bookmarks",
                columns: new[] { "UserId", "ResourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_support_requests_UserId",
                schema: "public",
                table: "support_requests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_system_settings_Key",
                schema: "public",
                table: "system_settings",
                column: "Key",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_post_comments_post_comments_ParentCommentId",
                schema: "public",
                table: "post_comments",
                column: "ParentCommentId",
                principalSchema: "public",
                principalTable: "post_comments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_posts_posts_SharedPostId",
                schema: "public",
                table: "posts",
                column: "SharedPostId",
                principalSchema: "public",
                principalTable: "posts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_post_comments_post_comments_ParentCommentId",
                schema: "public",
                table: "post_comments");

            migrationBuilder.DropForeignKey(
                name: "FK_posts_posts_SharedPostId",
                schema: "public",
                table: "posts");

            migrationBuilder.DropTable(
                name: "comment_reactions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "email_logs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "friendships",
                schema: "public");

            migrationBuilder.DropTable(
                name: "page_follows",
                schema: "public");

            migrationBuilder.DropTable(
                name: "password_reset_codes",
                schema: "public");

            migrationBuilder.DropTable(
                name: "resource_bookmarks",
                schema: "public");

            migrationBuilder.DropTable(
                name: "support_requests",
                schema: "public");

            migrationBuilder.DropTable(
                name: "system_settings",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_posts_SharedPostId",
                schema: "public",
                table: "posts");

            migrationBuilder.DropIndex(
                name: "IX_post_comments_ParentCommentId",
                schema: "public",
                table: "post_comments");

            migrationBuilder.DropColumn(
                name: "Birthday",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "BirthdayShowYear",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CoverUploadId",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "DeactivationReason",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Degree",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "GithubUrl",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "IsOfficial",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "LinkedinUrl",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Location",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Skills",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "University",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "VisibilityJson",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Website",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ActorId",
                schema: "public",
                table: "user_notifications");

            migrationBuilder.DropColumn(
                name: "Scope",
                schema: "public",
                table: "user_notifications");

            migrationBuilder.DropColumn(
                name: "SummaryJson",
                schema: "public",
                table: "roadmaps");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "public",
                table: "roadmap_requests");

            migrationBuilder.DropColumn(
                name: "Duration",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "IsFeatured",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "IsFree",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "Level",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "Price",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "Provider",
                schema: "public",
                table: "resources");

            migrationBuilder.DropColumn(
                name: "EditedAt",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "SharedPostId",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "Visibility",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "EditedAt",
                schema: "public",
                table: "post_comments");

            migrationBuilder.DropColumn(
                name: "ParentCommentId",
                schema: "public",
                table: "post_comments");
        }
    }
}
