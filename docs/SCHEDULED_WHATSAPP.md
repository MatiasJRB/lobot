# WhatsApp exacto programado en Lobot

## Dolor

Los mensajes de WhatsApp programados deben seguir funcionando aunque Codex no
esté abierto. El cron y el envío no pueden quedar repartidos entre Codex y
OpenClaw, y un reintento no debe duplicar un mensaje ya aceptado.

## Solución

Lobot expone un endpoint autenticado que crea una automatización `at` nativa de
OpenClaw. La automatización ejecuta dentro del contenedor un runner determinista
que lee destinatario y texto desde un archivo privado del volumen y envía el
texto exacto por WhatsApp, sin pasar por un modelo.

## Criterios de aceptación

- Una solicitud exige destinatario E.164, texto exacto, fecha ISO con zona,
  clave de idempotencia y confirmación explícita del envío externo.
- OpenClaw persiste un job de una sola ejecución con `--delete-after-run`.
- El cron no expone el teléfono ni el mensaje en su `argv`; sólo referencia un
  archivo privado del volumen.
- Un job aceptado no vuelve a enviarse con la misma clave de idempotencia.
- Un resultado incierto queda bloqueado y no se reintenta automáticamente.
- La respuesta de la API permite demostrar `jobId`, horario y propietario sin
  devolver teléfono ni contenido.

## Fuera de alcance

- Resolver nombres de Contactos de macOS dentro de Railway.
- Editar el texto, destinatario u horario después de la autorización.
- Reintentar automáticamente una entrega incierta.
