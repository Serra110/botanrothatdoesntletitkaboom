const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Incident = require("../models/Incident");
const { neutralEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Consulta logs forenses.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("incident")
        .setDescription("Mostra os detalhes de um incidente.")
        .addStringOption((opt) => opt.setName("id").setDescription("ID do incidente (ex: INC-XXXXX)").setRequired(true))
    ),

  async execute(interaction) {
    const incidentId = interaction.options.getString("id");
    const incident = await Incident.findOne({ guildId: interaction.guild.id, incidentId }).lean();

    if (!incident) {
      await interaction.reply({ embeds: [dangerEmbed("Incidente não encontrado", `\`${incidentId}\``)], ephemeral: true });
      return;
    }

    const duration = incident.endedAt
      ? `${Math.round((new Date(incident.endedAt) - new Date(incident.startedAt)) / 1000)}s`
      : "em curso";

    const summary = [
      `**Motivo:** ${incident.reason}`,
      `**Duração:** ${duration}`,
      incident.primaryResponsible ? `**Responsável principal:** <@${incident.primaryResponsible}>` : null,
      incident.secondaryResponsible?.length
        ? `**Responsáveis secundários:** ${incident.secondaryResponsible.map((id) => `<@${id}>`).join(", ")}`
        : null,
      `**Canais apagados:** ${incident.channelsDeleted?.length || 0}`,
      `**Roles apagadas:** ${incident.rolesDeleted?.length || 0}`,
      `**Bots adicionados:** ${incident.botsAdded?.length || 0}`,
      `**Ações executadas:** ${incident.actions?.length || 0}`,
      `**Backup restaurado:** ${incident.backupRestoredId ? "sim" : "não"}`,
      incident.responseTimeMs ? `**Tempo até resposta:** ${incident.responseTimeMs}ms` : null,
      incident.recoveryTimeMs ? `**Tempo até recuperação:** ${incident.recoveryTimeMs}ms` : null,
      `**Resolvido:** ${incident.resolved ? "sim" : "não"}`
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.reply({ embeds: [neutralEmbed(`📋 Incidente ${incidentId}`, summary)], ephemeral: true });
  }
};
