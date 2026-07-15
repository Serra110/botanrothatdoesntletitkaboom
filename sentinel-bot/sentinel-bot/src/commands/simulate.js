const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("../services/backupService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

/**
 * Executa uma bateria de testes "a seco" (sem alterar nada no
 * servidor real): verifica se os pré-requisitos de cada subsistema
 * estão corretamente configurados (secção 18).
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("simulate")
    .setDescription("Executa testes de segurança sem alterar o servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Apenas o Owner ou Co-Owner podem correr simulações.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const results = [];

    // Emergência: verifica se há behavior configurado e se owner/co-owner existem
    results.push(
      config
        ? "✅ Configuração de emergência presente"
        : "❌ Sem configuração — a emergência usaria valores por defeito"
    );

    // Lockdown: verifica se há roles autorizadas definidas
    results.push(
      config?.authorizedRoleIds?.length
        ? `✅ Lockdown: ${config.authorizedRoleIds.length} role(s) autorizada(s) ficariam ativas`
        : "⚠️ Lockdown: nenhuma role autorizada configurada — só Owner/Co-Owner poderiam agir"
    );

    // Rollback / Backups: verifica se existe pelo menos 1 backup válido
    const latestBackup = await backupService.getLatestValidBackup(interaction.guild.id);
    results.push(
      latestBackup
        ? `✅ Rollback: backup mais recente de ${new Date(latestBackup.createdAt).toLocaleString("pt-PT")}`
        : "❌ Rollback: nenhum backup disponível — rollback automático falharia"
    );

    // Permissões: verifica se o bot tem as permissões necessárias
    const botMember = interaction.guild.members.me;
    const needed = ["ManageChannels", "ManageRoles", "KickMembers", "BanMembers", "ManageWebhooks", "ManageGuild"];
    const missing = needed.filter((p) => !botMember.permissions.has(p));
    results.push(missing.length ? `⚠️ Permissões em falta para o bot: ${missing.join(", ")}` : "✅ Permissões do bot OK");

    // Quarentena: verifica role existente
    results.push(
      config?.quarantineRoleId && interaction.guild.roles.cache.has(config.quarantineRoleId)
        ? "✅ Role de quarentena existente"
        : "⚠️ Role de quarentena seria criada na primeira utilização"
    );

    // Recuperação: canais críticos configurados
    results.push(
      config?.criticalChannelIds?.length
        ? `✅ ${config.criticalChannelIds.length} canal(is) crítico(s) configurado(s)`
        : "⚠️ Nenhum canal crítico configurado"
    );

    await interaction.editReply({
      embeds: [
        successEmbed(
          "🧪 Simulação de Segurança (sem alterações reais)",
          results.join("\n")
        )
      ]
    });
  }
};
