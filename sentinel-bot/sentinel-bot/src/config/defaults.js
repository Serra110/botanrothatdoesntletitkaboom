/**
 * Configuração por defeito para um novo servidor.
 * Tudo aqui é sobreposto pelo documento GuildConfig na base de dados
 * e é editável através do comando /config.
 */
module.exports = {
  ownerId: null,
  coOwnerId: null,

  criticalChannelIds: [], // ex: #rules, #announcements, #staff, #logs
  protectedRoleIds: [], // ex: Owner, Co-Owner, Admin, Moderador
  authorizedRoleIds: [], // roles que podem agir durante lockdown (kick/ban/timeout)

  backupMessageChannelIds: [], // canais cujo conteúdo de mensagens é incluído no backup
  backupIntervalMinutes: 30,
  backupRetentionCount: 3,

  threatThresholds: {
    alert: 60,
    quarantine: 120,
    emergency: 200
  },

  threatPoints: {
    channelDelete: 50,
    categoryDelete: 100,
    massChannelCreate: 80, // 5+ canais num curto intervalo
    grantAdministrator: 120,
    dangerousRoleCreate: 100,
    webhookCreate: 40,
    massBan: 150,
    multipleBotsAdded: 200
  },

  approvalRequiredActions: [
    "DELETE_CRITICAL_CHANNEL",
    "DELETE_CRITICAL_CATEGORY",
    "CREATE_HIGH_PERMISSION_ROLE",
    "EDIT_CRITICAL_CHANNEL_PERMISSIONS"
  ],
  approvalWaitSeconds: 30,
  approvalChannelId: null,

  emergencyBehavior: {
    stripAdminFromStaff: true,
    quarantineResponsible: true,
    quarantineRecentPrivilegeGrantees: true,
    lockdownServer: true
  },

  logChannelId: null,

  quarantineRoleId: null,
  quarantineRules: {
    blockMessages: true,
    blockManagement: true,
    blockAdministration: true,
    blockCriticalChannels: true
  },

  antiRaid: {
    botJoinThreshold: 3,
    windowSeconds: 5
  },

  honeypot: {
    enabled: false,
    roleId: null,
    channelId: null
  },

  maintenanceMode: false,

  rollback: {
    ownerDecisionWindowMinutes: 10
  }
};
