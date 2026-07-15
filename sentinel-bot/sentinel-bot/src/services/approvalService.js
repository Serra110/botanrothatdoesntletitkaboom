const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const ApprovalRequest = require("../models/ApprovalRequest");
const GuildConfig = require("../models/GuildConfig");
const { warnEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Cria um pedido de aprovação, envia-o ao Owner/Co-Owner (ou canal de
 * aprovações), e espera pelo tempo configurado. Devolve uma Promise que
 * resolve com true (aprovado) ou false (rejeitado/ignorado).
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} action - identificador da ação (ex: DELETE_CRITICAL_CHANNEL)
 * @param {object} targetData - contexto da ação (nomes, ids, etc.)
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
    new ButtonBuilder().setCustomId(`approval:approve:${requestId}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`approval:reject:${requestId}`).setLabel("Rejeitar").setStyle(ButtonStyle.Danger)
  );

  const embed = warnEmbed(
    "🔐 Pedido de Aprovação",
    [
      `**Ação:** ${action}`,
      requestedById ? `**Solicitado por:** <@${requestedById}>` : null,
      targetData?.summary ? `**Detalhe:** ${targetData.summary}` : null,
      `**Expira em:** ${waitSeconds}s`
    ]
      .filter(Boolean)
      .join("\n")
  );

  const recipients = [config?.ownerId, config?.coOwnerId].filter(Boolean);
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
        logger.info(`Pedido de aprovação ${requestId} expirou sem resposta -> cancelado.`);
      }
      resolve(false);
    }, waitSeconds * 1000);

    // Guarda o resolver para o handler de interação poder concluir mais cedo
    pendingResolvers.set(requestId, { resolve, timeout });
  });
}

// Mapa em memória usado pelo handler de botões (interactionCreate) para
// resolver a Promise assim que o Owner/Co-Owner decide.
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
