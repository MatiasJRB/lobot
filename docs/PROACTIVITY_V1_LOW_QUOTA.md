# Proactividad V1 — bajo consumo de cuota

## Objetivo

Ayudar a Matías de forma proactiva sin gastar cuota de Codex por estar “mirando” todo el tiempo.

## Contrato operativo

- **Personal OS** conserva pendientes, responsables, próximos pasos y fechas.
- **OpenClaw/Lobot** despierta una única revisión diaria a las 09:30.
- Esa revisión es **determinística y local**: no abre un hilo ni invoca un modelo de Codex.
- Si no hay novedades accionables devuelve `DONT_NOTIFY` y permanece en silencio.
- Si hay algo material, entrega como máximo tres movimientos en un solo WhatsApp propio.
- Las revisiones semanal y mensual que usan Codex quedan desprogramadas y bloqueadas por defecto.
- Sólo una invocación explícita con `--allow-codex` puede ejecutar una revisión profunda.

## Presupuesto

| Actividad | Consumo programado de Codex |
|---|---:|
| Revisión diaria de compromisos | 0 |
| Captura y deduplicación estructurada | 0 |
| Consulta del knowledge hub | 0 |
| Revisión semanal automática | Desactivada |
| Revisión mensual automática | Desactivada |
| Investigación o gestión pedida por Matías | A demanda |

La V1 no intenta interpretar continuamente todos los chats. Otros agentes entregan sólo novedades materiales mediante el bus de avisos; el Secretario las reconcilia con Personal OS sin crear conversaciones nuevas.

## Escalamiento posterior

Agregar una ejecución con modelo únicamente cuando la V1 tenga una señal objetiva que no pueda resolver por reglas: conflicto de fechas, evidencia contradictoria, decisión ambigua o borrador sensible. Debe existir un tope explícito antes de habilitar ese escalamiento.
