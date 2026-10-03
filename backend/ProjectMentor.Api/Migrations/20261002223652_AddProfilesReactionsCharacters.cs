using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectMentor.Migrations
{
    /// <inheritdoc />
    public partial class AddProfilesReactionsCharacters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CharacterId",
                schema: "public",
                table: "viva_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Language",
                schema: "public",
                table: "viva_sessions",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "en-GB");

            migrationBuilder.AddColumn<Guid>(
                name: "AvatarUploadId",
                schema: "public",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Badge",
                schema: "public",
                table: "users",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Bio",
                schema: "public",
                table: "users",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GoogleSubject",
                schema: "public",
                table: "users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastActiveAt",
                schema: "public",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                schema: "public",
                table: "post_likes",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Like");

            migrationBuilder.CreateTable(
                name: "user_notifications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Link = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_user_notifications_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "viva_characters",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Tagline = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    Preset = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Gender = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    SkinTone = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    HairColor = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    HairStyle = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    OutfitColor = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    AccentColor = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    Glasses = table.Column<bool>(type: "boolean", nullable: false),
                    FacialHair = table.Column<bool>(type: "boolean", nullable: false),
                    Language = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Rate = table.Column<double>(type: "double precision", nullable: false),
                    Pitch = table.Column<double>(type: "double precision", nullable: false),
                    Style = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_viva_characters", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_viva_sessions_CharacterId",
                schema: "public",
                table: "viva_sessions",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_users_GoogleSubject",
                schema: "public",
                table: "users",
                column: "GoogleSubject",
                unique: true,
                filter: "\"GoogleSubject\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_user_notifications_UserId_CreatedAt",
                schema: "public",
                table: "user_notifications",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_viva_sessions_viva_characters_CharacterId",
                schema: "public",
                table: "viva_sessions",
                column: "CharacterId",
                principalSchema: "public",
                principalTable: "viva_characters",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_viva_sessions_viva_characters_CharacterId",
                schema: "public",
                table: "viva_sessions");

            migrationBuilder.DropTable(
                name: "user_notifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "viva_characters",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_viva_sessions_CharacterId",
                schema: "public",
                table: "viva_sessions");

            migrationBuilder.DropIndex(
                name: "IX_users_GoogleSubject",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CharacterId",
                schema: "public",
                table: "viva_sessions");

            migrationBuilder.DropColumn(
                name: "Language",
                schema: "public",
                table: "viva_sessions");

            migrationBuilder.DropColumn(
                name: "AvatarUploadId",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Badge",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Bio",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "GoogleSubject",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "LastActiveAt",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Reaction",
                schema: "public",
                table: "post_likes");
        }
    }
}
