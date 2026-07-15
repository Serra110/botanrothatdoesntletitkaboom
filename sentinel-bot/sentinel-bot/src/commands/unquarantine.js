const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const quarantineService = require("../services/quarantineService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unquarantine")
    .setDescription("Remove a quarentena de um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName("utilizador").setDescription("Membro a libertar da quarentena").setRequired(true))
    .addBooleanOption((opt) =>
      opt.setName("inocente").setDescription("Restaurar roles anteriores (true) ou manter marcado como culpado (false)").setRequired(true)
    ),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Não tens autorização para remover quarentenas.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("utilizador");
    const innocent = interaction.options.getBoolean("inocente");

    const result = await quarantineService.clearQuarantine(interaction.guild, targetUser.id, innocent, interaction.user.id);

    if (!result) {
      await interaction.editReply({ embeds: [dangerEmbed("Sem quarentena ativa para este membro", null)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          innocent ? "✅ Quarentena removida (inocente)" : "Utilizador marcado como culpado",
          `${targetUser.tag}`
        )
      ]
    });
  }
};
