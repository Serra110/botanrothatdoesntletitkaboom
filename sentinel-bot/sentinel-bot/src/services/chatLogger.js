const fs = require("fs");
const path = require("path");
const { getSaveChannels, getExcludeChannels } = require("../utils/permissions");
const logger = require("../utils/logger");

const localPath = process.env.CHAT_SAVE_LOCAL_PATH || "./chat-logs";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function shouldSaveChannel(channelId) {
  const saveChannels = getSaveChannels();
  const excludeChannels = getExcludeChannels();
  if (excludeChannels.includes(channelId)) return false;
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
    attachments: message.attachments?.map((a) => ({
      name: a.name,
      url: a.url,
      size: a.size
    })) || [],
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

  const guildDir = path.join(localPath, message.guild.id);
  ensureDir(guildDir);

  const formatted = formatMessage(message);
  const line = JSON.stringify(formatted) + "\n";

  const fileName = `${message.channel.name || message.channel.id}.jsonl`;
  const filePath = path.join(guildDir, fileName);
  fs.appendFileSync(filePath, line, "utf-8");
}

async function exportChannel(messages, channelName) {
  if (!messages.length) return null;
  const formatted = messages.map(formatMessage);
  return formatForCloud(formatted, channelName);
}

module.exports = { saveMessage, exportChannel, shouldSaveChannel };
