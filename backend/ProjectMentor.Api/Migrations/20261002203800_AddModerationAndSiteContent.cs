using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectMentor.Migrations
{
    /// <inheritdoc />
    public partial class AddModerationAndSiteContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ModeratedAt",
                schema: "public",
                table: "posts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModerationNote",
                schema: "public",
                table: "posts",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "public",
                table: "posts",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Approved");

            migrationBuilder.CreateTable(
                name: "site_entries",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Section = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Image = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    LinkUrl = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    LinkLabel = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_site_entries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_posts_Status_CreatedAt",
                schema: "public",
                table: "posts",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_site_entries_Section_SortOrder",
                schema: "public",
                table: "site_entries",
                columns: new[] { "Section", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "site_entries",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_posts_Status_CreatedAt",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "ModeratedAt",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "ModerationNote",
                schema: "public",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "public",
                table: "posts");
        }
    }
}
