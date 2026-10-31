![Lobot. Mi infraestructura de agentes y tooling. Un espacio para ordenar, documentar y mejorar lo que uso.](docs/assets/lobot-landing/hero.svg)

# Lobot

**Mi infraestructura de agentes y tooling.**

Este es mi espacio para ordenar, documentar, experimentar y mejorar lo que uso alrededor de los agentes: herramientas, skills, workflows, contexto, memoria, runtimes e integraciones.

Quiero que vaya creciendo con orden y poder volver a entender por qué armé cada cosa, cómo se conecta y qué me falta mejorar. También me interesa que algo de lo que deje acá pueda servirle a alguien más.

## Lo que quiero ir ordenando

- **Agentes y roles:** qué hace cada uno y hasta dónde puede actuar.
- **Tools y MCP:** las herramientas que conecto y los permisos que necesitan.
- **Skills y workflows:** formas de trabajar que quiero conservar y mejorar.
- **Contexto y memoria:** de dónde sale la información y qué corresponde guardar.
- **Ejecución y runtimes:** dónde corre cada cosa, incluida la ejecución distribuida.
- **Integraciones y canales:** cómo entran los pedidos y cómo vuelven los resultados.
- **Contratos, observabilidad y seguridad:** límites, estado y evidencia para entender qué pasó.

![Mi mapa de trabajo: agentes y roles, tools y workflows, contexto y ejecución, contratos y seguridad. Es un mapa por completar.](docs/assets/lobot-landing/flow.svg)

Este mapa todavía está por completar. La revisión hecha hasta ahora cubre sólo Lobot; no tengo toda mi infraestructura inventariada ni integrada acá.

Investigación, desarrollo, borradores o un Secretario son algunas aplicaciones posibles. WhatsApp es uno de los canales. Lo que quiero ordenar en este repo es la infraestructura que puede sostener esas piezas.

## Remote Station también forma parte de este mapa

En mi esquema de ejecución, la Mac conserva la UI, los repositorios canónicos y las tareas específicas de macOS. La estación privada sirve para builds, tests, backends Linux y jobs con evidencia, según el contrato de cada proyecto.

Hoy Remote Station vive en la skill local `remote-station`, con sus scripts y referencias. Me interesa que su parte reutilizable y sus contratos puedan crecer en Lobot. **Todavía no hice esa migración**: no copié su código, configuración ni datos privados a este repo.

## Una pieza concreta: el kit offline

Lo que ya está preparado acá es un kit de adaptadores: configuración explícita y conexiones con Dot, WhatsApp, OpenClaw y Codex. Reutiliza la cola y el ejecutor del host existente. Es una pieza de este espacio, no una instalación de toda mi infraestructura.

El bootstrap y la verificación funcionan de forma aislada con Node 24+: generan un artefacto de 15 archivos, sin dependencias de paquete, y sus seis módulos se pueden importar sin el host. La integración real del kit con ese host sigue pendiente.

Hay además evidencia LOCAL de siete pruebas con el host completo y puertos simulados. Esos tests y sus dependencias no se incluyen en la rama de revisión; no prueban producción ni entrega real de mensajes.

Dejé los detalles técnicos en estas notas:

- [Kit de adaptadores](docs/PACKAGE.md): qué contiene y cómo se relaciona con el host.
- [Bootstrap offline](docs/PACKAGE_BOOTSTRAP.md): comandos para revisar esa pieza por separado.
- [Contratos](docs/PACKAGE_CONTRACTS.md): interfaces, ejecución y recibos.
- [Seguridad](docs/PACKAGE_SECURITY.md): configuración privada y límites de distribución.
- [Verificación](docs/PACKAGE_VERIFICATION.md): qué se comprobó y con qué alcance.

La configuración real queda fuera de la distribución. No incluyo secretos ni conversaciones; los ejemplos son ficticios.

## Por dónde quiero seguir

Completar el mapa de lo que uso, documentar las decisiones que hoy están dispersas y mejorar una pieza a la vez. El kit de adaptadores y Remote Station son dos lugares concretos para seguir ese trabajo, cada uno con sus pendientes.

Código bajo [licencia MIT](LICENSE), conservando la atribución existente.
