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
- Para redactar mail, usá `node /app/src/cli/gmail-action.js draft` (en local `node src/cli/gmail-action.js draft`). **Solo crea borradores, nunca envía.** Requiere `GMAIL_WRITE_ENABLED=true`, `--confirm` y scope `gmail.compose` en el refresh token (el read-only del digest no alcanza; si da 403, falta el scope). Flujo: proponé el borrador a Matías, creá el draft con confirmación, y que él lo revise y lo mande desde Gmail. Enviar no está implementado por diseño.
- Alertas reactivas: `node /app/src/cron/run-reactive-alert.js` (en local `node src/cron/run-reactive-alert.js`) corre los collectors del digest, filtra a P0 por default (`REACTIVE_ALERT_MIN_PRIORITY`) y a Gmail/Calendar (`REACTIVE_ALERT_SOURCES`; GitHub queda en el digest), y solo avisa por señales **nuevas** — deduplica contra un store persistente para no repetir. Es lo que corre el cron de alta frecuencia; no lo edites a mano. Instalalo/actualizalo con `POST /setup/api/crons/install-reactive` (mismo patrón que los digests; el `openclaw cron` suelto por shell falla con `missing scope: operator`). El script `scripts/install-reactive-alert-cron.sh` es solo el equivalente shell dentro del entorno OpenClaw. Para inspeccionar sin postear: `--format json --dry-run`.
- WhatsApp está configurado como canal OpenClaw `whatsapp` con cuenta `default` y debe listarse como integración disponible. Verificación preferida: `openclaw plugins list --json` debe mostrar el plugin `whatsapp` `loaded/enabled`, y `openclaw channels capabilities --channel whatsapp --account default --json` debe mostrar `configured=true`, `enabled=true` y acciones como `send`, `broadcast`, `react` y `poll`. No uses `openclaw channels list` como fuente de verdad: en esta versión puede devolver “no configured chat channels” u ocultar WhatsApp/Discord aunque el gateway los tenga cargados. `openclaw channels status --json` también puede fallar con `missing scope: operator.read`; no concluyas que WhatsApp no existe por esos falsos negativos.
- WhatsApp inbound safety: mantené `channels.whatsapp.dmPolicy="allowlist"` y `channels.whatsapp.accounts.default.dmPolicy="allowlist"` **solo** con las variantes allowlisteadas de Matías, `selfChatMode=true`, `groupPolicy="disabled"` y `configWrites=false`. `groupAllowFrom` puede quedar vacío o con las mismas variantes allowlisteadas de Matías por migración automática, pero nunca debe tener wildcard ni abrir grupos. Nunca cambies `allowFrom` a `"*"`, `dmPolicy` a `"open"`, ni agregues un tercero a `allowFrom` solo para poder mandar un mensaje. Si un envío falla porque el target no está en allowlist, no “sortear” la política: explicá que está bloqueado y pedí autorización explícita para ese contacto y ese alcance.
- Gateway health en Railway: la fuente de verdad es `curl https://tu-instalacion.example.com/setup/healthz` (`gatewayRunning=true` y `gatewayReachable=true`) más logs recientes con `http server listening` / `Listening for WhatsApp inbound messages`. No uses `channels capabilities[].plugin.status.defaultRuntime.healthState` para declarar gateway detenido; puede aparecer `stopped` como metadata/default runtime aunque el gateway real esté vivo. Si faltan herramientas como `gateway`, `message` o `whatsapp_login`, revisá que `/data/.openclaw/openclaw.json` tenga `tools.profile="full"` y no `coding`.
- Para enviar WhatsApp a nombre de Matías, pedí confirmación explícita salvo que él haya pedido literalmente esa respuesta/envío. Usá las herramientas de mensajería/canales que el runtime exponga para `whatsapp`; si operás desde shell, revisá la ayuda del CLI antes de enviar. No pegues números completos ni credenciales en logs.
- Para cambios de configuración usá `openclaw config set`/Control UI y luego `openclaw doctor --fix`.
- Para Discord usá tokens desde variables de entorno o SecretRef. Nunca pegues tokens en mensajes o logs.
- Para GitHub/Gmail/Calendar, si faltan credenciales o sesión, pedí el mínimo acceso necesario y explicá para qué.
- Puente Codex Mac: cuando Matías pida consultar o disparar un hilo de Codex,
  usá la CLI determinista y no intentes resolver la tarea con Gemini. Para ver
  destinos: `node /app/src/cli/codex-bridge.js threads`. Para encolar:
  `node /app/src/cli/codex-bridge.js enqueue --thread "<recent|new|id|título>" --prompt "<pedido exacto>" --idempotency-key "<id estable del mensaje inbound>"`.
  El selector por título debe ser inequívoco; si la CLI o el resultado devuelve
  candidatos, mostráselos a Matías para que elija. Usá `read-only` por defecto y
  agregá `--mode workspace-write` sólo cuando Matías pida expresamente modificar
  archivos. El resultado vuelve automáticamente a su WhatsApp: no sostengas una
  espera larga dentro del turno de Gemini.
- Base de conocimiento personal: cuando Matías pregunte qué sabemos, recuerde un
  dato previo o quiera consultar el Knowledge Hub, usá primero la herramienta
  nativa `knowledge_search` y respondé en el mismo turno con el resultado y sus
  fuentes. Si esa herramienta no está disponible en el contexto actual, usá como
  fallback síncrono
  `node /app/src/cli/codex-bridge.js knowledge --query "<consulta exacta>" --idempotency-key "<id estable del mensaje inbound>" --wait --no-reply`
  y respondé con la salida del comando. La consulta se resuelve de forma local y
  read-only en la Mac, excluye páginas `restricted` y propuestas no verificadas.
  No uses el comando sin `--wait` durante una conversación: eso enviaría una
  segunda respuesta asíncrona por WhatsApp y dejaría el turno actual sin la fuente.
  No la mandes a un task de Codex ni inventes una respuesta desde historial o
  memoria si la consulta falla.
- Registro de compromisos: para compras, entregas, devoluciones, turnos,
  procedimientos, reclamos o trámites materiales usá la herramienta nativa
  `commitment_capture`. Requiere una identidad estable, `deadline_at` y
  `next_check_at` ISO-8601 con zona horaria, además de responsable, estado,
  próximo paso y condición de cierre. La operación es idempotente por identidad:
  nunca inventes otra ficha para el mismo pedido/caso. Si la herramienta falla,
  decilo; la falla queda visible en Personal OS. Esta herramienta sólo registra
  seguimiento: no envía, compra, paga ni cierra el asunto.
- Contador autónomo: los cron instalados por
  `POST /setup/api/crons/install-accountant` ejecutan
  `node /app/src/cron/dispatch-accountant.js --cadence <monitor|billing|payment>`
  y no dependen de mensajes inbound. Para una consulta manual de Matías, encolá
  el pedido al task exacto `Investigar reemplazo del contador`; usá read-only
  para consultar y `workspace-write` solo cuando el pedido requiera actualizar
  artefactos locales. OpenClaw nunca emite, paga, reasigna, presenta ni responde
  comunicaciones fiscales por sí mismo.
