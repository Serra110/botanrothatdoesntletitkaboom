const { EmbedBuilder } = require("discord.js");

const COLORS = {
  info: 0x3498db,
  warn: 0xf1c40f,
  danger: 0xe74c3c,
  success: 0x2ecc71,
  emergency: 0x8e0000,
  neutral: 0x95a5a6
};

function baseEmbed(color, title) {
  return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
}

module.exports = {
  COLORS,
  infoEmbed: (title, desc) => baseEmbed(COLORS.info, title).setDescription(desc || null),
  warnEmbed: (title, desc) => baseEmbed(COLORS.warn, title).setDescription(desc || null),
  dangerEmbed: (title, desc) => baseEmbed(COLORS.danger, title).setDescription(desc || null),
  successEmbed: (title, desc) => baseEmbed(COLORS.success, title).setDescription(desc || null),
  emergencyEmbed: (title, desc) => baseEmbed(COLORS.emergency, title).setDescription(desc || null),
  neutralEmbed: (title, desc) => baseEmbed(COLORS.neutral, title).setDescription(desc || null)
};
