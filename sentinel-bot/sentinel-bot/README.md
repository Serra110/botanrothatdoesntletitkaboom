# Sentinel — Bot de Segurança para Discord

Estrutura completa e funcional do bot descrito no documento de especificação: monitorização em tempo real, Threat Score, deteção de privilege escalation, sistema de aprovação, canais/roles protegidos, modo de emergência, lockdown, quarentena, backups automáticos, rollback, integrity check, anti-raid, dashboard/logs forenses, modo de manutenção, simulação e um **Modo Honeypot** (bónus).

> Este scaffold implementa toda a arquitetura e a lógica principal de cada módulo. Alguns comportamentos (ex: reconstrução best-effort de rollback, deteção via audit log) têm limitações inerentes à API do Discord — ver notas em "Limitações conhecidas".

## Stack

- **Node.js 18+** com **discord.js v14**
- **MongoDB** (via Mongoose) para configuração, threat scores, incidentes, backups, quarentenas e pedidos de aprovação
- **node-cron** para backups automáticos e verificações de integridade periódicas

## Estrutura do projeto

```
sentinel-bot/
  src/
    index.js                 # bootstrap do bot
    config/defaults.js        # configuração por defeito por servidor
    database/connect.js       # ligação MongoDB
    models/                   # schemas Mongoose
      GuildConfig.js
      ThreatScore.js
      Incident.js
      Backup.js
      Quarantine.js
      ApprovalRequest.js
    events/                   # listeners do Discord (secção 1)
      channelEvents.js
      roleEvents.js
      memberEvents.js
      webhookEvents.js
      emojiStickerEvents.js
      inviteEvents.js
      interactionEvents.js
      index.js
    services/                 # lógica de negócio
      threatScoreService.js       # secção 2
      responsibilityChain.js      # secções 3 e 10
      approvalService.js          # secção 4
      quarantineService.js        # secção 9
      lockdownService.js          # secção 8
      emergencyService.js         # secção 7
      backupService.js            # secção 11
      rollbackService.js          # secção 12
      integrityCheckService.js    # secção 13
      antiRaidService.js          # secção 14
      honeypotService.js          # funcionalidade bónus
      forensicsLogger.js          # secção 16
    commands/                 # comandos slash (secção 19)
      emergency.js, lockdown.js, rollback.js, backup.js,
      simulate.js, maintenance.js, quarantine.js,
      unquarantine.js, logs.js, config.js, deploy-commands.js
    utils/
      logger.js, permissions.js, embeds.js, auditLog.js
```

## Instalação

1. Cria uma aplicação em https://discord.com/developers/applications, ativa o bot e copia o **Token** e o **Client ID**.
2. Ativa os seguintes **Privileged Gateway Intents**: `Server Members Intent` (e `Message Content Intent` se quiseres inspecionar mensagens).
3. Convida o bot ao servidor com permissões de Administrator (ou, no mínimo: Manage Channels, Manage Roles, Manage Guild, Manage Webhooks, Manage Emojis and Stickers, Kick Members, Ban Members, Moderate Members, View Audit Log).

```bash
cd sentinel-bot
npm install
cp .env.example .env
# preenche DISCORD_TOKEN, CLIENT_ID e MONGODB_URI no .env
npm run deploy-commands   # regista os comandos slash
npm start
```

4. No servidor, corre `/config set-owners` para definires o Owner/Co-Owner, depois configura canais críticos, roles protegidas/autorizadas, canal de logs e canal de aprovações com os restantes subcomandos de `/config`.

## Comandos disponíveis

| Comando | Descrição |
|---|---|
| `/emergency start\|stop` | Força ou desativa a emergência |
| `/lockdown on\|off` | Ativa/desativa o lockdown manualmente |
| `/rollback list\|restore` | Lista e restaura backups |
| `/backup create\|list` | Cria/lista backups manuais |
| `/simulate` | Testa os subsistemas sem alterar o servidor |
| `/maintenance start\|end` | Ativa/desativa modo de manutenção |
| `/quarantine` | Coloca um membro em quarentena |
| `/unquarantine` | Remove a quarentena (inocente ou culpado) |
| `/logs incident <id>` | Mostra o resumo de um incidente |
| `/config ...` | Painel de configuração completo |

## Modo Honeypot (funcionalidade extra)

`/config enable-honeypot` cria uma role e um canal-isco, invisíveis para membros legítimos e sem qualquer uso real. Qualquer tentativa de os editar, apagar, ou conceder a alguém é tratada pelos event handlers (`channelEvents`, `roleEvents`) como fortíssimo indicador de conta comprometida, disparando imediatamente uma emergência.

## Limitações conhecidas (honestidade técnica)

- **"Bloquear" ações em tempo real**: o Discord não permite que um bot literalmente impeça uma ação de outro utilizador antes de ela acontecer (não há "pre-hook"). O lockdown funciona removendo permissões de gestão das roles não autorizadas (impedindo novas ações) e o sistema de aprovação intercepta ações que o próprio bot executaria (ex: apagar um canal via comando do bot). Ações feitas diretamente por alguém com permissões nativas do Discord são detetadas e revertidas/punidas *a posteriori*, via audit log — não bloqueadas antes do facto.
- **Audit log**: é a única forma de saber "quem fez o quê" — tem uma pequena latência e, em casos raros de múltiplas ações quase simultâneas, a correspondência pode falhar.
- **Rollback**: reconstrói canais/categorias/roles em falta e as suas propriedades básicas; não restaura o histórico de mensagens além do que foi explicitamente guardado nos canais configurados para backup de mensagens.
- **MongoDB → PostgreSQL**: a spec refere migração futura; a camada de acesso a dados está isolada em `models/`, facilitando a troca de driver mais tarde.

## Próximos passos sugeridos

- Adicionar um dashboard web (ex: Next.js) que consuma os mesmos modelos Mongoose para visualizar incidentes graficamente.
- Testes automatizados (Jest) para os serviços de threat score e responsibility chain.
- Sharding se o bot vier a operar em muitos servidores grandes simultaneamente.
