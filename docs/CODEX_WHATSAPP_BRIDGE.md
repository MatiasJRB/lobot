# Puente WhatsApp ↔ Codex Mac

## Spec

### Dolor

Matías usa Codex Mac como plano de control de su secretario personal, pero también
necesita consultar o disparar trabajo desde WhatsApp sin perder el contexto de los
hilos locales ni depender de automatización visual de la aplicación.

### Solución MVP

Construir un puente bidireccional con tres piezas:

1. una cola durable autenticada en el servicio Railway;
2. un worker saliente en la Mac que controla Codex App Server por `stdio`;
3. una CLI disponible para OpenClaw que lista hilos y encola un pedido para un
   hilo elegido.

El selector de hilo debe aceptar:

- `recent`: hilo más recientemente actualizado;
- `new`: crear un hilo persistente nuevo;
- un ID exacto;
- un título exacto, prefijo de título o fragmento único de título.

Si un título es ambiguo, el trabajo debe fallar sin disparar ningún turno y
devolver candidatos. La respuesta final queda guardada en la cola y, cuando el
pedido viene del chat personal, vuelve al WhatsApp de Matías.

### Criterios de aceptación

- OpenClaw puede consultar los hilos visibles por Codex App Server sin conocer
  archivos locales ni credenciales de Codex.
- Un pedido conserva `jobId`, selector, prompt, modo, estado y timestamps en
  almacenamiento persistente.
- Dos pedidos con la misma clave de idempotencia no crean dos trabajos.
- Un worker puede tomar un solo trabajo mediante lease; un lease vencido vuelve
  a estar disponible.
- La selección por ID, título exacto, prefijo o fragmento único es determinista.
- Un selector ambiguo no elige silenciosamente un hilo.
- `new` crea un hilo; el resto reanuda el hilo elegido.
- El resultado final se extrae del `turn/completed` real y se publica en Railway.
- La Mac sólo inicia conexiones salientes; no se expone Codex App Server a
  Internet.
- El modo por defecto es `read-only`. `workspace-write` debe pedirse
  explícitamente. `danger-full-access` no forma parte del puente.
- El canal de respuesta automático sólo puede ser el WhatsApp personal
  configurado; nunca un tercero.
- Hay tests unitarios e integración HTTP para cola, autenticación y selectores.

### Fuera de alcance

- Controlar la UI de Codex Mac con clicks.
- Exponer WebSocket de Codex App Server fuera de la Mac.
- Aprobar automáticamente pagos, reservas o comunicaciones externas.
- Enviar respuestas automáticas a contactos de WhatsApp distintos de Matías.

## Plan

### Railway

- Persistir `codex-bridge-state.json` en `/data`.
- Exponer endpoints Bearer para crear, consultar, reclamar y completar trabajos,
  registrar workers y listar hilos.
- Entregar por WhatsApp personal el resultado de trabajos que lo soliciten.

### Mac

- Ejecutar `codex app-server --stdio` como hijo del worker.
- Inicializar JSON-RPC, listar hilos, resolver el selector y ejecutar
  `thread/resume`/`thread/start` + `turn/start`.
- Registrar inventario de hilos y heartbeat en Railway.
- Instalar el worker como LaunchAgent para que sobreviva reinicios de sesión.

### OpenClaw

- Incluir una CLI determinista `codex-bridge-cli` en la imagen.
- Documentar en el workspace:
  - `hilos codex` → listar;
  - `codex en <hilo>: <pedido>` → encolar;
  - `codex nuevo: <pedido>` → crear un hilo.

## Olas y gates

1. **Cola y API** — gate: tests de persistencia, lease, idempotencia y auth verdes.
2. **Cliente App Server** — gate: tests de selector/protocolo verdes y listado real
   de hilos locales.
3. **Worker + OpenClaw** — gate: trabajo encolado desde CLI, ejecutado por la Mac
   y resultado persistido.
4. **Producción** — gate: Railway desplegado, LaunchAgent activo y prueba real
   WhatsApp → hilo elegido → WhatsApp recibida.

