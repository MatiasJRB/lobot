# Primer componente de Lobot: kit offline de adaptadores

Lobot es el proyecto de infraestructura de agentes y tooling: roles,
herramientas, MCP, skills, workflows, contexto, memoria, runtimes e integraciones,
con contratos, observabilidad y seguridad transversales. El README presenta ese
mapa objetivo. La auditoría actual cubre sólo Lobot; no es un catálogo completo
de toda la infraestructura ni afirma que todas sus capas estén integradas.

Este documento describe un componente concreto de esa visión: el kit offline
0.1, instalable con Node 24+ y sin dependencias de paquete. Organiza la frontera
entre un canal, un asunto y el host que lo ejecuta. Un Secretario, una aplicación
de investigación o un flujo de desarrollo son posibles consumidores de la
infraestructura; ninguno define por sí solo al proyecto.

## Estructura del componente

- `src/core`: configuración explícita y acceso acotado a la cola existente.
- `src/adapters/dot`: consulta, continuación y delegación de eventos MCP al host.
- `src/adapters/whatsapp`: entrada humana propia sobre el ingreso nativo del host.
- `src/adapters/openclaw`: adaptación del despacho sin registro automático de hooks.
- `src/adapters/codex`: interfaz para trabajos ya tomados por el único ejecutor.
- `config`: esquema y ejemplo ficticio; la configuración real queda afuera.

El kit recibe interfaces explícitas del host. Conserva su cola durable, registro
de asuntos y único ejecutor; no agrega otro scheduler, memoria conversacional,
supervisor, modelo o sesión de WhatsApp. No hay activación al importar módulos.
La coordinación del flujo actual sigue en Dot y la ejecución en el host.

## Primer flujo y cobertura

El caso WhatsApp → asunto exacto → ejecutor existente → resultado → Dot es un
flujo secundario para verificar cómo se conectan las piezas. La prueba histórica
LOCAL usó BridgeStore, CaseCoordinator, ingreso nativo y DotCaseAdapter/Eventos
del checkout completo, con Codex y webhook simulados. No certifica producción.

Los tests y sus nueve dependencias del host quedan fuera de la entrega privada
de revisión `codex/lobot-infrastructure-landing`. Bootstrap, check e imports
funcionan sin ellos; no se promete ejecutar aquí los tests del host completo.
El paquete no ejecuta agentes por sí solo. La integración real está pendiente
de aprobación, al igual que cualquier expansión de capacidades.

## Frontera de distribución

Sólo la lista explícita del bootstrap forma el artefacto de 15 archivos. El
checkout completo, su historial, seeds y documentación operativa anterior quedan
fuera de esta entrega. La metadata raíz y los consumidores actuales se conservan.
La entrega incluye el primer kit; no migra toda la infraestructura al repositorio.

Ver [bootstrap](PACKAGE_BOOTSTRAP.md), [contratos](PACKAGE_CONTRACTS.md),
[seguridad](PACKAGE_SECURITY.md) y [evidencia histórica](PACKAGE_VERIFICATION.md).
Licencia MIT, conservando la atribución original.
