![Lobot. Infraestructura de agentes y tooling. El sistema detrás de tus agentes.](docs/assets/lobot-landing/hero.svg)

# Lobot

**Infraestructura de agentes y tooling. El sistema detrás de tus agentes.**

Lobot es el proyecto para organizar los agentes, herramientas, integraciones y formas de ejecución que hacen funcionar un entorno de trabajo con IA. Su propósito es darles una estructura común: responsabilidades claras, contexto con alcance, interfaces explícitas y resultados verificables.

Un lugar para entender qué pieza hace qué, cómo se conecta y bajo qué contrato puede actuar. El kit offline de adaptadores es el primer componente técnico preparado para distribución dentro de esa visión.

Repositorio privado · Infraestructura en evolución · Primer kit offline 0.1

[Arquitectura](#cómo-se-organiza) · [Mapa actual](#mapa-objetivo-y-estado-actual) · [Kit offline](#primer-componente-kit-de-adaptadores) · [Documentación](#documentación)

## Una base para crecer con orden

El proyecto está pensado para quien construye y mantiene su propio entorno de agentes: roles especializados, herramientas vía MCP, skills reutilizables, workflows y distintos runtimes. Cada pieza necesita un dueño, una fuente de contexto y límites de actuación que se puedan revisar.

Investigación, desarrollo, preparación de borradores o un Secretario son posibles aplicaciones de esa infraestructura. Un canal de mensajería es una de sus entradas; la identidad del proyecto abarca el sistema que hay detrás.

## Cómo se organiza

El mapa objetivo agrupa las piezas por su responsabilidad. Los contratos, la observabilidad y la seguridad atraviesan todas las capas.

![Mapa objetivo de Lobot: agentes y roles; tools, MCP, skills y workflows; contexto, memoria y runtimes; contratos, observabilidad y seguridad. No representa un inventario completo implementado.](docs/assets/lobot-landing/flow.svg)

Las aplicaciones combinan roles y workflows; éstos usan herramientas, fuentes de contexto e interfaces de ejecución. Los adaptadores conectan canales y servicios. El estado y los recibos permiten revisar qué se pidió, qué se ejecutó y qué se entregó.

Esta arquitectura expresa la dirección del proyecto. **La auditoría actual cubre sólo Lobot**: no afirma que toda la infraestructura ya esté catalogada, migrada o integrada.

## Mapa objetivo y estado actual

| Área | Hoy, dentro del alcance revisado | Pendiente |
| --- | --- | --- |
| Agentes y roles | El contrato del primer kit conserva un único dueño por asunto. | Inventario de agentes, roles y responsabilidades. |
| Tools y MCP | Adaptador de Dot con interfaces de consulta y delegación de eventos MCP al host. | Catálogo de herramientas, contratos y permisos. |
| Skills y workflows | Parte del mapa objetivo; no inventariados en esta revisión. | Documentar capacidades reutilizables y recorridos de trabajo. |
| Contexto y memoria | El kit delega estado y contexto del asunto al host existente. | Mapa de fuentes, alcance y ciclo de vida; sin otra memoria general. |
| Ejecución y runtimes | Interfaces para la cola y el ejecutor existentes; bootstrap offline. | Integración real aprobada y mapa de runtimes. |
| Ejecución distribuida: Remote Station | Implementación actual en la skill local `remote-station`, con scripts y referencias; no migrada a Lobot. | Definir el componente reutilizable y sus contratos dentro de Lobot. |
| Integraciones y canales | Cuatro adaptadores del kit: Dot, WhatsApp, OpenClaw y Codex. | Validación real del primer flujo y futuros adaptadores según necesidad. |
| Contratos, observabilidad y seguridad | Alcance explícito, configuración externa y recibos delegados al host. | Extender contratos y señales verificables al resto del mapa. |

## Remote Station: ejecución distribuida

Remote Station encaja en la capa de ejecución de Lobot. Su contrato distribuye el trabajo entre la **Mac**, que conserva UI, repositorios canónicos y tareas específicas de macOS, y una **estación privada**, destinada a builds, tests, backends Linux y jobs con evidencia. La elección del entorno y los permisos dependen del contrato de cada proyecto.

Hoy la implementación vive en la skill local `remote-station`, con sus scripts y referencias. El relevamiento acotado de repositorios de la cuenta no identificó un repo dedicado; eso no demuestra que no exista en otro alcance. No se importaron su código, configuración ni datos privados.

Lobot puede ser el hogar de su componente reutilizable: contratos de ejecución, límites de acceso y evidencia de resultados. **Es una dirección de crecimiento, no una migración implementada.** La estación y sus servicios siguen donde están; este mapa no crea otro ejecutor ni scheduler.

## Primer componente: kit de adaptadores

El kit 0.1 ordena una frontera concreta: entradas de canal, selección de un asunto y conexión con un host de ejecución. Incluye núcleo de configuración, cuatro adaptadores, un esquema con ejemplo ficticio y bootstrap con manifiesto SHA-256.

Reutiliza la cola durable, el registro y el único ejecutor del host. No los copia ni inicia otro scheduler, memoria conversacional o supervisor. Importar sus módulos no registra hooks, inicia servicios ni abre sesiones.

**Estado de la entrega:** kit standalone para la rama privada de revisión `codex/lobot-infrastructure-landing`, sin integración a `main`. La entrega GitHub se realiza por separado. La conexión al runtime anfitrión sigue pendiente de aprobación; el paquete por sí solo no ejecuta agentes.

[Arquitectura y contratos del componente →](docs/PACKAGE.md)

### Instalación offline del kit

Desde la raíz del checkout de revisión, con **Node 24 o superior**:

```sh
node --version
node scripts/bootstrap-offline.mjs /tmp/lobot-offline-install
node scripts/check-distribution.mjs /tmp/lobot-offline-install
```

Elegí un destino absoluto **nuevo**, fuera del checkout. Si ya existe, el instalador lo rechaza sin sobrescribirlo. No requiere descargas de dependencias ni configurar cuentas.

Este recorrido produce un paquete ESM de **15 archivos**, con cero dependencias de paquete. Funciona sin los tests ni las fuentes históricas del host. La [guía de bootstrap](docs/PACKAGE_BOOTSTRAP.md) incluye una comprobación opcional de importación de los seis módulos.

### Evidencia y límites

| Verificación | Cobertura |
| --- | --- |
| Standalone | Bootstrap, verificación del artefacto e importación de seis módulos sin el host. |
| Gate LOCAL del host completo | 7 pruebas aprobadas con Codex y webhook simulados. Los tests y sus nueve dependencias del host no se incluyen en la rama de revisión. |
| Integración real | Pendiente. La evidencia offline no certifica producción, mensajes entregados ni delegación nativa de Dot. |
| Publicación | Repositorio privado; sin publicación pública. El kit no autoriza publicar todo el checkout o su historial. |

El [registro de verificación](docs/PACKAGE_VERIFICATION.md) conserva la evidencia local del componente. No demuestra cobertura del mapa completo de infraestructura ni ofrece un comando de tests para esta rama.

## Un flujo de ejemplo: WhatsApp–Dot

Dentro del primer kit, WhatsApp puede ser una entrada y Dot el punto de consulta y continuidad. Un pedido ficticio, con `demo` habilitado, tiene esta forma:

```text
codex en demo: compará dos opciones para un proyecto ficticio
```

El recorrido previsto es **entrada humana propia → asunto exacto → cola y ejecutor existentes → resultado con recibo → consulta desde Dot**. La prueba local usa puertos simulados; no conecta una sesión real. Recibir un resultado no dispara otra ejecución, y terminar un trabajo no equivale a entregar un mensaje.

Este flujo sirve para verificar una conexión entre piezas. Otras aplicaciones y canales podrán usar los mismos contratos según su alcance y requisitos.

## Configuración, permisos y trazabilidad

En el kit actual, la configuración real vive **fuera de la instalación**, en un directorio privado y un archivo `0600`. El loader verifica ubicación, permisos y estructura. Los ejemplos usan datos ficticios; cada asunto debe estar permitido por el kit y por el registro del host.

La distribución se construye desde una lista explícita de archivos. No copia configuración real, conversaciones, seeds ni el historial del repositorio. El manifiesto verifica integridad; la revisión de contenido sigue siendo necesaria antes de publicar. Los filtros de contexto no constituyen aislamiento de permisos del sistema operativo.

La entrega no activa cuentas, canales, envíos, pagos, servicios ni deploys. Cualquier conexión real requiere su aprobación específica.

[Seguridad y frontera de distribución →](docs/PACKAGE_SECURITY.md)

## Documentación

Las guías disponibles documentan **el primer componente**, no un catálogo completo de toda la infraestructura.

| Guía | Contenido |
| --- | --- |
| [Kit de adaptadores](docs/PACKAGE.md) | Estructura y relación con el host. |
| [Contratos](docs/PACKAGE_CONTRACTS.md) | Interfaces, único escritor y recibos por canal. |
| [Bootstrap](docs/PACKAGE_BOOTSTRAP.md) | Instalación standalone e imports opcionales. |
| [Seguridad](docs/PACKAGE_SECURITY.md) | Configuración privada y límites de distribución. |
| [Verificación](docs/PACKAGE_VERIFICATION.md) | Evidencia LOCAL histórica y cobertura del kit. |

## Camino de evolución

1. Revisar el primer componente en la rama privada y consolidar sus contratos.
2. Inventariar agentes, tooling, skills, contexto y runtimes dentro del alcance que se autorice; marcar fuentes, dueños y huecos.
3. Aprobar la integración del kit al host existente y verificar un flujo real con recibos separados.
4. Definir cómo alojar componentes reutilizables como Remote Station, con contratos y evidencia, antes de cualquier migración; preservar fuentes de dominio y consumidores.

Código bajo [licencia MIT](LICENSE), conservando la atribución existente.
