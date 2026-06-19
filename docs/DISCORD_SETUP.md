# Discord setup para Clawbot Personal

Docs base: https://docs.openclaw.ai/channels/discord

## Crear bot

1. Ir a https://discord.com/developers/applications.
2. New Application: `Clawbot Personal`.
3. Bot → Add Bot.
4. Reset Token → guardar como `DISCORD_BOT_TOKEN` en Railway.
5. Privileged Gateway Intents:
   - Message Content Intent: requerido.
   - Server Members Intent: recomendado si se usan allowlists por servidor/canal.
   - Presence Intent: no necesario para MVP.

## Invitar a servidor privado

OAuth2 → URL Generator:

Scopes:

- `bot`
- `applications.commands`

Permisos mínimos:

- View Channels
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Add Reactions (opcional)
- Send Messages in Threads (si se usan threads)

## Canal sugerido

Crear un canal privado, por ejemplo:

```text
#asistente-personal
```

Copiar IDs con Developer Mode:

- Server ID → `DISCORD_GUILD_ID`
- Channel ID → `DISCORD_PERSONAL_CHANNEL_ID`
- User ID de Matías → `DISCORD_OWNER_USER_ID`

## Seguridad

- Usar un token nuevo; no reutilizar webhooks/tokens viejos encontrados en repos.
- En Railway usar variable `DISCORD_BOT_TOKEN`; el wrapper configura OpenClaw con SecretRef para no guardar plaintext si no pegás el token en la UI.
- Mantener `dmPolicy=pairing` y `groupPolicy=allowlist`.
