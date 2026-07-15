const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Incident = require("../models/Incident");
const { neutralEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Consult forensic logs.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("incident")
        .setDescription("Shows the details of an incident.")
        .addStringOption((opt) => opt.setName("id").setDescription("Incident ID (e.g. INC-XXXXX)").setRequired(true))
    ),

  async execute(interaction) {
    const incidentId = interaction.options.getString("id");
    const incident = await Incident.findOne({ guildId: interaction.guild.id, incidentId }).lean();

    if (!incident) {
      await interaction.reply({ embeds: [dangerEmbed("Incident not found", `\`${incidentId}\``)], ephemeral: true });
      return;
    }

    const duration = incident.endedAt
      ? `${Math.round((new Date(incident.endedAt) - new Date(incident.startedAt)) / 1000)}s`
      : "in progress";

    const summary = [
      `**Reason:** ${incident.reason}`,
      `**Duration:** ${duration}`,
      incident.primaryResponsible ? `**Primary responsible:** <@${incident.primaryResponsible}>` : null,
      incident.secondaryResponsible?.length
        ? `**Secondary responsible:** ${incident.secondaryResponsible.map((id) => `<@${id}>`).join(", ")}`
        : null,
      `**Channels deleted:** ${incident.channelsDeleted?.length || 0}`,
      `**Roles deleted:** ${incident.rolesDeleted?.length || 0}`,
      `**Bots added:** ${incident.botsAdded?.length || 0}`,
      `**Actions executed:** ${incident.actions?.length || 0}`,
      `**Backup restored:** ${incident.backupRestoredId ? "yes" : "no"}`,
      incident.responseTimeMs ? `**Response time:** ${incident.responseTimeMs}ms` : null,
      incident.recoveryTimeMs ? `**Recovery time:** ${incident.recoveryTimeMs}ms` : null,
      `**Resolved:** ${incident.resolved ? "yes" : "no"}`
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.reply({ embeds: [neutralEmbed(`📋 Incidente ${incidentId}`, summary)], ephemeral: true });
  }
};
