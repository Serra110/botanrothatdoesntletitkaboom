const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

async function getOrCreateConfig(guildId) {
  let config = await GuildConfig.findOne({ guildId });
  if (!config) config = await GuildConfig.create({ guildId });
  return config;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Sentinel configuration panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("view").setDescription("Shows the current configuration."))
    .addSubcommand((sub) =>
      sub
        .setName("set-owners")
        .setDescription("Sets the Owner and Co-Owner of the bot for this server.")
        .addUserOption((o) => o.setName("owner").setDescription("Owner").setRequired(true))
        .addUserOption((o) => o.setName("co_owner").setDescription("Co-Owner").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-critical-channel")
        .setDescription("Adds a channel to the critical channels list.")
        .addChannelOption((o) => o.setName("channel").setDescription("Critical channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-protected-role")
        .setDescription("Adds a role to the protected roles list.")
        .addRoleOption((o) => o.setName("role").setDescription("Protected role").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-authorized-role")
        .setDescription("Adds a role authorized to act during lockdown/emergency.")
        .addRoleOption((o) => o.setName("role").setDescription("Authorized role").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-log-channel")
        .setDescription("Sets the log channel.")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-approval-channel")
        .setDescription("Sets the approval requests channel.")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Approval channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-thresholds")
        .setDescription("Sets the Threat Score thresholds.")
        .addIntegerOption((o) => o.setName("alert").setDescription("Alert threshold").setRequired(true))
        .addIntegerOption((o) => o.setName("quarantine").setDescription("Quarantine threshold").setRequired(true))
        .addIntegerOption((o) => o.setName("emergency").setDescription("Emergency threshold").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-backup-interval")
        .setDescription("Sets the interval between automatic backups (minutes).")
        .addIntegerOption((o) => o.setName("minutes").setDescription("Interval in minutes").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("enable-honeypot").setDescription("Creates and enables Honeypot Mode.")),

  async execute(interaction) {
    const existing = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    // For set-owners, allows initial bootstrap even without prior config
    // (anyone with Administrator on Discord can set the first Owner).
    const sub = interaction.options.getSubcommand();
    if (existing && !isOwnerOrCoOwner(interaction.member, existing) && sub !== "set-owners") {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "Only the Owner or Co-Owner can change the configuration.")],
        ephemeral: true
      });
      return;
    }

    const config = await getOrCreateConfig(interaction.guild.id);

    switch (sub) {
      case "view": {
        const summary = [
          `**Owner:** ${config.ownerId ? `<@${config.ownerId}>` : "not set"}`,
          `**Co-Owner:** ${config.coOwnerId ? `<@${config.coOwnerId}>` : "not set"}`,
          `**Critical channels:** ${config.criticalChannelIds.length}`,
          `**Protected roles:** ${config.protectedRoleIds.length}`,
          `**Authorized roles:** ${config.authorizedRoleIds.length}`,
          `**Log channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : "not set"}`,
          `**Approval channel:** ${config.approvalChannelId ? `<#${config.approvalChannelId}>` : "not set"}`,
          `**Thresholds:** alert ${config.threatThresholds.alert} / quarantine ${config.threatThresholds.quarantine} / emergency ${config.threatThresholds.emergency}`,
          `**Backup interval:** ${config.backupIntervalMinutes} min`,
          `**Maintenance mode:** ${config.maintenanceMode ? "active" : "inactive"}`,
          `**Honeypot:** ${config.honeypot?.enabled ? "active" : "inactive"}`
        ].join("\n");
        await interaction.reply({ embeds: [neutralEmbed("⚙️ Sentinel Configuration", summary)], ephemeral: true });
        return;
      }

      case "set-owners": {
        config.ownerId = interaction.options.getUser("owner").id;
        const coOwner = interaction.options.getUser("co_owner");
        if (coOwner) config.coOwnerId = coOwner.id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Owner/Co-Owner set")], ephemeral: true });
        return;
      }

      case "add-critical-channel": {
        const channel = interaction.options.getChannel("channel");
        if (!config.criticalChannelIds.includes(channel.id)) config.criticalChannelIds.push(channel.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Critical channel added", `<#${channel.id}>`)], ephemeral: true });
        return;
      }

      case "add-protected-role": {
        const role = interaction.options.getRole("role");
        if (!config.protectedRoleIds.includes(role.id)) config.protectedRoleIds.push(role.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Protected role added", role.name)], ephemeral: true });
        return;
      }

      case "add-authorized-role": {
        const role = interaction.options.getRole("role");
        if (!config.authorizedRoleIds.includes(role.id)) config.authorizedRoleIds.push(role.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Authorized role added", role.name)], ephemeral: true });
        return;
      }

      case "set-log-channel": {
        config.logChannelId = interaction.options.getChannel("channel").id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Log channel set")], ephemeral: true });
        return;
      }

      case "set-approval-channel": {
        config.approvalChannelId = interaction.options.getChannel("channel").id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Approval channel set")], ephemeral: true });
        return;
      }

      case "set-thresholds": {
        config.threatThresholds = {
          alert: interaction.options.getInteger("alert"),
          quarantine: interaction.options.getInteger("quarantine"),
          emergency: interaction.options.getInteger("emergency")
        };
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Thresholds updated")], ephemeral: true });
        return;
      }

      case "set-backup-interval": {
        config.backupIntervalMinutes = interaction.options.getInteger("minutes");
        await config.save();
        await interaction.reply({
          embeds: [successEmbed("✅ Backup interval updated", "Note: restart the bot to apply to the scheduler.")],
          ephemeral: true
        });
        return;
      }

      case "enable-honeypot": {
        const honeypotService = require("../services/honeypotService");
        await honeypotService.setupHoneypot(interaction.guild);
        await interaction.reply({
          embeds: [successEmbed("🍯 Honeypot enabled", "Role and bait channel created. Any interaction with them triggers an investigation.")],
          ephemeral: true
        });
        return;
      }
    }
  }
};
