# ADR-029 · Equipo de confianza y app de autenticación junto a la llave de acceso

- **Estado:** Aceptada (2026-10-07, decisión del usuario al instalar el staging; M-23). **Supersede en parte
  ADR-020**: su punto 1 (la llave como único segundo factor), el 3 (la instalación exige una llave) y el 5 (se
  retira el TOTP). Siguen enteros los códigos de recuperación, la instalación con código del servidor, los
  enlaces de alta y el «segundo factor obligatorio» de ADR-013.
- **Fecha:** 2026-10-07
- **Situación en el código:** lo construye **T-9**, antes de seguir con la Etapa 7.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Al instalar el staging (B7-1), ni la laptop de administración (Windows sin PIN de Windows Hello:
`UnknownError`) ni una tableta Android (`NotReadableError`) pudieron crear una llave de acceso. ADR-020 la hizo
obligatoria para instalar y para confirmar identidad, así que con esos equipos **no se podía ni instalar**. El
usuario pide lo más fácil, ágil y eficaz para la administración de Abby: un equipo sin huella, sin Windows Hello
o sin servicios de Google no puede dejarla fuera. Y la confirmación caduca a los 15 minutos (`ELEVACION_MS`):
quien configura precios o personas la pide varias veces en una tarde.

**Decisión.**

1. **Equipo de confianza.** Una persona de administración puede marcar un equipo **aprobado** como suyo de
   confianza. En él, confirmar identidad pide **solo su contraseña**: el equipo hace de segundo factor (algo que
   se tiene: su credencial, que el servidor comprueba en cada petición, como hoy). La confianza es de **esa
   persona en ese equipo**: no da nada a otra persona en el mismo equipo, y un equipo de la operación (la caja,
   la tableta del mesero) solo es de confianza si administración lo decide. Marcarlo exige haber confirmado
   identidad con otro factor en ese momento; se ve y se retira desde Ajustes → Usuarios, y si el equipo se
   revoca, la confianza cae con él. Todo queda en la auditoría.
2. **App de autenticación (TOTP) como factor universal.** Google Authenticator, Authy, Microsoft Authenticator o
   el gestor de contraseñas del iPhone: un código de 6 cifras que cambia cada 30 s y se escribe en cualquier
   equipo. Se configura con un QR desde la propia sesión y se confirma con el primer código. **Un código ya
   aceptado no vale otra vez** (se guarda el último intervalo usado), lo que cierra la deuda del TOTP de antes.
   El secreto se guarda cifrado (AES-256, `L2_CLAVE_CIFRADO`).
3. **La llave de acceso sigue** y es lo más fuerte: donde el equipo puede, se usa con un toque.
4. **Confirmar identidad** = contraseña + uno de: equipo de confianza, llave, código de la app o código de
   recuperación. **Aprobar un equipo desde sí mismo** = contraseña + llave, código de la app o código de
   recuperación (el equipo todavía no es de nadie).
5. **Instalar sin llave.** El paso de la contraseña ofrece crear además una llave «si este equipo puede»; sin
   ella, el equipo de la instalación queda **de confianza** para la primera administración. Lo mismo en el
   enlace de alta: la llave pasa a ser opcional.
6. **La Puesta a punto** recomienda configurar la app (o una llave) para poder confirmar desde otros equipos.

**Consecuencias.** Se instala y se administra desde cualquier equipo, y el día a día en el PC propio es solo la
contraseña. A cambio: un equipo de confianza es tan seguro como su credencial y su custodia (quien se siente en
él con la sesión de administración abierta y sepa la contraseña puede confirmar); por eso la confianza es por
persona, se marca a propósito y se retira en un clic. El TOTP vuelve a depender de una app en el teléfono, que
ADR-020 quería evitar: es opcional y la elige cada persona. Se suman dos tablas (solo expandir, ADR-028):
`trusted_device` y `totp_credential`; `staff_user.totp_secret_enc` sigue sin uso hasta su contracción.
