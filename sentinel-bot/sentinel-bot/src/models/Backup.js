const mongoose = require("mongoose");

const BackupSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    manual: { type: Boolean, default: false },
    valid: { type: Boolean, default: true },

    data: {
      guildName: String,
      channels: { type: [mongoose.Schema.Types.Mixed], default: [] },
      categories: { type: [mongoose.Schema.Types.Mixed], default: [] },
      roles: { type: [mongoose.Schema.Types.Mixed], default: [] },
      roleOrder: { type: [String], default: [] },
      emojis: { type: [mongoose.Schema.Types.Mixed], default: [] },
      stickers: { type: [mongoose.Schema.Types.Mixed], default: [] },
      webhooks: { type: [mongoose.Schema.Types.Mixed], default: [] },
      messages: { type: mongoose.Schema.Types.Mixed, default: {} }, // { channelId: [ {authorId, content, createdAt} ] }
      config: { type: mongoose.Schema.Types.Mixed, default: {} }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Backup", BackupSchema);
