# Operación diaria

## Primer arranque

1. Deploy Railway + Volume `/data`.
2. Setear variables.
3. Abrir `/setup` con `SETUP_PASSWORD`.
4. Confirmar que el wizard detecta Gemini/Discord desde env.
5. Run Setup.
6. Abrir `/openclaw` y pegar/aprobar `OPENCLAW_GATEWAY_TOKEN` si lo pide.
7. En Discord, mandar mensaje al bot/canal y completar pairing si corresponde.
8. Ejecutar `scripts/install-personal-crons.sh` en el entorno OpenClaw para crear digests.

## Cron digests

Script:

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
- Revisar logs Railway si el gateway no levanta.
- Exportar backup desde `/setup` antes de cambios grandes.

## Reglas de seguridad operativa

- No subir `.env`, tokens ni exports con secretos.
- No publicar logs que contengan tokens.
- Si un secreto fue pegado en chat o repo, rotarlo.
- Cualquier acción irreversible detectada por el agente debe quedar pendiente de confirmación humana.
