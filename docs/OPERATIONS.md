# Operación diaria

## Primer arranque

1. Deploy Railway + Volume `/data`.
2. Setear variables.
3. Abrir `/setup` con `SETUP_PASSWORD`.
4. Confirmar que el wizard detecta Gemini/Discord desde env.
5. Run Setup.
6. Abrir `/openclaw` y pegar/aprobar `OPENCLAW_GATEWAY_TOKEN` si lo pide.
7. En Discord, mandar mensaje al bot/canal y completar pairing si corresponde.
8. Ejecutar `POST /setup/api/configure-discord` para activar `channels.discord` sin resetear OpenClaw.
9. Ejecutar `POST /setup/api/discord/test` para confirmar que el canal recibe mensajes.
10. Ejecutar `POST /setup/api/crons/install-personal` para crear digests.

## Cron digests

Endpoint recomendado:

```text
POST /setup/api/crons/install-personal
```

Script equivalente para shell dentro del entorno OpenClaw:

```bash
scripts/install-personal-crons.sh
```

Crea:

- 09:00 ART — digest mañana.
- 15:00 ART — digest tarde.
- 21:00 ART — digest noche.

Usa `DISCORD_PERSONAL_CHANNEL_TARGET`, por ejemplo:

```env
DISCORD_PERSONAL_CHANNEL_TARGET=channel:123456789012345678
```

## Mantenimiento

- Después de upgrades: `openclaw doctor --fix`.
- Revisar `/setup/api/debug` si algo falla.
- Revisar `/setup/api/crons` para ver digests instalados.
- Revisar logs Railway si el gateway no levanta.
- Exportar backup desde `/setup` antes de cambios grandes.

## Reglas de seguridad operativa

- No subir `.env`, tokens ni exports con secretos.
- No publicar logs que contengan tokens.
- Si un secreto fue pegado en chat o repo, rotarlo.
- Cualquier acción irreversible detectada por el agente debe quedar pendiente de confirmación humana.
