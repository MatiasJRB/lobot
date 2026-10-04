# Lobot — instrucciones de agentes

Antes de cambiar el intake o puente de Ali, leer
`docs/ALI_CONVERSATION_INTAKE.md` y su fuente ejecutable, issue #5.
El trabajo de Asiento Libre conserva su separación del Secretario y de otras
cuentas/proyectos. No revertir cambios ajenos ni ampliar permisos por inferencia.

## Circuito humano de Ali

- En el grupo, responder únicamente a una invocación literal `@lobot`. La
  conversación sin mención se registra silenciosamente; nunca cae al modelo
  personal. Una respuesta propia de Ali tampoco dispara otra respuesta.
- Al desplegar Lobot compartido, conservar `before_dispatch`, `message_sending`
  y los módulos `ali-group*`. Verificar la fuente viva y conciliar cambios de
  otros antes de publicar: `groupActivation=always` requiere ambos filtros.
- Un fallo del puente queda pendiente; no habilita una respuesta del modelo
  personal. Los mensajes del grupo nunca se aplican como decisiones personales.
- Todo mensaje al grupo en nombre de Ali comienza con `🤖 Ali:` exactamente una
  vez, también en borradores manuales y avisos de publicación. Verificarlo antes
  de la aprobación final; no aplicar la firma a mensajes humanos de Matías.
- WhatsApp es el canal de Joaquín; no exigirle seguir GitHub o commits.
- Issues/Project son la fuente de trabajo; la vista privada es un resumen humano.
- Una respuesta rápida no sustituye el registro ni la trazabilidad de un pendiente.
- Conservar consulta/definición/trabajo/bloqueo/resultado reportado como categorías
  distintas. Reportado, registrado, implementado y verificado no son equivalentes.
- Preparar el próximo paso, dependencias y evidencia antes de reflejar una entrega.
- Reutilizar delta/cursor, ventanas y presupuestos existentes. La proyección de
  la vista es determinista; no añade llamadas al modelo ni otra automatización.
- QA conserva aislamiento read-only y el escritor GitHub su alcance actual.
  Este contrato no habilita Cloudflare, mensajes, operaciones financieras ni deploy.
- Ante fuente cambiada o entrega incierta, conservar pendiente y conciliar.
- Verificar captura, registro, vista publicada/acceso y respuesta por separado;
  no declarar todo operativo porque haya tests verdes o una preview local.
- Validar con operaciones reales y tests locales sin proveedor. No pruebas al
  grupo, replay de jobs ni reenvíos de respuestas.
