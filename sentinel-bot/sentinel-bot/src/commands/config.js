const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed, neutralEmbed } = require("../utils/embeds");

async function getOrCreateConfig(guildId) {
  let config = await GuildConfig.findOne({ guildId });
  if (!config) config = await GuildConfig.create({ guildId });
  return config;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Painel de configuração do Sentinel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("view").setDescription("Mostra a configuração atual."))
    .addSubcommand((sub) =>
      sub
        .setName("set-owners")
        .setDescription("Define o Owner e Co-Owner do bot para este servidor.")
        .addUserOption((o) => o.setName("owner").setDescription("Owner").setRequired(true))
        .addUserOption((o) => o.setName("co_owner").setDescription("Co-Owner").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-critical-channel")
        .setDescription("Adiciona um canal à lista de canais críticos.")
        .addChannelOption((o) => o.setName("canal").setDescription("Canal crítico").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-protected-role")
        .setDescription("Adiciona uma role à lista de roles protegidas.")
        .addRoleOption((o) => o.setName("role").setDescription("Role protegida").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-authorized-role")
        .setDescription("Adiciona uma role autorizada a agir durante lockdown/emergência.")
        .addRoleOption((o) => o.setName("role").setDescription("Role autorizada").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-log-channel")
        .setDescription("Define o canal de logs.")
        .addChannelOption((o) =>
          o.setName("canal").setDescription("Canal de logs").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-approval-channel")
        .setDescription("Define o canal de pedidos de aprovação.")
        .addChannelOption((o) =>
          o.setName("canal").setDescription("Canal de aprovações").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-thresholds")
        .setDescription("Define os limiares do Threat Score.")
        .addIntegerOption((o) => o.setName("alerta").setDescription("Limiar de alerta").setRequired(true))
        .addIntegerOption((o) => o.setName("quarentena").setDescription("Limiar de quarentena").setRequired(true))
        .addIntegerOption((o) => o.setName("emergencia").setDescription("Limiar de emergência").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-backup-interval")
        .setDescription("Define o intervalo entre backups automáticos (minutos).")
        .addIntegerOption((o) => o.setName("minutos").setDescription("Intervalo em minutos").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("enable-honeypot").setDescription("Cria e ativa o Modo Honeypot.")),

  async execute(interaction) {
    const existing = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    // Para set-owners, permite bootstrap inicial mesmo sem config prévia
    // (quem tem Administrator no Discord pode definir o primeiro Owner).
    const sub = interaction.options.getSubcommand();
    if (existing && !isOwnerOrCoOwner(interaction.member, existing) && sub !== "set-owners") {
      await interaction.reply({
        embeds: [dangerEmbed("Sem permissão", "Apenas o Owner ou Co-Owner podem alterar a configuração.")],
        ephemeral: true
      });
      return;
    }

    const config = await getOrCreateConfig(interaction.guild.id);

    switch (sub) {
      case "view": {
        const summary = [
          `**Owner:** ${config.ownerId ? `<@${config.ownerId}>` : "não definido"}`,
          `**Co-Owner:** ${config.coOwnerId ? `<@${config.coOwnerId}>` : "não definido"}`,
          `**Canais críticos:** ${config.criticalChannelIds.length}`,
          `**Roles protegidas:** ${config.protectedRoleIds.length}`,
          `**Roles autorizadas:** ${config.authorizedRoleIds.length}`,
          `**Canal de logs:** ${config.logChannelId ? `<#${config.logChannelId}>` : "não definido"}`,
          `**Canal de aprovações:** ${config.approvalChannelId ? `<#${config.approvalChannelId}>` : "não definido"}`,
          `**Limiares:** alerta ${config.threatThresholds.alert} / quarentena ${config.threatThresholds.quarantine} / emergência ${config.threatThresholds.emergency}`,
          `**Intervalo de backup:** ${config.backupIntervalMinutes} min`,
          `**Modo manutenção:** ${config.maintenanceMode ? "ativo" : "inativo"}`,
          `**Honeypot:** ${config.honeypot?.enabled ? "ativo" : "inativo"}`
        ].join("\n");
        await interaction.reply({ embeds: [neutralEmbed("⚙️ Configuração do Sentinel", summary)], ephemeral: true });
        return;
      }

      case "set-owners": {
        config.ownerId = interaction.options.getUser("owner").id;
        const coOwner = interaction.options.getUser("co_owner");
        if (coOwner) config.coOwnerId = coOwner.id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Owner/Co-Owner definidos")], ephemeral: true });
        return;
      }

      case "add-critical-channel": {
        const channel = interaction.options.getChannel("canal");
        if (!config.criticalChannelIds.includes(channel.id)) config.criticalChannelIds.push(channel.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Canal crítico adicionado", `<#${channel.id}>`)], ephemeral: true });
        return;
      }

      case "add-protected-role": {
        const role = interaction.options.getRole("role");
        if (!config.protectedRoleIds.includes(role.id)) config.protectedRoleIds.push(role.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Role protegida adicionada", role.name)], ephemeral: true });
        return;
      }

      case "add-authorized-role": {
        const role = interaction.options.getRole("role");
        if (!config.authorizedRoleIds.includes(role.id)) config.authorizedRoleIds.push(role.id);
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Role autorizada adicionada", role.name)], ephemeral: true });
        return;
      }

      case "set-log-channel": {
        config.logChannelId = interaction.options.getChannel("canal").id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Canal de logs definido")], ephemeral: true });
        return;
      }

      case "set-approval-channel": {
        config.approvalChannelId = interaction.options.getChannel("canal").id;
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Canal de aprovações definido")], ephemeral: true });
        return;
      }

      case "set-thresholds": {
        config.threatThresholds = {
          alert: interaction.options.getInteger("alerta"),
          quarantine: interaction.options.getInteger("quarentena"),
          emergency: interaction.options.getInteger("emergencia")
        };
        await config.save();
        await interaction.reply({ embeds: [successEmbed("✅ Limiares atualizados")], ephemeral: true });
        return;
      }

      case "set-backup-interval": {
        config.backupIntervalMinutes = interaction.options.getInteger("minutos");
        await config.save();
        await interaction.reply({
          embeds: [successEmbed("✅ Intervalo de backup atualizado", "Nota: reinicia o bot para aplicar ao agendador.")],
          ephemeral: true
        });
        return;
      }

      case "enable-honeypot": {
        const honeypotService = require("../services/honeypotService");
        await honeypotService.setupHoneypot(interaction.guild);
        await interaction.reply({
          embeds: [successEmbed("🍯 Honeypot ativado", "Role e canal-isco criados. Qualquer interação com eles dispara uma investigação.")],
          ephemeral: true
        });
        return;
      }
    }
  }
};
