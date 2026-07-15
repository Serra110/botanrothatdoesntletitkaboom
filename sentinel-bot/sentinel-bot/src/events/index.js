const channelEvents = require("./channelEvents");
const roleEvents = require("./roleEvents");
const memberEvents = require("./memberEvents");
const webhookEvents = require("./webhookEvents");
const emojiStickerEvents = require("./emojiStickerEvents");
const inviteEvents = require("./inviteEvents");
const interactionEvents = require("./interactionEvents");
const logger = require("../utils/logger");

function registerAllEvents(client) {
  channelEvents.register(client);
  roleEvents.register(client);
  memberEvents.register(client);
  webhookEvents.register(client);
  emojiStickerEvents.register(client);
  inviteEvents.register(client);
  interactionEvents.register(client);

  logger.info("All event handlers registered.");
}

module.exports = { registerAllEvents };
