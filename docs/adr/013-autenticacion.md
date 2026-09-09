# ADR-013 · Autenticación: Better Auth, con PIN para el piso

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F2-01.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 dice «JWT seguro» sin más. Auth.js/NextAuth está en modo mantenimiento y sus propios
mantenedores recomiendan Better Auth para proyectos nuevos.
**Decisión.** **Better Auth**, con sesión en **cookie `httpOnly`, `Secure`, `SameSite=Lax`** — nunca un
token en `localStorage`, que es robable por XSS.
**Dos modos de acceso, deliberadamente distintos:**
- **Administración y cierres:** usuario + contraseña + segundo factor obligatorio.
- **Piso (cajero, mesero, monitor, cocina):** **PIN corto sobre un dispositivo previamente registrado**.
  El dispositivo es el primer factor; el PIN, el segundo. Un PIN **nunca** es credencial suficiente
  desde un dispositivo desconocido.
**Controles obligatorios sobre el PIN.** Límite de intentos con bloqueo temporal creciente, PIN
almacenado con Argon2 igual que una contraseña, prohibición de secuencias triviales, rotación al salir
un empleado, y registro en auditoría de todo intento fallido.
**Consecuencias.** Entrar al POS toma dos segundos sin sacrificar el modelo de amenaza, porque el
dispositivo aporta el factor que el PIN no puede.
