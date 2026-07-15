const mongoose = require("mongoose");
const defaults = require("../config/defaults");

const GuildConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    protectedRoleIds: { type: [String], default: () => [...defaults.protectedRoleIds] },
    authorizedRoleIds: { type: [String], default: () => [...defaults.authorizedRoleIds] },

    backupMessageChannelIds: { type: [String], default: () => [...defaults.backupMessageChannelIds] },
    backupIntervalMinutes: { type: Number, default: defaults.backupIntervalMinutes },
    backupRetentionCount: { type: Number, default: defaults.backupRetentionCount },

    threatThresholds: {
      alert: { type: Number, default: defaults.threatThresholds.alert },
      quarantine: { type: Number, default: defaults.threatThresholds.quarantine },
      emergency: { type: Number, default: defaults.threatThresholds.emergency }
    },

    threatPoints: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ ...defaults.threatPoints })
    },

    approvalRequiredActions: { type: [String], default: () => [...defaults.approvalRequiredActions] },
    approvalWaitSeconds: { type: Number, default: defaults.approvalWaitSeconds },
    approvalChannelId: { type: String, default: null },

    emergencyBehavior: {
      stripAdminFromStaff: { type: Boolean, default: defaults.emergencyBehavior.stripAdminFromStaff },
      quarantineResponsible: { type: Boolean, default: defaults.emergencyBehavior.quarantineResponsible },
      quarantineRecentPrivilegeGrantees: {
        type: Boolean,
        default: defaults.emergencyBehavior.quarantineRecentPrivilegeGrantees
      },
      lockdownServer: { type: Boolean, default: defaults.emergencyBehavior.lockdownServer }
    },

    logChannelId: { type: String, default: null },

    quarantineRoleId: { type: String, default: null },
    quarantineRules: {
      blockMessages: { type: Boolean, default: defaults.quarantineRules.blockMessages },
      blockManagement: { type: Boolean, default: defaults.quarantineRules.blockManagement },
      blockAdministration: { type: Boolean, default: defaults.quarantineRules.blockAdministration },
      blockCriticalChannels: { type: Boolean, default: defaults.quarantineRules.blockCriticalChannels }
    },

    antiRaid: {
      botJoinThreshold: { type: Number, default: defaults.antiRaid.botJoinThreshold },
      windowSeconds: { type: Number, default: defaults.antiRaid.windowSeconds }
    },

    honeypot: {
      enabled: { type: Boolean, default: defaults.honeypot.enabled },
      roleId: { type: String, default: null },
      channelId: { type: String, default: null }
    },

    maintenanceMode: { type: Boolean, default: defaults.maintenanceMode },
    emergencyActive: { type: Boolean, default: false },
    lockdownActive: { type: Boolean, default: false },

    rollback: {
      ownerDecisionWindowMinutes: { type: Number, default: defaults.rollback.ownerDecisionWindowMinutes }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GuildConfig", GuildConfigSchema);
