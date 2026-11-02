# Avisos silenciosos al Secretario Personal

Los sistemas productores **no** deben usar `send_message_to_thread` ni `/bridge/api/jobs` para informar novedades: eso abre/interrumpe tareas Codex. Este canal es asíncrono, no envía WhatsApp y no modifica fichas.

## Publicar

`POST https://tu-instalacion.example.com/bridge/api/personal-os/notices`

Autenticación: `Authorization: Bearer <PERSONAL_OS_NOTICE_TOKEN>`, credencial de **sólo escritura**. No utilizar `CODEX_BRIDGE_TOKEN` en productores. El cuerpo JSON acepta exactamente:

```json
{
  "source": "nombre-estable-del-sistema",
  "eventId": "id-estable-del-hecho",
  "title": "Título breve",
  "summary": "Qué ocurrió y qué falta verificar",
  "occurredAt": "2026-09-17T12:00:00Z",
  "importance": "normal",
  "cardId": "id-exacto-opcional"
}
```

`source`, `eventId`, `title`, `summary`, `occurredAt` son obligatorios. `importance` es `normal` (por defecto) o `high`; `cardId` sólo es una pista. Respuesta `202 {ok:true,id,created:true}`; un reintento idéntico devuelve `200 created:false`; el mismo ID con otro contenido devuelve `400`. Para reintentos, conservar exactamente el mismo evento y fecha. No enviar secretos, transcripciones ni datos financieros innecesarios en `summary`.

En la Mac, usar `/home/usuario/Documents/Codex/personal-organization/bin/avisar-secretario`; lee la URL y la credencial de `~/.config/secretario-personal/notice-client.json` (0600). El skill personal `avisar-secretario` enseña este flujo a otros agentes Codex.

## Recepción y límites

Railway guarda un outbox privado `/data/personal-os-notices.ndjson` (0600). `GET /bridge/api/personal-os/notices?cursor=0&limit=50` exige la credencial administrativa `CODEX_BRIDGE_TOKEN`, y sólo el worker Mac lo consulta. El worker ingiere registros en `personal-os.sqlite3.system_notices`, avanza el cursor duradero **después** de la transacción local y regenera `reviews/executive-inbox-current.html`. Los avisos se muestran en “Avisos de otros sistemas” como **no verificados**. El secretario puede consultar `personal-os system-notices` y marcar uno revisado con `personal-os review-system-notice <id>` después de procesarlo.

Ni la publicación ni la ingesta inician una tarea Codex, despiertan el chat, acreditan evidencia, cierran una ficha, autorizan pagos ni mandan mensajes. La revisión humana/secretarial decide cómo contrastar cada aviso con su fuente.
