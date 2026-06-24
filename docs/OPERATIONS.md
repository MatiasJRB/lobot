# Operación diaria

## Primer arranque

1. Deploy Railway + Volume `/data`.
2. Setear variables.
3. Abrir `/setup` con `SETUP_PASSWORD`.
4. Confirmar que el wizard detecta Gemini/Discord desde env.
5. Run Setup.
6. Abrir `/openclaw` y pegar/aprobar `OPENCLAW_GATEWAY_TOKEN` si lo pide.
7. En Discord, mandar mensaje al bot/canal y completar pairing si corresponde.
8. Ejecutar `POST /setup/api/configure-discord` para activar `channels.discord` sin resetear OpenClaw.
9. Ejecutar `POST /setup/api/discord/test` para confirmar que el canal recibe mensajes.
10. Ejecutar `POST /setup/api/crons/install-personal` para crear digests.

## Cron digests

Endpoint recomendado:

```text
POST /setup/api/crons/install-personal
```

Script equivalente para shell dentro del entorno OpenClaw:

```bash
scripts/install-personal-crons.sh
```

Edita si ya existen o crea si faltan:

- 09:00 ART — digest mañana.
- 15:00 ART — digest tarde.
- 21:00 ART — digest noche.

Los jobs son **OpenClaw command cron jobs**: el Gateway ejecuta
`node src/cron/run-personal-digest.js --slot <morning|afternoon|night>`, captura
stdout y lo entrega por Discord. Esto evita depender de un prompt que tenga que
decidir usar shell; el collector corre siempre.

Usa `DISCORD_PERSONAL_CHANNEL_TARGET`, por ejemplo:

```env
DISCORD_PERSONAL_CHANNEL_TARGET=channel:123456789012345678
```

## Fuentes reales

Estado de credenciales:

```text
GET /setup/api/personal/sources/status
```

Probar digest sin enviar a Discord:

```text
GET /setup/api/personal/digest?format=markdown
GET /setup/api/personal/digest?format=json
GET /setup/api/personal/digest?format=markdown&ai=1
```

CLI local/container:

```bash
node src/cron/run-personal-digest.js --slot manual --no-ai
node src/cron/run-personal-digest.js --slot morning
```

Credenciales necesarias en Railway:

- GitHub: `GITHUB_TOKEN`, `GITHUB_USERNAME=MatiasJRB`,
  `GITHUB_OWNER_ALLOWLIST=MatiasJRB`.
- Google opción A: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REFRESH_TOKEN` con scopes read-only de Gmail y Calendar.
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/calendar.readonly` para solo lectura, o `https://www.googleapis.com/auth/calendar.events` para crear/editar/borrar eventos.
- Google opción B: si ya existen tokens separados, usar:
  - Gmail: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`,
    `GMAIL_OAUTH_REFRESH_TOKEN`.
  - Calendar: `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`,
    `GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET`,
    `GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN`.

El digest collector no muta Gmail/Calendar/GitHub: no archiva, no borra, no responde y no modifica issues/PRs.

Calendar write opcional:

```bash
# Listar eventos para identificar event-id
node src/cli/calendar-event.js list --calendar-id primary --query "dentista"

# Crear evento (requiere confirmación humana previa + CALENDAR_WRITE_ENABLED=true)
node src/cli/calendar-event.js create --confirm --summary "Dentista" --start "2026-06-25T15:00:00-03:00" --end "2026-06-25T16:00:00-03:00"

# Editar o borrar
node src/cli/calendar-event.js update --confirm --event-id EVENT_ID --summary "Nuevo título"
node src/cli/calendar-event.js delete --confirm --event-id EVENT_ID
```

Nunca usar `create`, `update` o `delete` sin confirmación explícita de Matías.

## Mantenimiento

- Después de upgrades: `openclaw doctor --fix`.
- Si Discord outbound funciona pero inbound no responde, revisar que `plugins.entries.discord.enabled=true`, que `channels.discord.token` sea string plaintext redacted (no SecretRef) y que el gateway arranque con `discord` en la lista de plugins.
- Revisar `/setup/api/debug` si algo falla.
- Revisar `/setup/api/crons` para ver digests instalados.
- Revisar `/setup/api/personal/sources/status` si un digest reporta cobertura faltante.
- Revisar logs Railway si el gateway no levanta.
- Exportar backup desde `/setup` antes de cambios grandes.

## Reglas de seguridad operativa

- No subir `.env`, tokens ni exports con secretos.
- No publicar logs que contengan tokens.
- Si un secreto fue pegado en chat o repo, rotarlo.
- Cualquier acción irreversible detectada por el agente debe quedar pendiente de confirmación humana.
