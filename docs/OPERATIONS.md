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

## Cron reactivo

Endpoint recomendado (mismo patrón que los digests; instala/actualiza un único
job de alta frecuencia):

```text
POST /setup/api/crons/install-reactive
```

El job corre `node src/cron/run-reactive-alert.js`: reusa los collectors, filtra
a P0 y a Gmail/Calendar por default (`REACTIVE_ALERT_MIN_PRIORITY` /
`REACTIVE_ALERT_SOURCES`) y solo entrega cuando hay una señal **nueva**
(dedup persistente en `/data`). Schedule por `REACTIVE_ALERT_CRON` (default
`*/15 * * * *`). El script `scripts/install-reactive-alert-cron.sh` es el
equivalente shell, pero `openclaw cron` suelto por ssh falla con
`missing scope: operator`; usá el endpoint.

## Revisiones del Sistema Operativo Personal

El endpoint siguiente crea o actualiza dos command crons silenciosos:

```text
POST /setup/api/crons/install-personal-os
```

- Domingo 18:30 ART — revisión semanal.
- Día 1 de cada mes, 18:30 ART — cierre mensual.

Cada cron ejecuta `src/cron/dispatch-codex-review.js`, encola un job idempotente
en el task exacto `Secretario personal` y fija como directorio de trabajo
`/Users/matiasrios/Documents/Codex/personal-organization`. El worker Mac realiza
la revisión, actualiza las fuentes locales y el puente entrega el resultado al
WhatsApp propio de Matías. OpenClaw usa `--no-deliver` para no duplicar el
mensaje ni involucrar a Gemini.

Antes de redactar la salida, el job ejecuta `bin/personal-os brief`: horizonte
de 168 horas para la revisión semanal y 744 horas para la mensual, con hasta
cuatro decisiones independientes. Los bloqueados, diferidos y tombstones no
entran en la bandeja.

La instalación habilita una automatización de mensajería personal. Antes de
invocar el endpoint se debe aprobar el contrato de canal, audiencia, plantilla,
variables y frecuencia. Una ejecución nunca autoriza mensajes a terceros,
pagos, compras, reservas, contrataciones ni formularios.

El endpoint exige este cuerpo para demostrar esa aprobación:

```json
{
  "confirmMessagingContract": true,
  "messagingContractVersion": "2026-09-12-v1"
}
```

Prueba sin instalar el cron (encola una revisión real):

```bash
node src/cron/dispatch-codex-review.js --cadence weekly
```

## Contador autónomo por excepción

El endpoint siguiente instala o actualiza tres command crons silenciosos:

```text
POST /setup/api/crons/install-accountant
```

- Días hábiles 09:00 y 17:00 ART — monitoreo fiscal y DFE.
- Día 1 a las 09:00 ART — conciliación y bandeja mensual de facturas.
- Días 18, 21 y 23 a las 09:00 ART — vencimiento y aplicación del pago.

Cada cron ejecuta `src/cron/dispatch-accountant.js`, encola un job idempotente
en el task exacto `Investigar reemplazo del contador` y fija como directorio de
trabajo `/Users/matiasrios/Documents/GitHub/ops`. OpenClaw no entrega el stdout
del comando: la respuesta final vuelve exclusivamente por el bridge.

Los jobs de monitoreo y pago usan `reply.policy=actionable-only`. Una respuesta
final exacta `DONT_NOTIFY` queda registrada como entregada, pero no genera un
WhatsApp. Facturación siempre devuelve una única bandeja mensual, aunque solo
sea para confirmar que el período quedó conciliado.

La instalación habilita una automatización de mensajería fiscal al WhatsApp
propio. Antes de invocar el endpoint se debe aprobar el contrato completo de
`docs/ACCOUNTANT_AUTOPILOT.md`. El endpoint exige:

```json
{
  "confirmMessagingContract": true,
  "messagingContractVersion": "2026-09-12-v1"
}
```

Prueba de encolado sin instalar cron ni entregar el resultado:

```bash
node src/cron/dispatch-accountant.js --cadence monitor
```

No pausar las automatizaciones equivalentes de Codex hasta verificar un ciclo
end-to-end OpenClaw → bridge → task fiscal → WhatsApp propio.

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

## Puente WhatsApp ↔ Codex Mac

Variables Railway:

```env
CODEX_BRIDGE_TOKEN=<secreto aleatorio compartido>
CODEX_BRIDGE_STATE_DIR=/data
WHATSAPP_PERSONAL_TARGET=<destino personal ya configurado>
```

Archivo local `~/.config/secretario-personal/codex-bridge.env` (modo `0600`):

```env
CODEX_BRIDGE_URL=https://<servicio-railway>/bridge/api
CODEX_BRIDGE_TOKEN=<mismo secreto>
CODEX_BRIDGE_WORKER_ID=matias-mac
CODEX_PATH=/ruta/absoluta/a/codex
CODEX_BRIDGE_NODE_PATH=/ruta/absoluta/a/node
CODEX_BRIDGE_DEFAULT_CWD=/Users/matiasrios/Documents/GitHub
```

Instalar o reinstalar el worker:

```bash
chmod +x scripts/run-codex-bridge-worker.sh scripts/install-codex-bridge-launch-agent.sh
scripts/install-codex-bridge-launch-agent.sh
launchctl print gui/$UID/com.geome7ric.secretario.codex-bridge
```

Probar la API/worker sin WhatsApp:

```bash
node src/cli/codex-bridge.js threads
node src/cli/codex-bridge.js enqueue --thread "recent" --prompt "Respondé solamente: puente listo" --no-reply
node src/bridge/worker.js --once
node src/cli/codex-bridge.js status --job-id <job-id>
```

El instalador copia el runtime mínimo a `~/.local/lib` para que LaunchAgent no
dependa del acceso protegido de macOS a `Documents`. El inventario de hilos
expira si el worker no manda heartbeat. Un trabajo
`running` puede ser reclamado por otro worker sólo cuando vence su lease. Para
reintentar únicamente la entrega de un resultado ya calculado, usar:

```text
POST /bridge/api/jobs/<job-id>/deliver
```

No exponer Codex App Server: el worker siempre inicia la conexión desde la Mac.
El bridge rechaza `danger-full-access`, usa `read-only` por defecto y sólo
entrega automáticamente al target personal.

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
