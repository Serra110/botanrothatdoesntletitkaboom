# Sentinel Bot

Discord security bot — prevention, incident response, and automatic recovery.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and fill in your values
cp .env.example .env

# 3. Deploy slash commands to Discord
npm run deploy

# 4. Start the bot
npm run bot
```

## npm Scripts

| Script | Description |
|---|---|
| `npm run bot` | Start the bot |
| `npm start` | Start the bot (alias) |
| `npm run deploy` | Deploy/update slash commands |
| `npm run dev` | Start with file watching (dev mode) |

## .env Configuration

```env
# Required
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
MONGODB_URI=mongodb://127.0.0.1:27017/sentinel

# Owner/Co-Owner (Discord user IDs)
OWNER_ID=123456789012345678
CO_OWNER_ID=987654321098765432

# Critical channels (comma-separated IDs) — deleting these triggers emergency
CRITICAL_CHANNELS=1111111111,2222222222

# Admin roles to strip during emergency (comma-separated role IDs)
ADMIN_ROLES_TO_REMOVE=3333333333,4444444444

# Trusted roles — never affected by emergency/lockdown (comma-separated role IDs)
TRUSTED_ROLES=5555555555,6666666666

# Chat saving (comma-separated channel IDs)
SAVE_CHANNELS=7777777777,8888888888
EXCLUDE_CHANNELS=
CHAT_SAVE_LOCAL_PATH=./chat-logs

# Environment
NODE_ENV=development
```

## Slash Commands

| Command | Description |
|---|---|
| `/config view` | Show current configuration |
| `/config add-protected-role` | Add a protected role |
| `/config add-authorized-role` | Add a lockdown-authorized role |
| `/config set-log-channel` | Set the log channel |
| `/config set-approval-channel` | Set the approval channel |
| `/config set-thresholds` | Set threat score thresholds |
| `/config set-backup-interval` | Set backup interval (minutes) |
| `/config enable-honeypot` | Create and enable honeypot |
| `/backup create` | Create manual backup |
| `/backup list` | List available backups |
| `/rollback list` | List backups for rollback |
| `/rollback restore` | Restore a specific backup |
| `/emergency start` | Activate emergency mode |
| `/emergency stop` | Deactivate emergency mode |
| `/lockdown on` | Enable lockdown |
| `/lockdown off` | Disable lockdown |
| `/quarantine` | Quarantine a member |
| `/unquarantine` | Remove quarantine |
| `/logs incident` | View incident details |
| `/simulate` | Run security simulation |

## Features

- **Threat Score** — tracks suspicious actions, auto-escalates to quarantine/emergency
- **Emergency Mode** — strips admin roles, quarantines responsible users, locks down server, triggers rollback
- **Lockdown** — blocks all chat and management permissions for non-authorized roles
- **Auto-Backup** — periodic server state snapshots with configurable interval
- **Rollback** — restore server to previous state after incident
- **Integrity Check** — compares current state against last backup
- **Honeypot** — fake admin role/channel that triggers alert on interaction
- **Chat Logging** — saves messages from configured channels locally
- **Forensic Logs** — detailed audit trail for every action
