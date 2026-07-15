const mongoose = require("mongoose");

const QuarantineSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    reason: { type: String, default: "Comportamento suspeito" },
    incidentId: { type: String, default: null },

    previousRoleIds: { type: [String], default: [] },

    status: { type: String, enum: ["active", "cleared", "guilty"], default: "active" },
    quarantinedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: String, default: null }
  },
  { timestamps: true }
);

QuarantineSchema.index({ guildId: 1, userId: 1, status: 1 });

module.exports = mongoose.model("Quarantine", QuarantineSchema);
