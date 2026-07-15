const mongoose = require("mongoose");

const ApprovalRequestSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    action: { type: String, required: true }, // e.g. DELETE_CRITICAL_CHANNEL
    requestedById: { type: String, default: null }, // null if detected retroactively via audit log
    targetData: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: { type: String, enum: ["pending", "approved", "rejected", "expired"], default: "pending" },
    decidedBy: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApprovalRequest", ApprovalRequestSchema);
