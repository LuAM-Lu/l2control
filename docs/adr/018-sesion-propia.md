# ADR-018 · Sesión propia sobre la base con RLS, en lugar de Better Auth

- **Estado:** Aceptada. **Supersede a [ADR-013](013-autenticacion.md) solo en la biblioteca**: todos sus
  controles siguen vigentes.
- **Fecha:** 2026-09-26
- **Situación en el código:** Etapa 1 del backend (MAESTRO §3, B1-2 a B1-4).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** ADR-013 eligió Better Auth para la sesión. Al llegar a implementarlo, choca con ADR-002. Better
Auth guarda usuarios, sesiones y cuentas en **sus** tablas y las consulta con **su** cliente, fuera de la
transacción que fija `app.tenant_id`. Con la RLS forzada, esas consultas no ven ninguna fila. Solo hay dos
salidas y las dos son malas:

- Sacar esas tablas de la RLS. Serían las únicas sin aislamiento por tenant, y además las que guardan
  credenciales.
- Darle a Better Auth un usuario de base con `BYPASSRLS`. `abrirBase()` lo prohíbe a propósito: conectarse
  así apaga el aislamiento sin que nadie lo note.

Además, lo que este negocio necesita no es lo que Better Auth resuelve bien, que es correo, OAuth y
recuperación por enlace. Lo que necesita es:

- **PIN sobre un dispositivo registrado**, que Better Auth no trae y habría que escribir igual.
- **Segundo factor para administración.**

**Decisión.** Una capa de sesión propia, pequeña y probada, dentro de `@l2/application` y sobre las mismas
tablas con RLS que todo lo demás. Se usan piezas estándar, sin criptografía casera:

- **Dispositivo:** un secreto aleatorio de 256 bits por equipo, guardado en una cookie `httpOnly`. En la
  base se guarda solo su hash SHA-256; el secreto no está en ningún otro sitio. El registro del
  dispositivo es el primer factor.
- **PIN:** Argon2id (`@node-rs/argon2`), con el bloqueo creciente de `@l2/domain-identity`. Nunca viaja
  ni se guarda en claro.
- **Sesión:** un token aleatorio de 256 bits en cookie `httpOnly`, `Secure` (fuera de desarrollo) y
  `SameSite=Lax`, con su hash en la base. Caduca por inactividad y **se cierra de verdad en el servidor**:
  al salir, al revocar el dispositivo, al dar de baja a la persona y con el corte Z.
- **Segundo factor:** TOTP (RFC 6238) con contraseña, como **elevación** de una sesión de administración.
  Se pide al entrar en configuración, precios, usuarios y reportes globales (F2-04) y dura un rato. No se
  pide para abrir sesión en el piso.
- **Cada cookie lleva el tenant en claro**, junto al id y al secreto. El tenant no es secreto; sirve para
  abrir la transacción correcta. Una cookie con el tenant cambiado busca en otro tenant una sesión que no
  existe y se rechaza.

**Qué se conserva de ADR-013, sin cambios:**

- Nunca un token en `localStorage`.
- El dispositivo es el primer factor.
- El PIN nunca basta desde un dispositivo desconocido.
- Argon2, límite de intentos y bloqueo creciente.
- PIN trivial prohibido.
- Todo intento fallido se audita.

**Consecuencias.**

- Hay más código propio que mantener, pero es poco: tokens, hashes y comprobaciones, cada uno con su prueba.
- La recuperación de contraseña de administración no es un enlace por correo: se repone desde otro
  administrador o, si no queda ninguno, con un comando del servidor. En un local de un solo administrador
  eso está documentado en el runbook (F10-10).
- Si algún día hace falta OAuth o correo, se evalúa entonces una biblioteca que se pueda montar sobre estas
  mismas tablas.
