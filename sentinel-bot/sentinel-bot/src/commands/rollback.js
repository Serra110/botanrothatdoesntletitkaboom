const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const rollbackService = require("../services/rollbackService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rollback")
    .setDescription("Lista e restaura backups do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista os backups disponíveis."))
    .addSubcommand((sub) =>
      sub
        .setName("restore")
        .setDescription("Restaura um backup específico.")
        .addStringOption((opt) => opt.setName("backup_id").setDescription("ID do backup a restaurar").setRequired(true))
    ),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Apenas o Owner ou Co-Owner podem gerir rollbacks.")],
        ephemeral: true
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const backups = await backupService.listBackups(interaction.guild.id);
      if (!backups.length) {
        await interaction.reply({ embeds: [neutralEmbed("Sem backups disponíveis", null)], ephemeral: true });
        return;
      }
      const list = backups
        .map((b) => `\`${b._id}\` — ${new Date(b.createdAt).toLocaleString("pt-PT")} ${b.manual ? "(manual)" : ""}`)
        .join("\n");
      await interaction.reply({ embeds: [neutralEmbed("📦 Backups disponíveis", list)], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const backupId = interaction.options.getString("backup_id");
    const backup = await rollbackService.manualRollback(interaction.guild, backupId);

    if (!backup) {
      await interaction.editReply({ embeds: [dangerEmbed("Backup não encontrado", null)] });
      return;
    }

    await interaction.editReply({ embeds: [successEmbed("✅ Rollback concluído", `Backup restaurado: \`${backup._id}\``)] });
  }
};
