const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Server backup management.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("create").setDescription("Creates a manual backup immediately."))
    .addSubcommand((sub) => sub.setName("list").setDescription("Lists available backups.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "You are not authorized to manage backups.")],
        ephemeral: true
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      await interaction.deferReply({ ephemeral: true });
      const backup = await backupService.createBackup(interaction.guild, { manual: true });
      if (!backup) {
        await interaction.editReply({
          embeds: [dangerEmbed("Could not create backup", "Emergency or rollback in progress.")]
        });
        return;
      }
      await interaction.editReply({ embeds: [successEmbed("📦 Manual backup created", `ID: \`${backup._id}\``)] });
      return;
    }

    const backups = await backupService.listBackups(interaction.guild.id);
    if (!backups.length) {
      await interaction.reply({ embeds: [neutralEmbed("No backups available", null)], ephemeral: true });
      return;
    }
    const list = backups
      .map((b) => `\`${b._id}\` — ${new Date(b.createdAt).toLocaleString("en-US")} ${b.manual ? "(manual)" : ""}`)
      .join("\n");
    await interaction.reply({ embeds: [neutralEmbed("📦 Available backups", list)], ephemeral: true });
  }
};
