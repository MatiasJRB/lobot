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
entrega automáticamente al target personal salvo la excepción QA TEST siguiente.

### `@lobot` en grupo Asiento Libre · QA TEST

Alcance: **un grupo exacto**, sólo remitentes en `groupAllowFrom` (inicialmente
las variantes de Matías), mención literal `@lobot`, pregunta técnica TEST, un
hilo Codex separado y respuesta al mismo grupo únicamente con flag de envío.
No da autoridad para pagar/reembolsar, editar Supabase/MP/GitHub, publicar builds
ni operar producción. `@lobot` de un remitente no allowlisteado no entra; para
sumar a Joaquín primero identificar su identidad de WhatsApp y autorizarla
explícitamente, sin wildcard.

Railway (proyecto **lobot**, no Mango):

```env
ALI_GROUP_JID=<JID exacto del grupo Asiento Libre>
ALI_GROUP_MENTIONS_ENABLED=false
ALI_GROUP_REPLY_ENABLED=false
PERSONAL_OS_OPENCLAW_EVENTS_ENABLED=true
```

Con `ALI_GROUP_MENTIONS_ENABLED=true`, el arranque valida plugin cargado,
`groups` con una sola clave exacta y `requireMention=true` en raíz/cuenta,
`groupAllowFrom` no vacío/sin wildcard; configura `groupPolicy=allowlist` sólo
entonces. `before_dispatch` consume todos los mensajes admitidos de ese grupo,
encola sólo los `@lobot` recientes, y suprime la respuesta Gemini. El endpoint
de intake requiere el bearer existente, fuerza source/hilo/modo/target, deduplica
por ID de mensaje y limita a 12 jobs/hora. Con menciones apagadas también rechaza
POST autenticado. El flujo normal de WhatsApp propio no cambia.
La entrega automática al grupo se rotula siempre `🤖 Ali:` en la capa de salida
del puente, incluso si el modelo omite el rótulo; los mensajes personales que
Matías escribe fuera del puente no se modifican.
El hook `message_sending` cancela cualquier salida OpenClaw a ese grupo si el
flag de respuesta está apagado o si no consume un permiso privado, de un solo
uso y 60 segundos, creado por el servidor para el texto exacto `🤖 Ali:` del
job. Así una caída al modelo personal no puede enviar al grupo. Esto es una
segunda barrera de salida, no reemplaza verificar que `before_dispatch`
intercepte antes de que el modelo personal use herramientas.

Mac worker (archivo privado `~/.config/secretario-personal/codex-bridge.env`):

```env
ALI_GROUP_REPO_CWD=<checkout limpio de MatiasJRB/asiento-libre>
ALI_GROUP_CODEX_HOME=<directorio privado aislado para QA>
ALI_GROUP_CODEX_THREAD_ID=<ID creado por provision-ali-qa-thread.js>
CODEX_PATH=<binario Codex vigente de ChatGPT.app>
# Opcional: token TEST, nunca APP_USR/producción; sólo GET por payment ID explícito
ALI_QA_MP_TEST_TOKEN=<TEST-...>
```

Crear un hilo **una sola vez** con `ALI_GROUP_REPO_CWD=... ALI_GROUP_CODEX_HOME=... CODEX_PATH=... node
scripts/provision-ali-qa-thread.js`; el script verifica el remote y completa
un turno bootstrap, necesario para persistir el hilo. Crea un `CODEX_HOME`
privado `0700`, copia la credencial Codex a `auth.json` `0600` y escribe una
configuración exacta sin MCP/apps/plugins, búsqueda web, shell, hooks ni
multiagente. **No usar el ID de un hilo creado en el Codex home personal:** es
otro almacén de rollouts. Reinstalar el worker con
`scripts/install-codex-bridge-launch-agent.sh` para copiar los módulos nuevos.
La ejecución del grupo usa proceso Codex separado con entorno allowlist (sin
tokens Bridge/GitHub/MP), `approvalPolicy=never`, sandbox `readOnly` sin red y
checkout ALI fijo. Antes de consultar al modelo, el worker obtiene issues QA
#463/#490, refs de issues mencionadas y estado del GitHub Project #4 mediante
comandos `gh issue view` y `gh project item-list` de lectura. Para esas lecturas
resuelve la credencial existente de `github.com` del usuario **MatiasJRB**, verifica
su identidad vía `gh api user` y la pasa sólo a esos subprocesses. Nunca cambia
la cuenta global activa de `gh`, nunca usa como fallback el token ambiental de
otra cuenta y nunca pasa esta credencial al modelo. Si falta la credencial o la
identidad no coincide, marca GitHub/Project como indisponibles. También consulta
`engram search --project asiento-libre --limit 3` desde el worker; sus notas son
históricas, nunca evidencia del estado actual. Si una fuente no responde, se
marca indisponible; no se inventa estado. Si el mensaje nombra un `pago MP`
o `payment_id` numérico explícito y se configuró `ALI_QA_MP_TEST_TOKEN` con
prefijo `TEST-`, el worker hace sólo `GET /v1/payments/{id}` y pasa al modelo
una proyección sin datos del comprador ni token. No consulta ni modifica pagos
automáticamente fuera de ese caso. Supabase TEST no tiene adaptador automático:
no afirmar que se verificó si no hay evidencia; para agregarlo se requiere una
consulta acotada de lectura con RLS y sin SQL ni API mutable.

**Secuencia de activación**: tests → deploy del código a Railway verificado en
cuenta/workspace lobot → setear JID con ambos flags `false` → instalar worker y
verificar hilo → correr smoke local sintético con reply `false` (ningún envío)
→ inspeccionar respuesta, permisos y logs sin PII → activar menciones y observar
una mención real allowlisteada con reply `false` → sólo con autorización explícita
activar `ALI_GROUP_REPLY_ENABLED=true`. Una entrega de grupo se registra como
intentada **antes** de llamar a WhatsApp; si el proveedor devuelve resultado
incierto, no reintentar por `/jobs/:id/deliver`: revisión manual para evitar
duplicados. Los jobs completados con reply apagado o después de 30 minutos se
marcan suprimidos permanentemente: activar el flag no envía backlog. No usar
una mención real del grupo para probar el envío sin acordarlo.
El smoke local `node scripts/ali-qa-smoke.js` (con las cuatro variables `ALI_GROUP_*`
anteriores y `CODEX_PATH`) prueba hook→API→cola→Codex→resultado sin proveedor;
exige `group-replies-disabled` y salida válida. No envía WhatsApp.

**Rollback**: poner ambos flags en `false` y redeploy/restart Railway. El
arranque devuelve `groupPolicy=disabled` en raíz/cuenta; DM y `selfChatMode`
quedan intactos. Luego detener/reinstalar worker si corresponde; no borrar cola
ni hilo para evitar pérdida de evidencia. Si plugin o allowlist falla, el
arranque aborta la habilitación de grupos.

Incidente 2026-09-30: la primera mención real de Matías llegó a OpenClaw pero
`before_dispatch` no la reclamó; Gemini publicó una respuesta no deseada.
Se apagaron ambos flags y se verificó `groupPolicy=disabled` en raíz/cuenta.
No reactivar hasta probar el hook real y la segunda barrera de salida: los
tests sintéticos que llaman el handler directamente no prueban la admisión del
runtime OpenClaw.

Segunda prueba controlada 2026-09-30 (respuesta apagada): `before_dispatch`
recibió `isGroup=true` y la mención, pero su `conversationId` no era el JID del
grupo. El mapeador de OpenClaw 2026.9.2 elige el destinatario propio para ese
contexto, mientras `message_received` conserva el JID correcto; la sesión
persistida sí tiene `agent:main:whatsapp:group:<JID>`. No se creó job ni se
observó respuesta grupal ni recibo de envío. Se apagaron ambos flags y se
verificó otra vez `groupPolicy=disabled` en raíz/cuenta. El hook ahora reconoce
el JID exacto mediante la clave de sesión de grupo **y** `isGroup=true`; aún
requiere una nueva validación real autorizada antes de reactivar producción.

Validación real posterior 2026-09-30 (Joaquín avisado antes de los mensajes):
- QA 3/7, 04:27 UTC: `exactGroup=true`, `sessionGroup=true`; job
  `e78ead8a-b76a-4dcf-922f-268afbd6cdac` completado con respuesta apagada y
  supresión permanente, sin salida grupal.
- QA 4/7, 12:51 UTC: job `2a1bb124-abbc-4137-af2d-51daf5911948` completado;
  una respuesta `🤖 Ali:` entregada a las 12:52:23 UTC. GitHub/Project figuraban
  indisponibles porque el lector heredó la cuenta ambiental de otra línea.
  Se corrigió fijando la identidad MatiasJRB sólo para el lector, sin cambiar
  la cuenta global ni pasar credenciales al modelo, y se reinstaló el worker.
- QA 5/7, 13:09 UTC: job `80a1ed6b-5f94-478e-befb-2c479fea77b6` completado;
  una respuesta entregada a las 13:10:00 UTC con lectura actual de GitHub y
  Project (#463 OPEN/QA Running, #490 OPEN/Blocked), separada de memoria
  histórica. No verificó ni modificó pagos, Supabase o producción.

La captura y salida del puente quedaron verificadas con ambos flags encendidos,
un solo grupo exacto y el worker instalado. La continuidad física es distinta:
macOS registró `Clamshell Sleep` aun con alimentación AC y `caffeinate`; las
pruebas exitosas posteriores fueron con Mac accesible/tapa abierta. No se
desactivó el bloqueo de seguridad ni se validó funcionamiento con tapa cerrada.
El hilo fijado **Estación híbrida Mac + PC** lleva esa investigación; no tratar
esta validación del puente como una solución de suspensión o continuidad 24/7.

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
