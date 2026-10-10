# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-10 · v0.122.0 (publicada) · `main` más este relevo · M-37 entregado entero (Claude); nada reclamado*

```text
M-37 entero, sin parar y publicado una vez al final (v0.122.0, con el permiso del usuario): v0.111.1 y once pasos, B4-17
  (precio del tiempo) · B6-15 (desvincular) · B3-16 (cobrar juntas) · B3-20 (dividir por ítems) · B3-19 (el vuelto) ·
  B6-16 (comanda de la venta directa, añadido) · B3-18 (anular y devolver, PIN de administración: cambia D-AUT) · B3-17
  (consumo del personal, con su vale) · T-20 (puestos por uso) · B11-6 (Reportes → Parque) · B11-7 (Movimientos).
Para la próxima visita al local: que las notas del mesero salgan en la comanda impresa (en el VPS se guardan e imprimen);
  revisar el área de cada producto (cocina, barra o sin papel), porque la venta directa saca comanda según ella; probar
  el consumo del personal con el vale firmado y el aviso de los puestos (Ajustes → Sucursal: vigilados y 15 min).
Siguen, del usuario: B8-3 con la capacitación de B8-2, B8-1 (4G y UPS) y B7-3; después B8-4 = 1.0.0 (Claude lista,
  solo leyendo, lo de prueba en la base del VPS; modo producción con D-ENT; la etiqueta 1.0.0). B6-4, tras el piloto.
Cuidado: una composición nueva de @l2/application pide reiniciar `pnpm dev`; «mover líneas» (movedTo) lo comparten
  desvincular, juntar y dividir; el cobro lleva vuelto, consumo del personal y comanda de caja: tocar uno es probar los
  tres; la auditoría guarda la hora de la base (las pruebas de Movimientos y puestos operan en el día de hoy).
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
