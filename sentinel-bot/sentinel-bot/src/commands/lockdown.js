const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const lockdownService = require("../services/lockdownService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Ativa ou desativa o lockdown manualmente.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("on").setDescription("Ativa o lockdown."))
    .addSubcommand((sub) => sub.setName("off").setDescription("Desativa o lockdown.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Não tens autorização para gerir o lockdown.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "on") {
      await lockdownService.enableLockdown(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("🔒 Lockdown ativado")] });
    } else {
      await lockdownService.disableLockdown(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("🔓 Lockdown desativado")] });
    }
  }
};
