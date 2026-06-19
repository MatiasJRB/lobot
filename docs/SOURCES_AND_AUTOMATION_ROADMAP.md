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

Implementación candidata:

- `GITHUB_TOKEN` como variable Railway.
- Script o MCP que consulte API de GitHub y entregue JSON al agente.
- Clasificación P0/P1/P2/P3 por OpenClaw.

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

Implementación candidata:

- OAuth Google restringido a `matiasjriosb@gmail.com`.
- Scopes mínimos: Gmail read-only + Calendar read-only al inicio.
- No enviar/archivar/borrar mails hasta una fase posterior con confirmación explícita.

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
