# Qué quiero compartir de Lobot

Quiero poder compartir cómo organizo mi infraestructura: su arquitectura, los
nombres de proyectos, tools y skills, sus relaciones, contratos y documentación
general. No necesito borrar esas referencias para que lo que documente pueda
servirle a alguien más. Conservo la procedencia y la atribución de cada pieza.

## Qué dejar tal como está y qué convertir en ejemplo

| Contenido | Cómo lo trataría |
| --- | --- |
| Arquitectura, nombres de proyectos y herramientas, mapas y contratos propios | Puedo compartirlos con su estado y alcance, sin afirmar conexiones no verificadas. |
| Identificadores de instalación o de cuentas | Los paso a configuración externa o ejemplos: `cuenta-ejemplo`, `<DIRECTORIO_LOCAL>`, `<ASUNTO>`, `<URL_DE_INSTALACION>`. |
| Secretos, conversaciones y configuración privada real | No los exporto con la documentación ni con el código. |

Hay referencias concretas para esa parametrización:

- `seed-workspace/reference/personal-ecosystem.md`: contiene un identificador
  personal de correo y mapeo de cuentas. Mantendría la relación entre sistemas,
  sustituyendo esos valores por ejemplos.
- `seed-workspace/TOOLS.md`: contiene rutas, nombres de tareas y endpoints de
  una instalación. Los ejemplos deberían explicar su función sin usar mis valores.
- `seed-workspace/SOUL.md`: describe personalidad general. No lo considero un
  secreto por ser una instrucción de agente; revisar su pertinencia es una
  decisión editorial.

Son candidatos a parametrizar, no vulnerabilidades demostradas. Los datos y
materiales de otros ámbitos conservan sus propios dueños y permisos.

## Qué se comprobó hasta ahora

El cribado disponible revisó 94 commits locales alcanzables, 504 blobs de texto
y 180 archivos del worktree; dejó fuera un blob binario o grande. No encontró
coincidencias en ocho patrones específicos de credenciales de proveedores,
claves privadas y JWT.

Eso **no demuestra ausencia de secretos**: no fue una auditoría completa, no
incluyó búsqueda genérica de contraseñas o entropía, ni todas las referencias
remotas, LFS, releases o artefactos. Los identificadores de instalación requieren
la revisión separada que señalo arriba. No copio sus valores en esta nota.

## Estado de la entrega

La consolidación prevista es en la rama privada de revisión
`codex/lobot-infrastructure-landing`. El árbol de revisión observado tiene 127 archivos y hereda host, seeds e
historia: no está compuesto sólo por los 18 archivos seleccionados previamente.
El artefacto aislado de 15 archivos que genera el bootstrap es otra cosa.

Actualizar estos documentos no vuelve público el repo. Antes de una publicación
pública queda pendiente revisar el contenido y la historia que se compartirían,
y decidir qué parametrizar o excluir. Esta etapa sigue siendo documental.

[Mapa visual](MAPA_VISUAL.md) · [Mapa detallado](MAPA_INFRAESTRUCTURA.md) · [Evidencia](INVENTARIO_EVIDENCIA.md)
