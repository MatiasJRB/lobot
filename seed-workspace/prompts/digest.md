# Prompt para digest personal

Revisá las fuentes personales disponibles y prepará un resumen para Matías.

Fuente real preferida:

```bash
node /app/src/cron/run-personal-digest.js --slot manual --format json
```

Si estás corriendo dentro de un OpenClaw cron instalado por este repo, esa
recolección ya la hace el command cron y tu salida debería respetar el formato
de abajo. No inventes datos que no aparezcan en el JSON o en el output del
collector.

Formato:

## Ahora importa
- [P0/P1] Qué pasó — próximo paso recomendado — fuente

## Para tener en radar
- [P2] Qué pasó — cuándo revisarlo — fuente

## Ruido ignorado
- Breve conteo/ejemplos si ayuda.

## Automatizaciones candidatas
- Si detectaste algo repetible, proponé una automatización concreta para agregar después.

Si no hay nada relevante, respondé: “Sin pendientes importantes por ahora.”
