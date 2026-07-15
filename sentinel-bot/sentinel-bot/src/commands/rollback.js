const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const rollbackService = require("../services/rollbackService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rollback")
    .setDescription("Lists and restores server backups.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("list").setDescription("Lists available backups."))
    .addSubcommand((sub) =>
      sub
        .setName("restore")
        .setDescription("Restores a specific backup.")
        .addStringOption((opt) => opt.setName("backup_id").setDescription("ID of the backup to restore").setRequired(true))
    ),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "Only the Owner or Co-Owner can manage rollbacks.")],
        ephemeral: true
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const backups = await backupService.listBackups(interaction.guild.id);
      if (!backups.length) {
        await interaction.reply({ embeds: [neutralEmbed("No backups available", null)], ephemeral: true });
        return;
      }
      const list = backups
      .map((b) => `\`${b._id}\` — ${new Date(b.createdAt).toLocaleString("en-US")} ${b.manual ? "(manual)" : ""}`)
      .join("\n");
    await interaction.reply({ embeds: [neutralEmbed("📦 Available backups", list)], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const backupId = interaction.options.getString("backup_id");
    const backup = await rollbackService.manualRollback(interaction.guild, backupId);

    if (!backup) {
      await interaction.editReply({ embeds: [dangerEmbed("Backup not found", null)] });
      return;
    }

    await interaction.editReply({ embeds: [successEmbed("✅ Rollback completed", `Backup restored: \`${backup._id}\``)] });
  }
};
