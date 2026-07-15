const logger = require("../utils/logger");

/**
 * In-memory map per server: userId -> { grantedBy, grantedAt, grantType }
 * Records who granted dangerous permissions to whom, to reconstruct
 * the responsibility chain in an incident (sections 3 and 10 of spec).
 *
 * Note: in production this could be persisted to MongoDB; kept in
 * memory here for simplicity, with TTL to prevent unbounded growth.
 */
const grantRegistry = new Map(); // guildId -> Map(userId -> grantInfo)
const GRANT_TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

function _guildMap(guildId) {
  if (!grantRegistry.has(guildId)) grantRegistry.set(guildId, new Map());
  return grantRegistry.get(guildId);
}

function recordGrant(guildId, { granteeId, grantedById, grantType }) {
  const map = _guildMap(guildId);
  map.set(granteeId, { grantedById, grantType, grantedAt: Date.now() });
  logger.debug(`[Chain][${guildId}] ${grantedById} granted ${grantType} to ${granteeId}`);
}

function getGrantInfo(guildId, userId) {
  const map = _guildMap(guildId);
  const info = map.get(userId);
  if (!info) return null;
  if (Date.now() - info.grantedAt > GRANT_TTL_MS) {
    map.delete(userId);
    return null;
  }
  return info;
}

/**
 * Given the user who executed the malicious action, reconstructs the
 * ascending chain (who gave them the permission, and who gave it to
 * that person, etc.)
 * Returns { primaryResponsible, secondaryResponsible: [] }
 */
function buildResponsibilityChain(guildId, executorId) {
  const chain = [executorId];
  let current = executorId;
  const seen = new Set(chain);

  for (let i = 0; i < 5; i++) {
    const info = getGrantInfo(guildId, current);
    if (!info || seen.has(info.grantedById)) break;
    chain.push(info.grantedById);
    seen.add(info.grantedById);
    current = info.grantedById;
  }

  // The primary responsible is usually who initiated the chain
  // (granted the permission), the executor is secondary — but if there's
  // no grant record, the executor themselves is primary.
  if (chain.length === 1) {
    return { primaryResponsible: executorId, secondaryResponsible: [] };
  }

  const primaryResponsible = chain[chain.length - 1];
  const secondaryResponsible = chain.slice(0, chain.length - 1);
  return { primaryResponsible, secondaryResponsible };
}

module.exports = { recordGrant, getGrantInfo, buildResponsibilityChain };
