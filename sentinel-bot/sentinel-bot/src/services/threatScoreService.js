const ThreatScore = require("../models/ThreatScore");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * Adds threat points to a user and checks if any threshold
 * has been exceeded (alert / quarantine / emergency).
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
 * Detects bursts of the same action type in a short interval (e.g. creating
 * 5 channels, or banning multiple members in succession), by counting
 * recent entries in the history.
 */
async function countRecentActions(guildId, userId, actionName, windowMs) {
  const doc = await ThreatScore.findOne({ guildId, userId }).lean();
  if (!doc) return 0;
  const cutoff = Date.now() - windowMs;
  return doc.history.filter((h) => h.action === actionName && h.timestamp.getTime() >= cutoff).length;
}

module.exports = { addThreatPoints, getScore, resetScore, countRecentActions };
