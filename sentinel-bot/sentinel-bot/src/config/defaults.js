/**
 * Default configuration for a new server.
 * Everything here is overridden by the GuildConfig document in the database
 * and is editable via the /config command.
 */
module.exports = {
  ownerId: null,
  coOwnerId: null,

  criticalChannelIds: [], // e.g. #rules, #announcements, #staff, #logs
  protectedRoleIds: [], // e.g. Owner, Co-Owner, Admin, Moderator
  authorizedRoleIds: [], // roles that can act during lockdown (kick/ban/timeout)

  backupMessageChannelIds: [], // channels whose message content is included in backups
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
    massChannelCreate: 80, // 5+ channels in a short interval
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
