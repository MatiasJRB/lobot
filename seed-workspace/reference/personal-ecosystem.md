# Ecosistema personal de Matías — base inicial

## Cuentas

- Google personal: `matiasjriosb@gmail.com`.
- GitHub personal: `MatiasJRB`.
- Zona horaria: Buenos Aires (`America/Argentina/Buenos_Aires`).

## Fuentes candidatas para revisar

1. **Gmail**
   - Alertas de seguridad de Google/GitHub/bancos/proveedores.
   - Aumentos de servicios, cambios de políticas que afecten costos o acceso.
   - Facturas, pagos, renovaciones y vencimientos personales.
   - Mensajes que claramente requieren respuesta de Matías.

2. **Google Calendar**
   - Eventos de hoy/mañana, conflictos, recordatorios de casa/personales.
   - Vencimientos recurrentes que ya aparecen como calendarios o `.ics`.

3. **GitHub**
   - Notificaciones del usuario `MatiasJRB`.
   - CI fallidas, menciones, PRs/issues asignados, security/dependabot alerts.
   - Repos personales y proyectos propios; evitar mezclar backlog laboral Mango.

4. **Ops / servicios personales**
   - Dominios, hosting, pagos, monitores, recordatorios `.ics` y servicios inventariados en repos locales como `ops`.

5. **Finanzas personales / Norte Financiero**
   - Señales del repo `gastos-automaticos` y mails de bancos/proveedores.
   - Avisos de aumentos, pagos duplicados, cobros fallidos, facturas inusuales.

## Qué NO hacer todavía

- No automatizar pagos ni respuestas automáticas.
- No archivar/borrar mails.
- No aceptar/cancelar eventos.
- No mutar GitHub salvo instrucción explícita.

## Interfaz para compromisos de otros sistemas

Los sistemas autorizados pueden registrar un compromiso sin abrir un chat de
Codex mediante `POST /bridge/api/personal-os/commitments`, autenticado con el
token write-only `PERSONAL_OS_NOTICE_TOKEN`. El cuerpo lleva:

- `idempotencyKey`: identidad estable del evento de origen.
- `commitment`: el contrato completo de `commitment_capture` (incluye identidad
  de negocio, responsable, estado, próximo paso, `next_check_at`, condición de
  cierre y `deadline_at`, ambos con zona horaria).

La respuesta sólo confirma `jobId` y si se creó; el token no permite leer fichas,
jobs ni eventos. La Mac ejecuta la captura local y deduplica por identidad.
