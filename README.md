# Secretario Personal — OpenClaw en Railway

Base para el secretario personal de Matías: OpenClaw desplegado en Railway,
Gemini para la capa de entrega y un puente seguro entre WhatsApp y los hilos de
Codex en la Mac.

## Qué hace esta base

- Corre OpenClaw detrás de un setup wrapper web para Railway.
- Persiste estado/workspace en `/data`.
- Usa `GEMINI_API_KEY` desde variables Railway.
- Usa `DISCORD_BOT_TOKEN` desde variables Railway con SecretRef.
- Siembra instrucciones de secretario personal en el workspace.
- Incluye collectors server-side para Gmail, Google Calendar y GitHub.
- Incluye scripts para crear/editar tres digests diarios por Discord usando
  OpenClaw command cron jobs.
- Incluye una cola durable en Railway y un worker saliente para consultar o
  disparar un hilo de Codex elegido desde WhatsApp.
- Puede programar las revisiones semanal y mensual del Sistema Operativo
  Personal en el task exacto `Secretario personal` y devolverlas al WhatsApp
  propio mediante el puente, sin pasar por Gemini.

## Documentación del proyecto

- `docs/ARCHITECTURE.md` — arquitectura y decisiones.
- `docs/RAILWAY_DEPLOYMENT.md` — variables y deploy.
- `docs/DISCORD_SETUP.md` — bot/canal/permissions.
- `docs/OPERATIONS.md` — operación diaria y cron.
- `docs/SOURCES_AND_AUTOMATION_ROADMAP.md` — fuentes personales y roadmap.
- `docs/CODEX_WHATSAPP_BRIDGE.md` — spec, arquitectura y operación del puente.

## Setup rápido

1. Deploy en Railway desde este repo.
2. Agregar Volume montado en `/data`.
3. Setear variables desde `.env.example`.
4. Abrir `/setup`, correr onboarding y luego `/openclaw`.
5. Configurar Discord pairing.
6. Ejecutar `scripts/install-personal-crons.sh` (digests) y `scripts/install-reactive-alert-cron.sh` (alertas reactivas P0/P1) cuando el gateway esté listo.
7. Agregar credenciales para Gmail/Calendar/GitHub (Calendar puede incluir write de eventos) en Railway.

## Fuentes reales

El comando de digest vive en:

```bash
node src/cron/run-personal-digest.js --slot morning
```

Ese comando:

- Lee Gmail con Gmail API metadata/snippets, sin descargar cuerpos completos.
- Lee Google Calendar para agenda próxima, cancelaciones y conflictos.
- Lee GitHub notifications/search/Actions recientes del usuario `MatiasJRB`.
- Usa Gemini para redactar/priorizar si `GEMINI_API_KEY` está disponible.
- Si Gemini falla, genera un digest determinístico para no perder avisos.

Endpoints de setup útiles:

- `GET /setup/api/personal/sources/status`
- `GET /setup/api/personal/digest?format=markdown`
- `GET /setup/api/personal/digest?format=markdown&ai=1`
- `GET /setup/api/personal/digest?format=json`

Todos requieren `SETUP_PASSWORD`.

## Puente WhatsApp ↔ Codex Mac

La API autenticada vive bajo `/bridge/api`. OpenClaw usa
`src/cli/codex-bridge.js` para listar hilos o encolar pedidos; un LaunchAgent en
la Mac ejecuta `src/bridge/worker.js`, consulta Railway mediante conexión
saliente y controla `codex app-server --stdio` localmente.

```bash
# En Railway/OpenClaw
node /app/src/cli/codex-bridge.js threads
node /app/src/cli/codex-bridge.js enqueue \
  --thread "Organiza trámites" \
  --prompt "Revisá el estado de salud y decime el próximo paso"

# En la Mac, con CODEX_BRIDGE_URL y CODEX_BRIDGE_TOKEN configurados
pnpm bridge:worker:once
```

Los selectores aceptados son `recent`, `new`, ID exacto o título/frase única.
El modo predeterminado es `read-only`; `workspace-write` debe pedirse de forma
explícita. El instalador local está en
`scripts/install-codex-bridge-launch-agent.sh`.

## Secreto Gemini

La API key real no vive en este repo. Está guardada localmente en:

```text
/Users/matiasrios/Documents/GitHub/personal-assistant-secrets/gemini-api-key-details.txt
```

Ese directorio está gitignored desde el root del workspace.

## Alertas reactivas y acciones

- **Alertas reactivas**: instalá el cron con `POST /setup/api/crons/install-reactive` (vía canónica, como los digests; el script `scripts/install-reactive-alert-cron.sh` es solo el equivalente shell). Corre `src/cron/run-reactive-alert.js` en alta frecuencia. Reusa los collectors del digest, filtra a P0 por default (`REACTIVE_ALERT_MIN_PRIORITY`) y a Gmail/Calendar (`REACTIVE_ALERT_SOURCES`; GitHub se queda en el digest) y solo avisa por señales **nuevas** — deduplica contra un store persistente (`/data/personal-reactive-state.json`), así que si no hay novedad no postea nada. Inspección sin postear:

```bash
node src/cron/run-reactive-alert.js --format json --dry-run
```

- **Acciones (reportar → actuar)**, siempre con `--confirm`:
  - Calendar: `node src/cli/calendar-event.js` (`create`/`update`/`delete`), requiere `CALENDAR_WRITE_ENABLED=true`.
  - Gmail (borradores, **nunca envía**): `node src/cli/gmail-action.js draft`, requiere `GMAIL_WRITE_ENABLED=true` y scope `gmail.compose` en el refresh token.

## Upstream/docs relevantes

- OpenClaw: https://github.com/openclaw/openclaw
- Railway: https://docs.openclaw.ai/install/railway
- Discord: https://docs.openclaw.ai/channels/discord
- Cron jobs: https://docs.openclaw.ai/automation/cron-jobs
- Model providers: https://docs.openclaw.ai/concepts/model-providers
