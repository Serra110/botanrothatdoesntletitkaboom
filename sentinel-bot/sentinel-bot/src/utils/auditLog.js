const { AuditLogEvent } = require("discord.js");

/**
 * Vai buscar a entrada mais recente e relevante do audit log para
 * identificar quem executou uma ação (Discord não indica isto
 * diretamente nos eventos de gateway).
 *
 * @param {import('discord.js').Guild} guild
 * @param {AuditLogEvent} type
 * @param {string|null} targetId - filtra pela entrada cujo target.id corresponda
 * @param {number} maxAgeMs - ignora entradas mais antigas que isto (evita atribuir ações antigas)
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
