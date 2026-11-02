# Deploy en Railway

Docs base: https://docs.openclaw.ai/install/railway

## Checklist oficial adaptado

1. Crear servicio Railway desde este repo.
2. Agregar un **Volume** montado en `/data`.
3. Configurar Variables.
4. Habilitar HTTP Proxy en puerto `8080`.
5. Abrir `https://<railway-domain>/setup` para onboarding.
6. Abrir `https://<railway-domain>/openclaw` para Control UI.

## Variables mínimas

```env
SETUP_PASSWORD=<strong secret>
OPENCLAW_GATEWAY_TOKEN=<openssl rand -hex 32>
PORT=8080
OPENCLAW_GATEWAY_PORT=8080
OPENCLAW_STATE_DIR=/data/.openclaw
OPENCLAW_WORKSPACE_DIR=/data/workspace
OPENCLAW_VERSION=latest
GEMINI_API_KEY=<set from local secret file>
DISCORD_BOT_TOKEN=<fresh Discord bot token>
DISCORD_APPLICATION_ID=<discord application/client id>
GEMINI_MODEL=google/gemini-3.1-flash-lite
OPENCLAW_DEFAULT_MODEL=google/gemini-3.1-flash-lite
```

La clave Gemini quedó guardada localmente fuera del repo en:

```text
/home/usuario/Documents/GitHub/personal-assistant-secrets/gemini-api-key-details.txt
```

No copiar ese archivo al repo. Pegar solo el valor de la key como variable secreta de Railway.

## Variables Discord recomendadas

```env
DISCORD_GUILD_ID=<private server id>
DISCORD_PERSONAL_CHANNEL_ID=<assistant channel id>
DISCORD_OWNER_USER_ID=<Matias Discord user id>
DISCORD_PERSONAL_CHANNEL_TARGET=channel:<assistant channel id>
DISCORD_REQUIRE_MENTION=false
```

## Notas de costo/free tier

- Gemini Free tier permite input/output sin cargo pero el contenido puede usarse para mejorar productos de Google; el tier pago cambia límites/privacidad según la documentación de Google AI.
- Los rate limits Gemini se aplican por proyecto, no por API key. La key nueva sirve para discriminar uso del proyecto, pero el cupo se cuenta a nivel proyecto.
- Railway puede tener costo propio; controlar usage/limits del proyecto Railway.

## Estado local conocido

El `node` de Homebrew puede fallar por una dependencia `libsimdjson.26.dylib`.
Para automatizar Railway desde Codex/local, usar el Node bundled:

```text
/home/usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

con el CLI instalado en:

```text
/home/usuario/.nvm/versions/node/v20.19.4/lib/node_modules/@railway/cli/bin/railway.js
```
