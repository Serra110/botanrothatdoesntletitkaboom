const { AuditLogEvent } = require("discord.js");

/**
 * Fetches the most recent and relevant audit log entry to
 * identify who executed an action (Discord doesn't indicate this
 * directly in gateway events).
 *
 * @param {import('discord.js').Guild} guild
 * @param {AuditLogEvent} type
 * @param {string|null} targetId - filters by entry whose target.id matches
 * @param {number} maxAgeMs - ignores entries older than this (prevents attributing old actions)
 */
async function fetchAuditEntry(guild, type, targetId = null, maxAgeMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const now = Date.now();

    const entry = logs.entries.find((e) => {
      const recent = now - e.createdTimestamp <= maxAgeMs;
      const matchesTarget = targetId ? e.target?.id === targetId || e.targetId === targetId : true;
      return recent && matchesTarget;
    });

    return entry || null;
  } catch (err) {
    return null;
  }
}

module.exports = { fetchAuditEntry, AuditLogEvent };
