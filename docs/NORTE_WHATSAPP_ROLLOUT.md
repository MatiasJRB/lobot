# Norte en WhatsApp — preflight del 17/09/2026

**Estado: no instalado ni activado en el OpenClaw productivo.** El usuario pidió
instalarlo; el preflight detectó gates que impiden hacerlo de forma segura.

- Railway: OpenClaw 2026.9.2, Node 24, una instancia activa; WhatsApp actual operativo.
- Servidor Norte: `GET /api/financial-brief` con su token dedicado respondió 200.
- Tar Norte 0.2.0: SHA-256 `2d0e2023e7e6faea34e10abf2ea94eb3d5ebec37bb034fd3f8c2bc1a4fa0a8dc` coincide con el handoff. Instalación **aislada** bajo `/tmp/norte-plugin-install-test` exit 0; no toca el gateway live.
- Patch WhatsApp 2026.9.2: SHA-256 `7900fa5972dd7afdc28d954109c018ffa7d8cded6ce833ac94f5c1e93eec16c9`; reverse-apply check PASS sobre el checkout exacto, 20 tests sintéticos PASS, typecheck extensiones PASS, bundle local PASS. Tar de prueba SHA-256 `cd17723da05b604c0ae520f042657eba201c792d3c398ff2afc98ebfa103aa65`, instalación aislada exit 0. El manifest fuente se completó con el `channelConfigs` idéntico al del paquete live: en el stateDir aislado ambos plugins figuran `loaded` y no hay warnings de `channelConfigs`.
- Ambos tarballs están **sólo staged** bajo `/data/norte-install-staging/` en Railway, privado 0700/0600. No se alteró la instalación live, los tokens, el gateway ni el WhatsApp del usuario.

## Gates abiertos

1. `finance_accounts` en Norte productivo tiene **cero filas** (consulta SQL en transacción `BEGIN READ ONLY`). El plugin exige un catálogo explícito de al menos una cuenta existente. No deducir identidades de transacciones ni inventar cuentas. Obtener/verificar un catálogo real antes de configurar el plugin.
2. El patch firmado de ingreso todavía no está instalado en el canal live; sin él, Norte no debe recibir autoridad de consultas ni confirmaciones financieras. El paquete parchado pasó una instalación **aislada**, no una prueba de conversación WhatsApp real; conservar rollback del canal actual.
3. Tras cerrar lo anterior: configurar ruta exacta del WhatsApp propio, secretos de lectura/escritura/ingress separados, iniciar con `deliveryEnabled:false`, probar fail-closed/restart/persistencia, y recién después habilitar una ruta de lectura y pedir un mensaje de prueba al usuario. No ejecutar registros ni modificaciones de dinero en el smoke.

Fuente de contrato: `/Users/matiasrios/Documents/GitHub/gastos-automaticos/docs/product/norte-secretary-handoff-0.2.0.md`. El bundle privado está en `data/private/cloud/openclaw-norte-handoff.json` de Norte; **no copiar sus valores a este repositorio ni al chat**.
