# Intake conversacional de Ali

Fuente ejecutable: [lobot #5](https://github.com/MatiasJRB/lobot/issues/5), continuación del puente #2/PR3. Matías autorizó implementar y observar conversaciones reales, sin mensajes de prueba al grupo.

## Mecánica

El worker lee incrementalmente el feed nativo ya existente con un cursor privado independiente. Sólo persiste mensajes desde la activación del grupo exacto y los remitentes ya autorizados. Otros chats se descartan antes de escribir el journal o consultar el modelo. Ninguna tabla, ficha o historial del Secretario se consulta para este intake.

La mención mantiene su respuesta habitual: una sola llamada al ejecutor QA aislado produce respuesta y clasificación. Sin mención, una ventana de silencio de 2 minutos agrupa mensajes; se cierra como máximo 10 minutos después del primero. Su consolidación es silenciosa: no se crea job de salida ni se llama a WhatsApp.

Límites iniciales: 2 llamadas por ventana, 8 por hora móvil y 20 por día móvil; hasta 16 mensajes/12.000 caracteres de texto nuevo por llamada. El contexto GitHub se acota a 9.000 caracteres. Sin mensajes pendientes: cero llamadas al modelo. El worker consulta el cursor cada 5 segundos mediante HTTP, sin tokens de modelo. Audio, texto truncado, overflow o interrupción se conservan `needs_attention` y no se adivinan ni reintentan automáticamente.

## Registro y permisos

El modelo conserva config/home QA y el ID de ejecutor configurado, sandbox read-only sin red ni herramientas y entorno sin credenciales Bridge/GitHub/MP. Para intake usa una ejecución efímera dentro de ese home aislado, sin crear chat humano ni acumular historial: el contexto anterior pertinente viene acotado del journal. Devuelve JSON con schema nativo y consulta sin ítems, `definition`, `task` o `clarify`; confianza baja se convierte en punto por aclarar. Sólo cita mensajes actuales capturados. Un target issue sólo se admite si la lectura de contexto lo verificó abierto.

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

## Contrato humano y vista de Joaquín

WhatsApp alcanza como canal humano: consultas, definiciones, reportes de QA y
bloqueos entran por el grupo autorizado. No exigir a Joaquín seguir commits,
PRs o Project. La vista privada de Asiento Libre resume su próximo paso,
las dependencias del equipo y lo que ya reportó; Issues/Project siguen siendo
la fuente ejecutable. Una respuesta breve no reemplaza registrar trabajo pendiente.

El resumen conserva la distinción reportado/registrado/implementado/verificado.
Una confirmación de QA no ordena repetir la operación. Preparar código no habilita
la prueba: el agente de producto debe aportar versión, entorno, enlace/acceso,
condición de inicio y evidencia esperada. Fuente ambigua o modificada queda en
revisión. No convertir una Issue cerrada en PASS financiero.

La actualización objetivo de la vista se dispara por cambios materiales en los
registros, agrupados en las ventanas existentes. Usar proyección determinista:
sin cambios no hay generación/publicación ni llamadas adicionales al modelo.
No añadir otro heartbeat ni releer historial. Generar localmente no es publicar:
conservar fecha del corte, estado de sincronización y recibo de publicación/acceso.

El modelo QA permanece aislado read-only. El escritor sigue acotado a
Issues/Project de `MatiasJRB/asiento-libre`; el publicador pertenece a la capa
privada de hosting y requiere su propio alcance autorizado. Este contrato no
concede acceso a Cloudflare ni autoriza mensajes externos, dinero o deploy.
Validar cada tramo por separado y no declarar el circuito operativo por una
preview o por tests. La vista inicial es manual; automatización y respuesta del
grupo quedan pendientes hasta verificar su implementación real.

El contrato de producto vive en `docs/agents/joaquin-operating-loop.md` del
repositorio Asiento Libre. Estas reglas no cambian el comportamiento instalado
del worker ni reemplazan la reconciliación de journal/cursor/recibos.

Todo texto al grupo en nombre de Ali comienza con `🤖 Ali:` exactamente una vez,
también si es un borrador manual o aviso de publicación desde el WhatsApp de
Matías. Verificarlo antes del check final de aprobación; un cambio en un texto
ya aprobado exige renovar la aprobación completa. El puente automático ya
normaliza esta firma en la salida y el intake descarta los mensajes rotulados
como Ali. Los mensajes humanos de Matías conservan su voz y autoría.

## Barreras del canal y preservación del despliegue

La sesión del grupo usa `groupActivation=always` para el registro silencioso.
`requireMention=true` por sí solo no impide que esa sesión invoque el modelo
personal: el plugin debe consumir **cada** turno del grupo en `before_dispatch`,
encolando sólo la mención literal `@lobot`. Una falla de cola también se consume;
no habilita una respuesta alternativa. Las respuestas propias rotuladas Ali se
ignoran y las decisiones personales nunca toman mensajes de este grupo.

`message_sending` bloquea cualquier salida al grupo que no tenga el permiso
privado de un solo uso emitido por el puente. El puente firma `🤖 Ali:` una vez.
Ambos hooks y los tres módulos `ali-group*` deben conservarse al desplegar cambios
compartidos de Lobot. Restaurar sobre la fuente realmente desplegada y conservar
las mejoras personales; no sustituirla por un checkout anterior ni reinstalar el
worker de Mac para reparar sólo el servidor. Validar tests sin proveedor y luego
configuración efectiva, carga del plugin y salud; la siguiente invocación humana
real aporta la evidencia de entrega, sin mensajes de prueba ni replay.
