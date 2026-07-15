const logger = require("../utils/logger");

/**
 * Mapa em memória por servidor: userId -> { grantedBy, grantedAt, grantType }
 * Regista quem concedeu permissões perigosas a quem, para reconstruir
 * a cadeia de responsabilidade num incidente (secção 3 e 10 do spec).
 *
 * Nota: em produção isto pode ser persistido em MongoDB; mantém-se em
 * memória aqui por simplicidade, com TTL para não crescer indefinidamente.
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
  logger.debug(`[Chain][${guildId}] ${grantedById} concedeu ${grantType} a ${granteeId}`);
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
 * Dado o utilizador que executou a ação maliciosa, reconstrói a cadeia
 * ascendente (quem lhe deu a permissão, e quem deu a essa pessoa, etc.)
 * Devolve { primaryResponsible, secondaryResponsible: [] }
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

  // O responsável principal é normalmente quem iniciou a cadeia
  // (concedeu a permissão), o executor é secundário — mas se não há
  // registo de concessão, o próprio executor é o principal.
  if (chain.length === 1) {
    return { primaryResponsible: executorId, secondaryResponsible: [] };
  }

  const primaryResponsible = chain[chain.length - 1];
  const secondaryResponsible = chain.slice(0, chain.length - 1);
  return { primaryResponsible, secondaryResponsible };
}

module.exports = { recordGrant, getGrantInfo, buildResponsibilityChain };
