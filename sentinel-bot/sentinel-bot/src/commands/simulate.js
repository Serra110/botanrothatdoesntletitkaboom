const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

/**
 * Runs a dry-run battery of tests (without changing anything on the
 * real server): checks if each subsystem's prerequisites are
 * correctly configured (section 18).
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("simulate")
    .setDescription("Runs security tests without modifying the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "Only the Owner or Co-Owner can run simulations.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const results = [];

    // Emergency: checks if behavior is configured and owner/co-owner exist
    results.push(
      config
        ? "✅ Emergency configuration present"
        : "❌ No configuration — emergency would use default values"
    );

    // Lockdown: checks if authorized roles are defined
    results.push(
      config?.authorizedRoleIds?.length
        ? `✅ Lockdown: ${config.authorizedRoleIds.length} authorized role(s) would remain active`
        : "⚠️ Lockdown: no authorized roles configured — only Owner/Co-Owner could act"
    );

    // Rollback / Backups: checks if at least 1 valid backup exists
    const latestBackup = await backupService.getLatestValidBackup(interaction.guild.id);
    results.push(
      latestBackup
        ? `✅ Rollback: most recent backup from ${new Date(latestBackup.createdAt).toLocaleString("en-US")}`
        : "❌ Rollback: no backups available — automatic rollback would fail"
    );

    // Permissions: checks if the bot has the necessary permissions
    const botMember = interaction.guild.members.me;
    const needed = ["ManageChannels", "ManageRoles", "KickMembers", "BanMembers", "ManageWebhooks", "ManageGuild"];
    const missing = needed.filter((p) => !botMember.permissions.has(p));
    results.push(missing.length ? `⚠️ Missing bot permissions: ${missing.join(", ")}` : "✅ Bot permissions OK");

    // Quarantine: checks existing role
    results.push(
      config?.quarantineRoleId && interaction.guild.roles.cache.has(config.quarantineRoleId)
        ? "✅ Quarantine role exists"
        : "⚠️ Quarantine role would be created on first use"
    );

    // Recovery: critical channels configured
    results.push(
      config?.criticalChannelIds?.length
        ? `✅ ${config.criticalChannelIds.length} critical channel(s) configured`
        : "⚠️ No critical channels configured"
    );

    await interaction.editReply({
      embeds: [
        successEmbed(
          "🧪 Security Simulation (no real changes)",
          results.join("\n")
        )
      ]
    });
  }
};
