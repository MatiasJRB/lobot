# Intake conversacional de Ali

Fuente ejecutable: [lobot #5](https://github.com/MatiasJRB/lobot/issues/5), continuación del puente #2/PR3. Matías autorizó implementar y observar conversaciones reales, sin mensajes de prueba al grupo.

## Mecánica

El worker lee incrementalmente el feed nativo ya existente con un cursor privado independiente. Sólo persiste mensajes desde la activación del grupo exacto y los remitentes ya autorizados. Otros chats se descartan antes de escribir el journal o consultar el modelo. Ninguna tabla, ficha o historial del Secretario se consulta para este intake.

La mención mantiene su respuesta habitual: una sola llamada al ejecutor QA aislado produce respuesta y clasificación. Sin mención, una ventana de silencio de 2 minutos agrupa mensajes; se cierra como máximo 10 minutos después del primero. Su consolidación es silenciosa: no se crea job de salida ni se llama a WhatsApp.

Límites iniciales: 2 llamadas por ventana, 8 por hora móvil y 20 por día móvil; hasta 16 mensajes/12.000 caracteres de texto nuevo por llamada. El contexto GitHub se acota a 9.000 caracteres. Sin mensajes pendientes: cero llamadas al modelo. El worker consulta el cursor cada 5 segundos mediante HTTP, sin tokens de modelo. Audio, texto truncado, overflow o interrupción se conservan `needs_attention` y no se adivinan ni reintentan automáticamente.

## Registro y permisos

El modelo conserva config/home/hilo QA preexistentes, sandbox read-only sin red ni herramientas y entorno sin credenciales Bridge/GitHub/MP. Devuelve JSON con consulta sin ítems, `definition`, `task` o `clarify`; confianza baja se convierte en punto por aclarar. Sólo cita mensajes actuales capturados. Un target issue sólo se admite si la lectura de contexto lo verificó abierto.

El adaptador separado resuelve la credencial existente MatiasJRB y verifica identidad sin cambiar cuenta global. Sólo crea issues/comentarios en `MatiasJRB/asiento-libre` y agrega al Project4. No modifica definiciones antiguas, cierra issues ni cambia estados activos. Nuevos registros quedan pendientes; un receipt es la única fuente para afirmar registro. No autoriza operaciones de producto/dinero.

Journal/outbox en `~/.config/secretario-personal/ali-intake/state.json`, directorio0700/archivo0600, escritura atómica/fsync. Corrupto o inseguro falla cerrado; nunca se resetea el cursor. Cada registro lleva marker `ali-intake:<hash>`, autor/instante/ID y cita de origen. Un timeout tras POST conserva `writing`: reconcilia el marker antes de hacer nada. Sin receipt encontrado queda `uncertain`, sin segundo POST. Fallos previos al POST y Project pendiente tienen backoff5min y máximo3 intentos, sin nuevas llamadas al modelo.

## Configuración privada

En `codex-bridge.env`, junto al runner actual (no copiar valores al repo):

```text
ALI_INTAKE_ENABLED=true
ALI_INTAKE_GROUP_JID=<grupo exacto actualmente configurado>
ALI_INTAKE_SENDERS_JSON=<objeto identidad exacta autorizada→nombre>
```

La configuración sale de la allowlist efectiva del grupo; no inventar identidad, ampliar remitentes ni cambiar el hilo QA. El instalador incluye los tres módulos de intake. Reinstalar sólo sin jobs running/queued; no interrumpir un turno real.

## Observación y recuperación

`node scripts/ali-intake-health.js` devuelve sólo contadores/fechas/errores, sin textos, teléfonos, grupo ni secretos. La fuente OpenClaw2026.9.2 instalada confirma que `requireMention` descarta mensajes antes de emitir el hook. `scripts/ali-intake-observation.mjs` usa su SDK nativo para habilitar `groupActivation=always` sólo en la sesión ALI preexistente; requiere grupo único/allowlist, plugin de intercepción y barrera de salida. Config raíz/cuenta, remitentes y DM permanecen iguales. No reescribe el store: cambia un campo transaccional, guarda la activación anterior en archivo privado para `--disable`. Ejecutar como dueño del gateway, no root; inspección por defecto y `--enable` explícito. Nunca usar `/activation` enviado al grupo como prueba.

La activación de recepción y su readback no certifican que un mensaje real se haya capturado. La observación real y los tests locales son evidencias distintas. No afirmar PASS end-to-end hasta observar mensajes reales→clasificación→recibo. No procesar backlog anterior ni los jobs históricos entregados.

El heartbeat humano de este chat revisa salud 09:15/18:15 ART. Permanece silencioso sin novedad material y repara únicamente fallos del intake con tests sin proveedor. Para rollback local, poner `ALI_INTAKE_ENABLED=false` y reinstalar el worker sin trabajos en curso; ejecutar `--disable` en el script de observación para restaurar activación nativa. Preservar journal/outbox y snapshot. No eliminar evidencia ni reenviar respuestas.
