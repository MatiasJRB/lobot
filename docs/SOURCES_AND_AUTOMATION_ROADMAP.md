# Fuentes y roadmap de automatizaciones personales

## MVP

- OpenClaw + Gemini + Discord.
- Workspace con instrucciones de secretario personal.
- Digests diarios por cron.
- Alertas reactivas manuales/por webhook cuando exista fuente entrante.

## Fase 1 — GitHub personal

Objetivo: detectar trabajos pendientes y eventos importantes.

Señales:

- Notificaciones del usuario `MatiasJRB`.
- PRs/issues asignados o mencionados.
- CI fallidas en repos personales.
- Security/dependabot alerts si hay acceso.

Implementación MVP actual:

- `GITHUB_TOKEN` como variable Railway.
- `src/personal/github.js` consulta API REST de GitHub:
  - notificaciones privadas si hay token;
  - `review-requested`, `assignee`, `mentions` por Search API;
  - workflow runs fallidos recientes en repos de `GITHUB_OWNER_ALLOWLIST`.
- `src/cron/run-personal-digest.js` junta señales y las entrega al cron.

## Fase 2 — Gmail y Calendar

Objetivo: detectar qué tiene que atender Matías.

Señales Gmail:

- Seguridad/cuentas.
- Bancos, tarjetas, proveedores, aumentos, vencimientos, facturas.
- Correos que requieren respuesta.
- Cambios de política con impacto práctico.

Señales Calendar:

- Agenda de hoy/mañana.
- Conflictos.
- Recordatorios domésticos/personales.

Implementación MVP actual:

- OAuth Google restringido a `matiasjriosb@gmail.com`.
- Scopes mínimos: Gmail read-only + Calendar read-only.
- El collector acepta un único `GOOGLE_OAUTH_*` con ambos scopes o credenciales
  separadas por servicio (`GMAIL_OAUTH_*` y `GOOGLE_CALENDAR_OAUTH_*`).
- `src/personal/gmail.js` lee metadata/snippets recientes, no cuerpos completos.
- `src/personal/calendar.js` lee eventos próximos/cancelados y detecta conflictos.
- No enviar/archivar/borrar mails hasta una fase posterior con confirmación explícita.

Pendiente:

- Alta/rotación guiada de OAuth refresh token.
- Alertas reactivas P0/P1 además del digest programado.
- Mejor deduplicación entre corridas y memoria de “ya avisado”.

## Fase 3 — Ops y finanzas personales

Objetivo: automatizar lo repetible.

Señales:

- Inventario de servicios/dominios/pagos del repo `ops`.
- Norte Financiero/gastos desde `gastos-automaticos`.
- Monitores/renovaciones/ICS.

Automatizaciones candidatas:

- Avisos de dominios próximos a vencer.
- Avisos de gastos inusuales o aumentos.
- Healthchecks de servicios personales.
- Resúmenes financieros semanales.
