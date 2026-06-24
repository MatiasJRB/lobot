# Secretario Personal — OpenClaw en Railway

Base para el secretario personal de Matías: OpenClaw desplegado en Railway, Gemini como modelo inicial y Discord como canal de avisos.

## Qué hace esta base

- Corre OpenClaw detrás de un setup wrapper web para Railway.
- Persiste estado/workspace en `/data`.
- Usa `GEMINI_API_KEY` desde variables Railway.
- Usa `DISCORD_BOT_TOKEN` desde variables Railway con SecretRef.
- Siembra instrucciones de secretario personal en el workspace.
- Incluye collectors server-side para Gmail, Google Calendar y GitHub.
- Incluye scripts para crear/editar tres digests diarios por Discord usando
  OpenClaw command cron jobs.

## Documentación del proyecto

- `docs/ARCHITECTURE.md` — arquitectura y decisiones.
- `docs/RAILWAY_DEPLOYMENT.md` — variables y deploy.
- `docs/DISCORD_SETUP.md` — bot/canal/permissions.
- `docs/OPERATIONS.md` — operación diaria y cron.
- `docs/SOURCES_AND_AUTOMATION_ROADMAP.md` — fuentes personales y roadmap.

## Setup rápido

1. Deploy en Railway desde este repo.
2. Agregar Volume montado en `/data`.
3. Setear variables desde `.env.example`.
4. Abrir `/setup`, correr onboarding y luego `/openclaw`.
5. Configurar Discord pairing.
6. Ejecutar `scripts/install-personal-crons.sh` cuando el gateway esté listo.
7. Agregar credenciales read-only para Gmail/Calendar/GitHub en Railway.

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

## Secreto Gemini

La API key real no vive en este repo. Está guardada localmente en:

```text
/Users/matiasrios/Documents/GitHub/personal-assistant-secrets/gemini-api-key-details.txt
```

Ese directorio está gitignored desde el root del workspace.

## Upstream/docs relevantes

- OpenClaw: https://github.com/openclaw/openclaw
- Railway: https://docs.openclaw.ai/install/railway
- Discord: https://docs.openclaw.ai/channels/discord
- Cron jobs: https://docs.openclaw.ai/automation/cron-jobs
- Model providers: https://docs.openclaw.ai/concepts/model-providers
