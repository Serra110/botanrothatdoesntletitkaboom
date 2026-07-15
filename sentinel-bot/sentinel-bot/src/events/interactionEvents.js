const approvalService = require("../services/approvalService");
const { successEmbed, dangerEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

function register(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("approval:")) {
        const [, decision, requestId] = interaction.customId.split(":");
        const approved = decision === "approve";

        const request = await approvalService.decideApproval(requestId, approved, interaction.user.id);

        if (!request) {
          await interaction.update({
            embeds: [dangerEmbed("Request expired or already decided", null)],
            components: []
          });
          return;
        }

        await interaction.update({
          embeds: [
            approved
              ? successEmbed("✅ Approved", `Action **${request.action}** approved by <@${interaction.user.id}>.`)
              : dangerEmbed("❌ Rejected", `Action **${request.action}** rejected by <@${interaction.user.id}>.`)
          ],
          components: []
        });
      }
    } catch (err) {
      logger.error(`Error processing interaction: ${err.message}`);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "An error occurred while processing this request.", ephemeral: true }).catch(() => {});
      }
    }
  });
}

module.exports = { register };
