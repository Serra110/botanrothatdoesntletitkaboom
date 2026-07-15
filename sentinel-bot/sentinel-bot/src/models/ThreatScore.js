const mongoose = require("mongoose");

const ThreatHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    points: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ThreatScoreSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    score: { type: Number, default: 0 },
    history: { type: [ThreatHistorySchema], default: [] },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

ThreatScoreSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ThreatScore", ThreatScoreSchema);
