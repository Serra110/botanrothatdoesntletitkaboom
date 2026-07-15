const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const ApprovalRequest = require("../models/ApprovalRequest");
const GuildConfig = require("../models/GuildConfig");
const { warnEmbed } = require("../utils/embeds");
const { getOwnerIds } = require("../utils/permissions");
const logger = require("../utils/logger");

/**
 * Creates an approval request, sends it to the Owner/Co-Owner (or approval
 * channel), and waits for the configured time. Returns a Promise that
 * resolves with true (approved) or false (rejected/ignored).
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} action - action identifier (e.g. DELETE_CRITICAL_CHANNEL)
 * @param {object} targetData - action context (names, ids, etc.)
 * @param {string|null} requestedById
 */
async function requestApproval(guild, action, targetData = {}, requestedById = null) {
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const waitSeconds = config?.approvalWaitSeconds ?? 30;
  const expiresAt = new Date(Date.now() + waitSeconds * 1000);

  const request = await ApprovalRequest.create({
    guildId: guild.id,
    action,
    requestedById,
    targetData,
    expiresAt
  });

  const requestId = request._id.toString();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approval:approve:${requestId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`approval:reject:${requestId}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
  );

  const embed = warnEmbed(
    "🔐 Approval Request",
    [
      `**Action:** ${action}`,
      requestedById ? `**Requested by:** <@${requestedById}>` : null,
      targetData?.summary ? `**Detail:** ${targetData.summary}` : null,
      `**Expires in:** ${waitSeconds}s`
    ]
      .filter(Boolean)
      .join("\n")
  );

  const recipients = getOwnerIds();
  const targetChannel = config?.approvalChannelId ? guild.channels.cache.get(config.approvalChannelId) : null;

  if (targetChannel?.isTextBased()) {
    targetChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
  } else {
    for (const id of recipients) {
      guild.members
        .fetch(id)
        .then((m) => m.send({ embeds: [embed], components: [row] }).catch(() => {}))
        .catch(() => {});
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      const current = await ApprovalRequest.findById(requestId);
      if (current && current.status === "pending") {
        current.status = "expired";
        await current.save();
        logger.info(`Approval request ${requestId} expired without response -> cancelled.`);
      }
      resolve(false);
    }, waitSeconds * 1000);

    // Stores the resolver so the interaction handler can resolve earlier
    pendingResolvers.set(requestId, { resolve, timeout });
  });
}

// In-memory map used by the button handler (interactionCreate) to
// resolve the Promise as soon as the Owner/Co-Owner decides.
const pendingResolvers = new Map();

async function decideApproval(requestId, approved, decidedById) {
  const request = await ApprovalRequest.findById(requestId);
  if (!request || request.status !== "pending") return null;

  request.status = approved ? "approved" : "rejected";
  request.decidedBy = decidedById;
  await request.save();

  const pending = pendingResolvers.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve(approved);
    pendingResolvers.delete(requestId);
  }

  return request;
}

module.exports = { requestApproval, decideApproval };
