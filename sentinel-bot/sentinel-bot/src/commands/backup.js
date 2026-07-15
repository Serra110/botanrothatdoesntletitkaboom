const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Gestão de backups do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("create").setDescription("Cria um backup manual imediatamente."))
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista os backups disponíveis.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Não tens autorização para gerir backups.")],
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
          embeds: [dangerEmbed("Não foi possível criar backup", "Emergência ou rollback em curso.")]
        });
        return;
      }
      await interaction.editReply({ embeds: [successEmbed("📦 Backup manual criado", `ID: \`${backup._id}\``)] });
      return;
    }

    const backups = await backupService.listBackups(interaction.guild.id);
    if (!backups.length) {
      await interaction.reply({ embeds: [neutralEmbed("Sem backups disponíveis", null)], ephemeral: true });
      return;
    }
    const list = backups
      .map((b) => `\`${b._id}\` — ${new Date(b.createdAt).toLocaleString("pt-PT")} ${b.manual ? "(manual)" : ""}`)
      .join("\n");
    await interaction.reply({ embeds: [neutralEmbed("📦 Backups disponíveis", list)], ephemeral: true });
  }
};
