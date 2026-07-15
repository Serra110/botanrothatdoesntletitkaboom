const ThreatScore = require("../models/ThreatScore");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * Adiciona pontos de risco a um utilizador e verifica se algum limiar
 * foi ultrapassado (alerta / quarentena / emergência).
 *
 * @returns {{ score: number, triggered: 'alert'|'quarantine'|'emergency'|null }}
 */
async function addThreatPoints(guildId, userId, action, points) {
  const doc = await ThreatScore.findOneAndUpdate(
    { guildId, userId },
    {
      $inc: { score: points },
      $push: { history: { action, points, timestamp: new Date() } },
      $set: { lastUpdated: new Date() }
    },
    { upsert: true, new: true }
  );

  const config = await GuildConfig.findOne({ guildId }).lean();
  const thresholds = config?.threatThresholds ?? { alert: 60, quarantine: 120, emergency: 200 };

  let triggered = null;
  if (doc.score >= thresholds.emergency) triggered = "emergency";
  else if (doc.score >= thresholds.quarantine) triggered = "quarantine";
  else if (doc.score >= thresholds.alert) triggered = "alert";

  logger.debug(`[ThreatScore][${guildId}] ${userId} => ${doc.score} (${action}: +${points})`);

  return { score: doc.score, triggered };
}

async function getScore(guildId, userId) {
  const doc = await ThreatScore.findOne({ guildId, userId }).lean();
  return doc?.score ?? 0;
}

async function resetScore(guildId, userId) {
  await ThreatScore.updateOne({ guildId, userId }, { $set: { score: 0, history: [] } });
}

/**
 * Deteta rajadas de ações do mesmo tipo num curto intervalo (ex: criar
 * 5 canais, ou banir vários membros de seguida), contando entradas
 * recentes no histórico.
 */
async function countRecentActions(guildId, userId, actionName, windowMs) {
  const doc = await ThreatScore.findOne({ guildId, userId }).lean();
  if (!doc) return 0;
  const cutoff = Date.now() - windowMs;
  return doc.history.filter((h) => h.action === actionName && h.timestamp.getTime() >= cutoff).length;
}

module.exports = { addThreatPoints, getScore, resetScore, countRecentActions };
