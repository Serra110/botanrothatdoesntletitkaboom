const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Ativa/desativa o modo de manutenção (suspende deteções, mantém logs e backups).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("start").setDescription("Ativa o modo de manutenção."))
    .addSubcommand((sub) => sub.setName("end").setDescription("Desativa o modo de manutenção.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id });

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Apenas o Owner ou Co-Owner podem gerir o modo de manutenção.")],
        ephemeral: true
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (!config) {
      await interaction.reply({ embeds: [dangerEmbed("Servidor não configurado", "Usa /config primeiro.")], ephemeral: true });
      return;
    }

    config.maintenanceMode = sub === "start";
    await config.save();

    await interaction.reply({
      embeds: [
        successEmbed(
          sub === "start" ? "🛠️ Modo de manutenção ativado" : "✅ Modo de manutenção desativado",
          sub === "start"
            ? "Deteções em tempo real e threat score suspensos. Logs e backups continuam ativos."
            : "Deteções em tempo real retomadas."
        )
      ],
      ephemeral: true
    });
  }
};
