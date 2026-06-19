# Clawbot Personal — arquitectura base

## Objetivo

Plantar la base de un secretario personal que corre OpenClaw en Railway y avisa por Discord. El agente debe revisar señales personales, resumirlas, priorizarlas y proponer acciones sin mezclar automatizaciones laborales de Mango.

## Decisiones

- **Runtime obligatorio**: OpenClaw en Railway.
- **Modelo inicial**: Gemini vía API key, buscando mantenerse en free tier.
- **Canal de salida**: Discord, idealmente un servidor/canal privado `asistente-personal`.
- **Cadencia**: tres digests diarios en Buenos Aires (mañana/tarde/noche) + alertas reactivas P0/P1.
- **Persistencia**: Railway Volume montado en `/data`.
- **Configuración estable del agente**: workspace seed con `AGENTS.md`, `SOUL.md`, `TOOLS.md` y prompts.

## Componentes

```mermaid
flowchart TD
  Railway["Railway service"] --> Wrapper["Setup wrapper Express"]
  Wrapper --> Gateway["OpenClaw Gateway"]
  Gateway --> Workspace["/data/workspace"]
  Gateway --> State["/data/.openclaw"]
  Gateway --> Discord["Discord bot/channel"]
  Gateway --> Gemini["Gemini API"]
  Gateway --> Cron["OpenClaw cron"]
  Cron --> Discord
  Workspace --> Instructions["AGENTS.md / SOUL.md / TOOLS.md"]
```

## Fuentes personales iniciales

- Gmail, Calendar y Drive de `matiasjriosb@gmail.com`.
- GitHub del usuario `MatiasJRB`.
- Repos locales de contexto: `ops` y `gastos-automaticos`.
- Futuro: conectores/API/MCP para Gmail, Calendar y GitHub con credenciales explícitas.

## Lo que esta base ya deja listo

- Imagen Docker actualizada a Node 24, alineada con el runtime recomendado por OpenClaw.
- Variables Railway alineadas con docs oficiales (`OPENCLAW_GATEWAY_PORT`, `/data`, token de gateway).
- Setup wizard capaz de usar `GEMINI_API_KEY` y `DISCORD_BOT_TOKEN` desde variables de entorno sin pegarlas en la UI.
- SecretRef para Discord cuando el token está en env.
- Redacción de secretos en output/logs del setup wrapper.
- Workspace inicial no destructivo: si `/data/workspace` ya tiene archivos, no los pisa.
- Scripts para instalar cron digests.

## Siguientes integraciones

1. Crear/confirmar Discord app + bot + canal privado.
2. Deploy Railway con Volume `/data` y variables.
3. Completar onboarding en `/setup`.
4. Instalar cron digests con `scripts/install-personal-crons.sh`.
5. Agregar conectores personales:
   - GitHub: `GITHUB_TOKEN` para notificaciones/issues/PRs/security alerts.
   - Gmail/Calendar: OAuth/API o MCP con cuenta `matiasjriosb@gmail.com`.
   - Ops/gastos: jobs que lean inventarios/ICS/mails relevantes.
