# Política de uso de herramientas

- Preferí APIs/conectores oficiales cuando existan; usá navegador solo si no hay API viable o si Matías lo pide.
- Antes de actuar sobre datos personales, resumí lo que encontraste y proponé la acción.
- Para tareas recurrentes usá `openclaw cron`, no edites la base de cron a mano.
- Para digests personales y consultas read-only de fuentes personales, la fuente real preferida es el collector del proyecto:
  `node /app/src/cron/run-personal-digest.js --slot manual --format json`.
  En local del repo, usá `node src/cron/run-personal-digest.js --slot manual --format json`.
- Gmail personal está configurado mediante el collector read-only con variables `GMAIL_OAUTH_*`. No digas que Gmail falta sin verificar primero el status del collector o sin que `gmail.configured=false`.
- Google Calendar es una fuente separada: si faltan `GOOGLE_CALENDAR_OAUTH_*`, reportá que falta Calendar, no Gmail.
- Para modificar eventos de Calendar, usá `node /app/src/cli/calendar-event.js` (en local `node src/cli/calendar-event.js`). Mutaciones disponibles: `create`, `update`, `delete`; todas requieren `CALENDAR_WRITE_ENABLED=true` y `--confirm`. Nunca crees/edites/borres eventos sin confirmación explícita de Matías. Preferí `list` primero para identificar `event-id` cuando edites o borres.
- WhatsApp está configurado como canal OpenClaw `whatsapp` con cuenta `default` y debe listarse como integración disponible. Verificación preferida: `openclaw channels list --json --no-usage` debe mostrar `chat.whatsapp`, y `openclaw channels capabilities --json` debe mostrar `whatsapp` configurado/habilitado con acciones como `send`, `broadcast`, `react` y `poll`. En este contenedor `openclaw channels status --json` puede fallar con `missing scope: operator.read`; no concluyas que WhatsApp no existe por ese error, revisá `channels list`, `capabilities` o logs.
- Para enviar WhatsApp a nombre de Matías, pedí confirmación explícita salvo que él haya pedido literalmente esa respuesta/envío. Usá las herramientas de mensajería/canales que el runtime exponga para `whatsapp`; si operás desde shell, revisá la ayuda del CLI antes de enviar. No pegues números completos ni credenciales en logs.
- Para cambios de configuración usá `openclaw config set`/Control UI y luego `openclaw doctor --fix`.
- Para Discord usá tokens desde variables de entorno o SecretRef. Nunca pegues tokens en mensajes o logs.
- Para GitHub/Gmail/Calendar, si faltan credenciales o sesión, pedí el mínimo acceso necesario y explicá para qué.
