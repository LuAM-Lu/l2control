# ADR-020 · Llaves de acceso en lugar de TOTP, e instalación inicial sin consola

- **Estado:** Aceptada (2026-09-27; el cliente delegó la decisión). **Supersede la elección de TOTP
  de ADR-018** (segundo factor); el resto de ADR-018 y el «segundo factor obligatorio» de ADR-013
  siguen enteros.
- **Fecha:** 2026-09-27
- **Situación en el código:** hecho en el paso T-4 del MAESTRO (2026-10-06). Llaves WebAuthn con
  SimpleWebAuthn (`identidad/llaves.ts`), diez códigos de recuperación, elevación y aprobación de equipo
  con contraseña + llave o código, enlaces de alta de 24 h con QR (Ajustes → Usuarios y `/alta`),
  instalación inicial con código del registro (`/acceso` con la base vacía) y Puesta a punto en Inicio.
  `pnpm totp` y `otpauth` se retiraron; `pnpm credenciales` imprime un enlace de alta. Queda la columna
  `totp_secret_enc`, sin uso, hasta una migración de contracción (ADR-028; MAESTRO §5).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Hoy la administración confirma su identidad con contraseña y un código TOTP de una app
de autenticación (Google Authenticator, Authy…), y esas credenciales solo se dan desde la consola del
servidor. El cliente señala dos problemas:

1. **En producción la base arranca vacía.** No hay local, ni personas, ni equipos. Hoy el primer
   administrador y su primer equipo solo se pueden crear desde la consola del servidor, que el
   cliente no maneja.
2. **Instalar una app de terceros** en el teléfono de cada administrador es un paso que se olvida,
   se pierde con el teléfono y cuesta explicarlo.

**Decisión.**

1. **Llaves de acceso (WebAuthn / passkeys) como segundo factor.** Las guarda el propio equipo o el
   teléfono, sin apps de terceros: Windows Hello (huella, cara o PIN del PC), el bloqueo de pantalla
   de Android (Gestor de contraseñas de Google) o de iPhone (Llavero de iCloud). Se confirma
   identidad con la contraseña más la llave, igual que hoy con el TOTP: al aprobar un equipo (M-7) y
   al elevar la sesión (F2-04). La llave está atada al dominio del sistema, así que una página falsa
   no puede pedirla, y no hay un código que se pueda dictar o reutilizar (cierra la deuda del TOTP
   reutilizable dentro de su ventana).
2. **Dos llaves por administrador, como mínimo** (por ejemplo, el PC de la oficina y el teléfono), y
   **diez códigos de recuperación** de un solo uso que se enseñan una vez para imprimirlos y
   guardarlos. Sirven si se pierden las dos llaves o si no hay internet para usar el teléfono desde
   otro equipo. Cada uso queda en la auditoría.
3. **Instalación inicial desde el navegador.** Con la base vacía, el acceso muestra «Instalar L2
   Control»: nombre del local y de la sucursal, el primer administrador (nombre, contraseña y PIN),
   su llave de acceso, sus códigos de recuperación, y este equipo queda aprobado. Para que nadie se
   adelante a instalarlo, pide un **código de instalación** de un solo uso que el servidor escribe
   en su registro al arrancar con la base vacía (lo lee quien despliega). Hecha la instalación, la
   pantalla desaparece para siempre.
4. **Credenciales desde el panel.** Administración da de alta a otra persona de administración en
   Panel → Personas y le genera un **enlace de alta** de un solo uso (24 h, con QR en pantalla). Esa
   persona lo abre en su equipo o su teléfono, pone su contraseña, registra su llave y recibe sus
   códigos de recuperación. La consola (`pnpm credenciales`) queda como puerta de emergencia, como
   `pnpm equipos`.
5. **Se retira el TOTP**, con su secreto cifrado y `pnpm totp`. En desarrollo, las pruebas de
   navegador usan el autenticador virtual de WebAuthn que trae Chromium (Playwright).

**Consecuencias.** Ningún paso de la puesta en marcha exige la consola ni una app de terceros, y el
segundo factor es más fuerte que el TOTP. A cambio: WebAuthn exige HTTPS fuera de `localhost` (que ya
exige B7-1), hace falta una biblioteca auditada para verificar las firmas (SimpleWebAuthn) y hay que
diseñar bien la recuperación. Sin llave y sin códigos, una persona de administración solo recupera
el acceso por la consola del servidor o con otra persona de administración: por eso la regla de
operación sigue siendo tener dos (M-7).
