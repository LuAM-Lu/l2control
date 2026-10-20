# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-20 · v0.155.0 en `main` y publicada (el VPS en 0.155.0) · M-40 entregado entero; nada reclamado salvo B8-4*

```text
M-40 entero en main, sin parar entre pasos: v0.143.1 y T-24 a T-26 (v0.144.0 a v0.155.0), tres migraciones de expandir.
Publicada a las 9:02 am con la etiqueta v0.155.0: el VPS la puso en 45 s, con respaldo antes; salud en verde, sin errores.
Lo nuevo, para mirarlo en el local el fin de semana: «Cédula o RIF» en un solo campo; sentar «Más rápido» o «Más seguro»
  (Ajustes → Sucursal); la caja ve las cuentas del salón y ofrece «Traer a la caja y cobrar»; «Cobrar lo que va»; «Pedir
  anulación» sin administración en el local; la fila de la mesa y «Lo más pedido hoy»; el aviso de la caja abierta a la
  hora de cierre (10:00 pm de fábrica); Clientes (en lugar de Representantes); el cierre del parque; Reportes → Parque.
La PC de los respaldos («PC Lenovo Laptop») no baja desde el 17 de octubre: correr su tarea en esa PC.
Siguiente: B8-4, la 1.0.0 (MAESTRO §3): un lunes con el local cerrado tras probar el bloque un fin de semana (el primero
  posible, el 26). Antes, del usuario: B8-1 (el 4G y la UPS), decidir «Linux Home andruwXOX» y «T an lwt», y «Actualizar
  ahora» del agente de impresión si no se puso al día solo.
Cuidado: el día de negocio termina a las 4:00 am; una pantalla nueva de la ayuda va en manual.ts con su ruta (y su
  ?pestana= si la pide), y un paso nuevo de un recorrido lleva `desde` con su versión subida.
```

## aemorandin-coder

*2026-10-06 (cierre) · v0.52.3 · `main` en 7382057 más este relevo*

```text
Hecho hoy, todo en main: T-2 (v0.51.0), T-4 (v0.52.0) y cuatro entregas entre pasos. 52 de 62 pasos; nada a medias ni reclamado.
T-4 (ADR-020): con la base vacía el acceso ofrece «Instalar L2 Control» (código del registro del servidor); confirmar
  identidad y aprobar un equipo piden contraseña + llave de acceso, o un código de recuperación; Ajustes → Usuarios da
  credenciales con un enlace de 24 h con QR (/alta); Inicio enseña la Puesta a punto. Ya no hay TOTP ni pnpm totp.
v0.51.1: fondos de estado con más luz que la tarjeta e iconos de aviso animados (por selector en tokens.css; `l2-quieto` apaga uno).
v0.52.1: un doble clic al anular un cobro ya no responde «ya se revirtió» (carrera en pagos.revertir; puso main en rojo).
v0.52.2 (M-21): tema claro, predeterminado y por equipo (cookie l2_tema, data-tema en <html>, botón en el acceso y el menú).
  En claro, los avisos rojos y amarillos son bloques sólidos y sus tokens se redefinen dentro. v0.52.3: logo de L2 (LogoL2).
Siguiente: T-8 (actualizaciones, ADR-028), libre. Criterio en MAESTRO §3: una etiqueta vX.Y.Z publica las imágenes y el agente;
  Ajustes → Sistema decide cuándo; con la salud forzada a fallar vuelve sola atrás. No hay ningún Dockerfile: es lo primero.
Al actualizar tu copia: pnpm install, pnpm db:migrar (solo expande) y L2_URL_PUBLICA=http://localhost:3000 en tu .env; entra
  siempre por localhost. Para confirmar identidad hace falta una llave: pnpm credenciales "Abigail Karam" da el enlace, y en
  Chrome sirve el autenticador virtual de DevTools → WebAuthn.
Cuidado: mira cada pantalla en los DOS temas; un local recién instalado no tiene tarifario (no lo exijas en el layout); una
  prueba de concurrencia de una sola pasada engaña. Sin ver: sala y mesas en alerta en claro. «Abby Kingdom», a mano (§5).
```
