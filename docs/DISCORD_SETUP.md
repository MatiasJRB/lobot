# Discord setup para Clawbot Personal

Docs base: https://docs.openclaw.ai/channels/discord

## Crear bot

1. Ir a https://discord.com/developers/applications.
2. New Application: `Clawbot Personal`.
3. Bot → Add Bot.
4. Reset Token → guardar como `DISCORD_BOT_TOKEN` en Railway.
5. Copiar Application ID → guardar como `DISCORD_APPLICATION_ID` en Railway.
6. Privileged Gateway Intents:
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

## Activar en OpenClaw sin resetear setup

Cuando el setup base ya está configurado, no uses `/setup/api/run` para Discord
porque ese endpoint no rerunea onboarding. Usá los endpoints idempotentes del
wrapper. El wrapper además habilita explícitamente `plugins.entries.discord.enabled=true`
y escribe `channels.discord.token` como valor plaintext tomado de `DISCORD_BOT_TOKEN`
(en los logs sale redacted): en este deploy el monitor inbound de Discord no puede
resolver el token si queda como SecretRef.

```bash
# Configura channels.discord desde variables Railway/env y reinicia gateway.
POST /setup/api/configure-discord

# Envía un mensaje de prueba al target Discord configurado.
POST /setup/api/discord/test

# Instala los 3 digests diarios si todavía no existen.
POST /setup/api/crons/install-personal

# Lista crons.
GET /setup/api/crons
```

Todos requieren Basic Auth con `SETUP_PASSWORD`.

## Seguridad

- Usar un token nuevo; no reutilizar webhooks/tokens viejos encontrados en repos.
- En Railway usar variable `DISCORD_BOT_TOKEN`; el wrapper la copia a `channels.discord.token` como plaintext redacted para que el listener inbound arranque. No imprimir el token y rotarlo si se filtra.
- Para el servidor privado personal actual, mantener `groupPolicy=open`, `dmPolicy=allowlist` y `allowFrom` limitado a `DISCORD_OWNER_USER_ID`.
