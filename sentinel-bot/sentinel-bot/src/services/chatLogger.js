const fs = require("fs");
const path = require("path");
const { getSaveChannels, getExcludeChannels } = require("../utils/permissions");
const logger = require("../utils/logger");

const localPath = process.env.CHAT_SAVE_LOCAL_PATH || "./chat-logs";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function shouldSaveChannel(channelId) {
  const excludeChannels = getExcludeChannels();
  if (excludeChannels.includes(channelId)) return false;

  const saveChannels = getSaveChannels();
  // If SAVE_CHANNELS is empty, save NOTHING (explicit opt-in)
  if (saveChannels.length === 0) return false;

  return saveChannels.includes(channelId);
}

function formatMessage(message) {
  return {
    id: message.id,
    author: message.author?.tag || "unknown",
    authorId: message.author?.id || null,
    content: message.content || "",
    timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
    attachments: (message.attachments || []).map((a) => ({
      name: a.name,
      url: a.url,
      size: a.size
    })),
    embeds: message.embeds?.length || 0
  };
}

function formatForCloud(messages, channelName) {
  const lines = messages.map((m) => {
    const attachStr = m.attachments.length ? ` [attachments: ${m.attachments.map((a) => a.name).join(", ")}]` : "";
    const embedStr = m.embeds ? ` [embeds: ${m.embeds}]` : "";
    return `[${m.timestamp}] ${m.author}: ${m.content}${attachStr}${embedStr}`;
  });
  return {
    channel: channelName,
    messageCount: lines.length,
    exportedAt: new Date().toISOString(),
    messages: lines
  };
}

async function saveMessage(message) {
  if (!message.guild) return;
  if (!shouldSaveChannel(message.channel.id)) return;

  try {
    const guildDir = path.resolve(localPath, message.guild.id);
    ensureDir(guildDir);

    const formatted = formatMessage(message);
    const line = JSON.stringify(formatted) + "\n";

    const channelName = message.channel.name || message.channel.id;
    const fileName = `${channelName}.jsonl`;
    const filePath = path.join(guildDir, fileName);
    fs.appendFileSync(filePath, line, "utf-8");
    logger.debug(`Chat saved: ${message.guild.id}/${channelName} (${message.id})`);
  } catch (e) {
    logger.error(`Failed to save message ${message.id}: ${e.message}`);
  }
}

async function saveChannelHistory(channel) {
  if (!channel.guild) return;
  if (!shouldSaveChannel(channel.id)) return;

  try {
    const guildDir = path.resolve(localPath, channel.guild.id);
    ensureDir(guildDir);

    // Fetch last 100 messages before deletion
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages || !messages.size) return;

    const formatted = messages.map(formatMessage);
    const channelName = channel.name || channel.id;

    // Save as JSONL (same format as live messages)
    const fileName = `${channelName}.jsonl`;
    const filePath = path.join(guildDir, fileName);
    const lines = formatted.map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.appendFileSync(filePath, lines, "utf-8");

    // Also save cloud-readable format
    const cloudData = formatForCloud(formatted, channelName);
    const cloudPath = path.join(guildDir, `${channelName}_export.json`);
    fs.writeFileSync(cloudPath, JSON.stringify(cloudData, null, 2), "utf-8");

    logger.info(`Channel history saved: ${channel.guild.id}/${channelName} (${messages.size} messages)`);
  } catch (e) {
    logger.error(`Failed to save channel history for ${channel.id}: ${e.message}`);
  }
}

async function exportChannel(messages, channelName) {
  if (!messages.length) return null;
  const formatted = messages.map(formatMessage);
  return formatForCloud(formatted, channelName);
}

module.exports = { saveMessage, saveChannelHistory, exportChannel, shouldSaveChannel };
