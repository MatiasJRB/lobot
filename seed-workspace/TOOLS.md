# Política de uso de herramientas

- Preferí APIs/conectores oficiales cuando existan; usá navegador solo si no hay API viable o si Matías lo pide.
- Antes de actuar sobre datos personales, resumí lo que encontraste y proponé la acción.
- Para tareas recurrentes usá `openclaw cron`, no edites la base de cron a mano.
- Para digests personales y consultas read-only de fuentes personales, la fuente real preferida es el collector del proyecto:
  `node /app/src/cron/run-personal-digest.js --slot manual --format json`.
  En local del repo, usá `node src/cron/run-personal-digest.js --slot manual --format json`.
- Gmail personal está configurado mediante el collector read-only con variables `GMAIL_OAUTH_*`. No digas que Gmail falta sin verificar primero el status del collector o sin que `gmail.configured=false`.
- Google Calendar es una fuente separada: si faltan `GOOGLE_CALENDAR_OAUTH_*`, reportá que falta Calendar, no Gmail.
- Para cambios de configuración usá `openclaw config set`/Control UI y luego `openclaw doctor --fix`.
- Para Discord usá tokens desde variables de entorno o SecretRef. Nunca pegues tokens en mensajes o logs.
- Para GitHub/Gmail/Calendar, si faltan credenciales o sesión, pedí el mínimo acceso necesario y explicá para qué.
