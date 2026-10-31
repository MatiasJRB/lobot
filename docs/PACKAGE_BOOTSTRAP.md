# Instalación offline del primer kit

Lobot abarca infraestructura de agentes y tooling. Estos comandos instalan
únicamente su primer componente de adaptadores; no instalan el mapa completo
de agentes, tools, skills, contexto, memoria e integraciones.

Este recorrido corresponde al kit de la rama privada de revisión
`codex/lobot-infrastructure-landing`, sin integración a main. Requiere Node 24
o superior. No descarga dependencias, ejecuta scripts de npm, conecta cuentas,
abre sesiones ni inicia servicios. Las fuentes históricas del host y sus tests
no forman parte de esta entrega.

Desde la raíz del checkout de revisión, elegí un destino absoluto NUEVO fuera
del checkout. Si ya existe, el instalador lo rechaza sin modificarlo.

```sh
node --version
node scripts/bootstrap-offline.mjs /tmp/lobot-offline-install
node scripts/check-distribution.mjs /tmp/lobot-offline-install
```

El resultado contiene 15 archivos: módulos, ejemplo ficticio, esquema,
documentación, licencia original, metadata ESM y manifiesto SHA-256. El paquete
generado tiene `private: true`, cero dependencias de paquete y ningún lifecycle
script. No modifica el package.json del checkout ni accede a configuración real.

Opcional: comprobar que los seis módulos instalados se importan, sin host:

```sh
node --input-type=module -e '
const base = "file:///tmp/lobot-offline-install/src/";
await Promise.all([
  "core/config.js", "core/infrastructure.js",
  "adapters/dot/index.js", "adapters/whatsapp/index.js",
  "adapters/openclaw/index.js", "adapters/codex/index.js"
].map(p => import(base + p)));
console.log("6 módulos importados; ningún servicio iniciado");
'
```

Si elegiste otro destino, ajustá los comandos y la URL de importación.
La instalación y la importación no ejecutan un asistente ni registran hooks.
Para usar el kit en vivo falta inyectar la cola, el ingreso nativo, el registro,
los eventos y el ejecutor del host existente, con aprobación específica.

Las siete pruebas del registro de verificación son evidencia LOCAL previa del
checkout con el host completo, Codex y webhook simulados. El archivo de tests y
sus nueve dependencias del host quedan fuera de esta rama; no se ofrece aquí
un comando para ejecutarlas ni se afirma validación de producción.

La configuración real deberá vivir fuera de la instalación, en un directorio
privado y archivo 0600. No crear otro worker, scheduler, supervisor o sesión.
La revisión de la rama privada y del wiring del host precede al gate real;
cualquier publicación pública requiere una decisión separada.

Para retirar la instalación offline, eliminar únicamente el directorio nuevo
elegido. Los consumidores y servicios existentes no se modifican.
