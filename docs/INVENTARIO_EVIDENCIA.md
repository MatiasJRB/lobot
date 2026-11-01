# Evidencia del inventario

Fecha del relevamiento: **31 de octubre de 2026**.

Estas notas acompañan mi [mapa de infraestructura](MAPA_INFRAESTRUCTURA.md).
Se basan en el informe curado del chat de origen, leído completo para esta
actualización, y en la documentación de Lobot. No repetí las consultas a
proveedores, procesos, apps o servicios al trasladar los hallazgos al mapa.

## Qué se revisó y qué significa

| Evidencia | Qué permite registrar | Qué no demuestra |
| --- | --- | --- |
| Repo, README y origin | Propósito documentado y procedencia de una pieza. | Runtime activo, versión desplegada o integración. |
| Binario/PATH, app o skill | Presencia local de la herramienta. | Cuenta, modelo cargado, plan, configuración funcional o uso actual. |
| Configuración o tarea registrada | Cableado previsto, eventos y cadencias declaradas. | Ejecución exitosa en cada ciclo. |
| Proceso observado | Presencia de un proceso en el instante de revisión. | Salud funcional ni continuidad E2E. |
| Health HTTP 200 | Respuesta de ese punto de salud local. | Lectura de contenido, funcionamiento de todas sus rutas o disponibilidad remota. |
| Estado persistido | Lo que conserva un archivo o recibo. | Que sea reciente si carece de una fecha confiable. |
| Prueba histórica por asunto | Un recorrido concreto que tuvo evidencia de resultado. | Integración universal ni prueba actual de todos los canales. |

Se revisaron metadatos locales y de repositorios de la cuenta, nombres de
herramientas y configuración sin credenciales, tareas registradas y dos health
locales sin contenido. No se importó la lista bruta de proyectos ni se fija un
total de repositorios como medida de cobertura.

## Fuentes canónicas y hallazgos

| Grupo | Fuente consultada en el relevamiento | Hallazgo que traslado al mapa |
| --- | --- | --- |
| Lobot/asuntos | `src/bridge/{worker,case-coordinator,api-client,app-server-client,store,routes}.js`, `src/cli/case.js`; `docs/CASE_COORDINATOR.md`, `docs/CODEX_WHATSAPP_BRIDGE.md`. | Cola durable, asuntos, CLI y ejecutor local; proceso del bridge observado. |
| Dot | `src/mcp/dot-case-{adapter,events}.js`, `docs/DOT_BRIDGE.md`. | Piloto histórico por un asunto con eventos y recibos; fallback conservado. |
| Canales y collectors | Fuentes `src/personal` y `src/cron`; documentación de OpenClaw/canales. | Implementaciones presentes. La arquitectura anterior no sustituye una consulta de deployment actual. |
| Personal OS | Sus ejecutables canónicos separados; interfaces `src/mcp/personal-os-*`, notices/outbox y `docs/PERSONAL_OS_NOTICES.md`. | Relación con Lobot mediante consulta y avisos asíncronos idempotentes. No se copiaron fichas. |
| Captura público | Contrato y repo `MatiasJRB/captura`. | Grabación visible iniciada por usuario, transporte opcional, hash/Whisper/VAD, originales y salidas de revisión. |
| Captura personal | Worker, intake/review, tests presentes, cliente de avisos y claves técnicas de configuración. | Relación privada implementada hacia `avisar-secretario`; detalle y límites más abajo. |
| Entornos locales | Binarios/PATH y bundles de Codex, Claude, Orca, OpenCode y Antigravity. | Presencia de herramientas, sin consulta de sesiones. Kimi/Gemini CLI ausentes del PATH revisado no implican ausencia de sus servicios. |
| `_sync` | README y `codex_sync.py` locales, sin origin. | Destilación de contexto Codex–Claude a `.handoff`, sin ejecutar sincronización ni leer los handoffs. |
| Remote Station y S25 | Skills, wrappers y registro de tareas locales. | Capacidades descritas, sin consulta de Ubuntu ni conexión del teléfono. |
| Engram y grafo | Binarios/wrappers y nombres de servidores en configuración. | Engram configurado y usado en la sesión; grafo configurado, sin verificar sus índices por repo. |
| Hilos y hooks | Skills y nombres de eventos de `hooks.json`. | Capa de organización e instrumentación configurada; no auditoría de todos los handlers. |
| Oficina de lectura | Bridge local y tarea registrada. | Proceso observado y health HTTP 200; no se llamaron rutas de lectura ni se leyeron hilos. |
| Hub de previews | Skill, script de hub y tarea registrada. | Proceso observado y HTTP 200; no se listaron los artefactos. |
| Reserva IA | Auditoría anterior del HUD, fuentes y pruebas de parser. | App externa; tres fuentes actualizaban y dos seguían pausadas con datos históricos. Sin nueva autenticación. |
| Comunicación | Skills WhatsApp de lectura/envío/confirmación, avisos y bitácora. | Herramientas instaladas/disponibles; ninguna lectura o envío de mensajes durante este inventario. |
| Medios | README/origin de Local Studio, Voicebox y Open Design; apps, skills Hyperframes/Remotion y binarios de medios. | Procedencia y presencia; no se probaron grabación, voces, modelos ni proveedores. |
| Proyectos anteriores | README/origin cuando existe: Lobo Builder, autonomy-hub, Spec Forge, briefbox, request-board, playground y referencias GitHub de google-gemini/avatar-agent. | Propósito e historia, sin declarar runtimes vigentes, sucesiones o integraciones. |
| Ecosistema relacionado | Referencias de Geome7ric Agentic, Engineering, su repo canónico de infraestructura y `ops`. | Dueños separados; sin copiar capas de clientes, datos de dominio ni decisiones operativas. |

## Captura: precisión importante

El worker privado tenía proceso al inspeccionarlo, con intervalo configurado
de 300 segundos. El `note-intake` también estaba registrado cada 300 segundos:
sin PID en ese instante y con último exit 0. Al ser periódico, no tener PID no
permite declararlo caído.

El cliente de avisos apunta al ejecutable canónico `avisar-secretario`. El intake
admite `captureKind=dictated_note` y nombres delimitados; prepara un candidato
`review_only`, `speaker_verified=false`, y usa recibos SQLite para deduplicar.
Esto acredita relación implementada/configurada, no recepción actual comprobada.

Los campos seguros observados fueron:

- Inbox: `state=ready`.
- Intake: `state=needs_review`, `effects_executed=0`, `model_called=false`.

Los campos leídos no tenían una fecha confiable. No se reprodujo el intake ni
se comprobó una entrega nueva al Secretario. El piloto de bitácora de Captura
estaba pausado; es un mecanismo distinto del intake periódico y no se activó.
El repo público sigue separado y no aporta un adaptador genérico integrado a Lobot.

## Configuración, plugins y mecanismos distintos

En la configuración raíz revisada figuraban Engram, grafo y node_repl.
Supabase, Vercel, Notion, MercadoPago y computer-use estaban explícitamente
deshabilitados allí. No se cambiaron esos flags.

A la vez, la sesión del relevamiento ofrecía conectores de GitHub, Gmail,
Calendar, Drive, Notion, Slack, Personal OS, Sites, Metricool y CUA. Un MCP raíz
deshabilitado no demuestra que un plugin de sesión esté desconectado. Tampoco
la presencia de una herramienta acredita cuenta, scopes o autorización de escritura.

Automatizaciones nativas Codex, crons de OpenClaw y LaunchAgents se registran
por separado. Un nombre, una cadencia o un estado activo no permiten inferir
que sus efectos funcionaron. Los helpers de acceso móvil estaban registrados;
`keep-ai-awake` tenía instalación local, sin carga observada en la lista revisada.

## Procedencia y cobertura

Los dos checkouts de infraestructura del estudio apuntan al mismo repo
`Geome7ric/infrastructure`; no se contaron como dos sistemas ni se compararon
sus revisiones. `ops` conserva su inventario operativo canónico y HomeOps.
Los consumidores de dominio permanecen separados; sus datos no se trasladan acá.

Cuando una pieza resultó de procedencia del empleador se excluyó y se detuvo su
lectura. No se copió su contenido. Las familias de skills se registran como
referencias, sin trasladar métodos privados de otros ámbitos.

Quedan fuera credenciales, scopes de cuentas, datos de salud/legal/finanzas,
identidades privadas, contenido de clientes, mensajes, grabaciones, transcripciones,
memorias, topología y endpoints remotos. Tampoco se auditó todo el cloud, el estado
real de Ubuntu ni cada servicio citado por documentación histórica.

No se invocaron comandos de proveedores, se autenticaron cuentas, se enviaron
mensajes ni se activaron automatizaciones o servicios. Esta actualización sólo
plasma evidencia y huecos de información; no concede permisos para implementar.

[Volver al mapa](MAPA_INFRAESTRUCTURA.md) · [Volver a mis notas](../README.md)
