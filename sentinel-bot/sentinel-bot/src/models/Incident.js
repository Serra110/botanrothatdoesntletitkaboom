const mongoose = require("mongoose");

const IncidentActionSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    actorId: { type: String },
    action: { type: String, required: true },
    detail: { type: mongoose.Schema.Types.Mixed }
  },
  { _id: false }
);

const IncidentSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    incidentId: { type: String, required: true, unique: true },
    reason: { type: String, required: true },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },

    primaryResponsible: { type: String, default: null },
    secondaryResponsible: { type: [String], default: [] },

    actions: { type: [IncidentActionSchema], default: [] },
    channelsDeleted: { type: [String], default: [] },
    rolesDeleted: { type: [String], default: [] },
    botsAdded: { type: [String], default: [] },

    backupRestoredId: { type: mongoose.Schema.Types.ObjectId, ref: "Backup", default: null },

    responseTimeMs: { type: Number, default: null }, // detection -> first containment action
    recoveryTimeMs: { type: Number, default: null }, // detection -> rollback completed

    resolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incident", IncidentSchema);
