const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const emergencyService = require("../services/emergencyService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emergency")
    .setDescription("Força ou desativa o modo de emergência manualmente.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("start").setDescription("Ativa o modo de emergência imediatamente."))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Desativa o modo de emergência.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Apenas o Owner ou Co-Owner podem usar este comando.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      await emergencyService.activateEmergency(interaction.guild, {
        reason: `Ativação manual por ${interaction.user.tag}`,
        responsibleUserIds: []
      });
      await interaction.editReply({ embeds: [successEmbed("🚨 Emergência ativada manualmente")] });
    } else {
      await emergencyService.deactivateEmergency(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("Emergência desativada")] });
    }
  }
};
