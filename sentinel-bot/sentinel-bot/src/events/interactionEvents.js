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
            embeds: [dangerEmbed("Pedido expirado ou já decidido", null)],
            components: []
          });
          return;
        }

        await interaction.update({
          embeds: [
            approved
              ? successEmbed("✅ Aprovado", `Ação **${request.action}** aprovada por <@${interaction.user.id}>.`)
              : dangerEmbed("❌ Rejeitado", `Ação **${request.action}** rejeitada por <@${interaction.user.id}>.`)
          ],
          components: []
        });
      }
    } catch (err) {
      logger.error(`Erro ao processar interação: ${err.message}`);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "Ocorreu um erro ao processar este pedido.", ephemeral: true }).catch(() => {});
      }
    }
  });
}

module.exports = { register };
