# Mi infraestructura, por funciones

Este árbol me ayuda a ubicar las piezas que estoy documentando. Las ramas
discontinuas significan **inventario**, no conexiones operativas de Lobot.
Incluye instalaciones externas y antecedentes; el detalle de origen y estado
queda en el [mapa completo](MAPA_INFRAESTRUCTURA.md).

```mermaid
%%{init: {"theme": "dark"}}%%
flowchart LR
    I["Mi inventario"]
    I -.-> A["Asuntos y ejecución<br/>Lobot · Dot fallback · kit offline<br/>Orca · OpenCode · Antigravity<br/>Remote Station"]
    I -.-> F["Tools y workflows<br/>MCP · plugins · skills"]
    I -.-> B["Contexto y observación<br/>Personal OS · Engram · grafo<br/>_sync · hilos · hooks · oficina · HUD"]
    I -.-> C["Entradas y revisión<br/>Captura · S25 · WhatsApp<br/>avisos · bitácora"]
    I -.-> D["Previews y medios<br/>hub local · Local Studio · Voicebox<br/>Hyperframes · Remotion"]
    I -.-> E["Antecedentes y fuentes<br/>Lobo Builder · autonomy-hub · Spec Forge<br/>sandboxes · referencias Geome7ric y ops"]
```

La presencia de una app, repo, proceso o configuración tiene distinto peso que
una prueba de punta a punta. Uso esas diferencias en el
[registro de evidencia](INVENTARIO_EVIDENCIA.md); el árbol no indica que todo esté
activo, migrado o conectado.

## Una relación implementada: Captura personal y revisión

Las flechas continuas de este segundo dibujo representan el recorrido privado
implementado/configurado. No equivalen a una entrega actual verificada.

```mermaid
%%{init: {"theme": "dark"}}%%
flowchart TB
    C["Captura personal<br/>note-intake · cada 300 s"]
    A["avisar-secretario<br/>circuito de avisos de Lobot"]
    R["Bandeja de revisión<br/>entrega actual por verificar"]
    C --> A --> R
    S["Estado guardado: needs_review<br/>efectos 0 · modelo no llamado"]
    C -. "evidencia persistida" .-> S
```

El estado guardado no tiene fecha confiable en los campos revisados. La relación
privada existe; el repo público de Captura sigue separado, sin adaptador genérico
incorporado a Lobot. La evidencia capturada no autoriza tareas por su contenido.

[Detalle de Captura y del resto del mapa](MAPA_INFRAESTRUCTURA.md) · [Qué compartir](COMPARTIR_LOBOT.md)
