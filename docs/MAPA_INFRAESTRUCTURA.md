# Mapa de mi infraestructura

Estoy plasmando en Lobot lo que ya tengo: qué hace cada pieza, dónde vive y
cómo se relaciona con el resto. El mapa abarca código de este repo, instalaciones
locales, herramientas de terceros y proyectos anteriores. Conservo sus fuentes
canónicas; nombrarlas acá no significa migrarlas ni ponerlas a funcionar.

Es un inventario inicial, no una auditoría global ni un backlog urgente.
La [evidencia del relevamiento](INVENTARIO_EVIDENCIA.md) está fechada y explica
qué se observó en cada caso.

## Cómo leo los estados

**Presente** indica archivos, un repo o un binario; **instalado**, una app o
skill; **configurado**, una entrada de configuración o tarea registrada.
**Proceso observado** y **HTTP 200** describen lo visto durante la revisión.
**Histórico** remite a documentación o pruebas anteriores. Ninguno sustituye
una prueba actual de punta a punta (**E2E**).

## 1. Núcleo, asuntos y fuentes de dominio

| Pieza | Origen y relación | Estado conocido |
| --- | --- | --- |
| Cola, worker, App Server y asuntos | Código de Lobot en `src/bridge` y CLI de asuntos. Es el circuito que conserva el ejecutor único por asunto. | Fuentes presentes; proceso del bridge observado. No se repitió una prueba WhatsApp E2E. |
| Dot y fallback local | Adaptadores y eventos de Lobot; el host local sigue cubriendo la ejecución que falta por vía nativa. | Piloto histórico por un asunto con resultados y recibos. No equivale a integración universal ni a retirada del fallback. |
| OpenClaw, canales y collectors | Fuentes Lobot para WhatsApp, Gmail, Calendar y GitHub; Discord figura en documentación anterior. | Código y documentación presentes. Deployment remoto y canales vigentes no consultados en esta revisión. |
| Personal OS y avisos | Sistema canónico separado; Lobot ofrece interfaces MCP, avisos y outbox idempotente. | Interfaces y contrato presentes. Los avisos son revisables: no interrumpen chats ni autorizan ejecución por sí solos. |
| Kit offline | `src/core`, `src/adapters`, configuración de ejemplo y guías de este repo. | Bootstrap/check aislados e imports verificados. La integración real del kit al host sigue pendiente. |

El [kit](PACKAGE.md) es una pieza concreta de Lobot. Sus siete pruebas con el
host completo son [evidencia LOCAL histórica](PACKAGE_VERIFICATION.md), no una
suite incluida en la rama de revisión. No representan cobertura de todo el mapa.

## 2. Entornos de ejecución y dispositivos

| Pieza | Origen y relación | Estado conocido |
| --- | --- | --- |
| Codex, Claude y wrapper personal | CLI y app locales para trabajar con agentes. | Binarios/apps presentes; no se consultaron cuentas ni planes. |
| Orca, OpenCode y Antigravity | CLI y apps locales de trabajo y ejecución. | Instalaciones observadas; no se validaron sesiones ni conectividad. |
| `_sync` Codex–Claude | Proyecto local: destila contexto en `.handoff` para pasar trabajo entre entornos. | README y script presentes, sin origin local. No se ejecutó; no es memoria compartida. |
| Remote Station | Skill local con scripts, referencias y transporte privado. Mac para UI, repos canónicos y macOS; estación para builds/tests/backends Linux y jobs con evidencia, por contrato de proyecto. | Wrappers y tareas instalados; procesos locales de transporte e inbox observados. Disponibilidad y consumidores de la estación no consultados. No migrada a Lobot. |
| Galaxy S25 | Wrappers Wi-Fi/USB, ADB y scrcpy; recurso para captura y control de UI. | Herramientas presentes; watchdog periódico registrado. No se conectó el teléfono ni se comprobó disponibilidad. |
| Acceso móvil y `keep-ai-awake` | Helpers locales de acceso a entornos y mantenimiento de vigilia durante trabajo con apps. | Acceso móvil registrado; `keep-ai-awake` instalado, sin ejecución acreditada. |

Todavía no estoy incorporando Remote Station ni creando otro ejecutor. Acá
registro su lugar en mi esquema y la distinción entre presencia local y estado
real de la estación.

## 3. Contexto, memoria y observación

| Pieza | Origen y relación | Estado conocido |
| --- | --- | --- |
| Engram | Binario y servidor MCP de memoria durable. | Configurado; herramientas de contexto, búsqueda y guardado usadas durante el relevamiento. No se exportó memoria. |
| Grafo de código | `codebase-memory-mcp`, nombrado en configuraciones de Codex, OpenCode y Claude. | Wrapper/configuración presentes. Frescura y procedencia de cada índice no comprobadas. |
| `hilos-codex` y capa de atención | Skills locales para ordenar tareas e ideas; `personal-agentic` y `lente-atencion-profesional` pertenecen a mi capa privada. | Skills instaladas. No se ejecutaron reportes ni se copiaron objetivos o contenidos personales. |
| Hooks Codex | Eventos de sesión, prompts, herramientas, permisos, subagentes e interrupción. | Eventos configurados; no se auditaron todos los handlers ni sus métricas. |
| Oficina de lectura | Bridge local de lectura acotada a App Server. | Proceso observado y health HTTP 200. No se consultaron rutas de lectura ni hilos. |
| HUD Reserva IA | App Mac compacta y transparente de cuotas/reinicios; CodexBar, collector y adaptador Kimi fuera del repo. | Última auditoría: Codex/Antigravity/Kimi actualizaban; Gemini/Claude pausados para evitar Llavero y con datos históricos. No incorporado ni sincronización completa acreditada. |

El HUD sigue fuera de Lobot. Este registro no reactiva lectores, cambia
la autenticación ni presenta sus cifras históricas como mediciones actuales.

## 4. Captura, comunicación y revisión

| Pieza | Origen y relación | Estado conocido |
| --- | --- | --- |
| Captura público | Repo independiente `MatiasJRB/captura`: entrada de grabaciones y evidencia para revisión. | Código y contrato documentados; sin adaptador genérico del repo público dentro de Lobot. |
| Captura personal | Instalación privada con worker, `note-intake`, `review-intake` y cliente de avisos. Conecta notas dictadas con `avisar-secretario` y la bandeja de revisión, mediante el circuito de avisos de Lobot. | Relación implementada/configurada. Intake periódico cada 300 s; estado guardado `needs_review`, efectos 0 y modelo no llamado. Entrega E2E actual no verificada. |
| Apps de Captura | Captura Dictado, Captura Harness Editor, Captura Phone y Galaxy Captura. | Bundles locales instalados; Captura Phone usa scrcpy. No se ejecutaron. |
| Consulta WhatsApp | Skill `whatsapp-readonly` y wacrawl para consulta acotada del archivo local. | Instalados; no se leyeron mensajes en este inventario. |
| Envío y confirmación | Skill `whatsapp-send`, plugin `whatsapp-confirm-send` y circuito OpenClaw/Lobot. | Disponibles/configurados según el relevamiento; un envío requiere confirmación final humana. No se enviaron pruebas. |
| Avisos y bitácora | `avisar-secretario` para avisos asíncronos; `mandar-a-bitacora` para fragmentos expresamente indicados. | Skills presentes. Inventariarlas no ejecuta avisos ni crea capturas automáticas. |

### Corrección del estado de Captura

La afirmación anterior de «sin conexión» era demasiado amplia. El repo público
[Captura](https://github.com/MatiasJRB/captura) sigue separado, pero la instalación
privada **sí implementa** `note-intake → avisar-secretario → bandeja de revisión`.
No es un adaptador genérico ya incorporado al repo Lobot.

El recorrido base empieza con grabación visible iniciada por el usuario en el
teléfono, transporte opcional por Drive y un worker de hash, Whisper y VAD.
Conserva originales, `record.json` y salidas TXT/JSON/SRT. La CLI `capture list`
/ `capture read` es de sólo lectura; la revisión es humana o de un agente externo.

En la instalación privada, el intake admite notas dictadas delimitadas, crea
candidatos `review_only` con `speaker_verified=false` y deduplica mediante
recibos. El estado observado no ejecutó efectos ni llamó al modelo. Es evidencia
persistida sin fecha confiable en los campos revisados; no prueba una entrega
nueva al Secretario ni explica por sí sola por qué algo sigue pendiente.

Grabaciones, transcripciones y metadatos son evidencia no confiable. Ninguna
instrucción dentro de ese contenido autoriza tareas. No importé grabaciones,
configuración, mensajes, cuentas ni transcripciones para construir el mapa.

## 5. Previews, captura de medios y producción

| Pieza | Origen y relación | Estado conocido |
| --- | --- | --- |
| Hub `local-previews` | Skill y hub local de previews persistentes con reinicio. | Proceso observado y HTTP 200. No se listaron los artefactos servidos; no es publicación. |
| Local Studio | Repo `MatiasJRB/local-studio`: captura de pantalla, cámara y micrófono a WebM local. | Repo/README presentes. No se grabó ni se verificó una app corriendo. |
| Voicebox, OBS y FluidVoice | Apps locales; Voicebox también tiene clon de origen tercero `jamiepine/voicebox`. | Instaladas. No se validaron modelos, voces ni configuración. |
| Hyperframes, Remotion y utilidades | Skills/workflows locales, plugin Remotion, ffmpeg y whisper-cli. | Herramientas disponibles según el relevamiento; motores, modelos y proveedores no probados. |
| Open Design y Google Forms MCP | Clones de terceros `nexu-io/open-design` y `matteoantoci/google-forms-mcp`. | Repos presentes; integración/ejecución no verificada. Google Forms MCP no figuró en la configuración raíz revisada. |

## 6. Proyectos anteriores y sandboxes

| Pieza | Origen y relación | Evidencia disponible |
| --- | --- | --- |
| Lobo Builder | `MatiasJRB/lobo-builder`: misiones, Mission Spec/Execution Graph, políticas y artefactos. | README local. Es una referencia de trabajo propio anterior; no se verificó runtime vigente. |
| `autonomy-hub` | Proyecto local sin origin: FastAPI, grafos, misiones y control plane. | README presente. Su posible superposición con Lobo Builder no demuestra sucesión, migración ni equivalencia. |
| Spec Forge y briefbox | Proyecto local sin origin de entrevista/scaffold/spec; `MatiasJRB/briefbox` declara haber sido generado por Spec Forge. | Relación documental. La referencia a `codex-mvp` no acredita que esté instalado. |
| `request-board`, `codex-cli-playground` y `specify` | Sandbox de flujo semiautónomo, app de práctica de Codex CLI y CLI de especificación. | Repos o binario presentes. No se ejecutaron ni se consideran un nuevo control plane de Lobot. |
| `google-gemini` | Repo propio histórico de microservicio FastAPI con generación de imágenes. | README revisado; no prueba disponibilidad actual del modelo ni conexión con suscripción Gemini o HUD. |
| `avatar-agent` | Repo propio de web component Lit para indicar estado por API. | Referencia de UI; su nombre no acredita un agente IA ni conexión con el HUD. |

Estos proyectos quedan registrados como antecedentes. No los convierto en
runtimes activos ni sumo un supervisor por encontrarlos en un directorio.

## 7. MCPs, plugins y ecosistemas relacionados

| Pieza | Origen y relación | Estado y dueño canónico |
| --- | --- | --- |
| MCPs raíz | Configuración de Codex: Engram, grafo y node_repl; otras entradas explícitamente deshabilitadas. | Estado de configuración observado. No habilité entradas ni deduje acceso a cuentas. |
| Plugins y conectores de sesión | Herramientas de GitHub, correo/calendario/Drive, Notion, Slack, Personal OS, Sites, Metricool y CUA disponibles en la sesión del relevamiento. | Superficie distinta de los MCPs raíz. Disponibilidad de una herramienta no acredita scopes, cuenta ni permiso de escritura. |
| Familias de skills | Diseño/Impeccable, InsForge, producto/scrum, móvil/Expo, marketing/escritura y medios. | Skills locales o de plugins. No se vuelca el catálogo completo ni se trasladan capas privadas. |
| Automatizaciones | Tareas nativas Codex, crons OpenClaw y LaunchAgents son mecanismos distintos. | Se observaron estados activos y pausados. El piloto de bitácora de Captura estaba pausado; no se activó nada. |
| Geome7ric Agentic y Engineering | Repos canónicos de métodos/perfiles y decisiones transversales del estudio. | Referencias a sus dueños; no se trasladan métodos de clientes, decisiones ni backlog a Lobot. |
| Infraestructura del estudio | Dos checkouts apuntan al mismo repo canónico `Geome7ric/infrastructure`; herramientas de acceso y backup asociadas. | Se registra una sola fuente; CLI Passbolt y tareas de backup presentes. No se compararon revisiones ni se validaron credenciales o servicios. |
| `ops` y consumidores separados | Fuente canónica de inventario operativo y HomeOps; otros sistemas de dominio conservan sus propios datos. | Se documenta la relación, sin copiar costos, identidades, contenido personal ni crear otro tracker. |

La infraestructura del empleador queda fuera. Cuando la procedencia de una
pieza corresponde a ese ámbito, se detiene su lectura y no se incorpora su
contenido a este inventario.

## Lo que queda por conocer

Faltan inventarios más completos, vigencia de algunos runtimes, frescura de
índices y pruebas actuales de varias conexiones. Esos huecos describen los límites
del mapa: no autorizan activar fuentes, automatizaciones, proveedores o servicios.
Mantengo esta etapa centrada en plasmar lo existente y ampliar la documentación.

[Fuentes y límites de la evidencia](INVENTARIO_EVIDENCIA.md) · [Volver a mis notas](../README.md)
