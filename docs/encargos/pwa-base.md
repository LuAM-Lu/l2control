Haz que L2 Control se pueda INSTALAR como app (PWA) en tablets Android y que, instalada, abra sin la barra del navegador; las estaciones deben ir a pantalla completa (sin barra de estado de Android). En el navegador de escritorio todo debe seguir exactamente igual que hoy.

DECISIONES YA TOMADAS (no las cambies):
- PWA instalable desde Chrome («Instalar app»), no APK.
- display "standalone" en el manifiesto. Las ESTACIONES (/monitor, /entrada, /salida, /caja, /ventas, /turno, /mesas, /cocina) piden pantalla completa con la Fullscreen API; el PANEL (/panel…) conserva la barra de estado de Android.
- La pantalla completa SOLO se pide si la app está instalada (display-mode standalone o fullscreen). En un navegador normal no se pide nunca.
- Diseño responsive completo: orientation "any".

CONTEXTO QUE YA EXISTE (léelo antes de escribir):
- packages/config/tokens.css → al final, la sección «La app instalada (PWA)»: variables --seguro-arriba/derecha/abajo/izquierda y las clases .l2-solo-navegador y .l2-solo-instalada. Úsalas; NO las redefinas.
- Colores de marca (de tokens.css): base #0f172a, brand #eab308, on-brand #0f172a. Un icono generado no puede leer variables CSS: define esas tres constantes en UN solo sitio del código de iconos, con un comentario que diga que reflejan tokens.css.
- apps/web/app/layout.tsx → metadata y viewport actuales (themeColor ya es #0f172a).
- apps/web/app/(estacion)/layout.tsx y apps/web/src/features/shell/StationBar.tsx → la cáscara de las estaciones.
- apps/web/src/features/shell/BackOfficeShell.tsx → la cáscara del panel.
- apps/web/src/features/identity/AccesoScreen.tsx → el acceso por PIN; al acertar navega con un setTimeout de MS_DEL_SELLO.
- apps/web/src/features/identity/visibilidad.ts → puestoDe() dice a qué ruta entra cada persona.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO apps/web/app/manifest.ts
   Exporta default function manifest(): MetadataRoute.Manifest con: name "L2 Control · Abby Kingdom", short_name "L2 Control", description "Parque y restaurante: entrada, caja, mesas y cocina.", id "/", start_url "/acceso", scope "/", display "standalone", orientation "any", background_color "#0f172a", theme_color "#0f172a", lang "es-VE", dir "ltr", categories ["business", "productivity"], e iconos:
   { src: "/iconos/192", sizes: "192x192", type: "image/png", purpose: "any" },
   { src: "/iconos/512", sizes: "512x512", type: "image/png", purpose: "any" },
   { src: "/iconos/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" }.

2. NUEVO apps/web/app/iconos/[variante]/route.tsx
   GET que devuelve un PNG con ImageResponse de "next/og" para variante "192", "512" o "maskable" (cualquier otra: 404). Dibujo: fondo #0f172a; en el centro un cuadrado redondeado #eab308 con las letras «L2» en #0f172a, en negrita. En "maskable" el cuadrado ocupa como máximo el 60 % del lado (zona segura de Android: nada importante fuera del círculo central del 80 %). Cabecera Cache-Control: "public, max-age=31536000, immutable". Añade export const dynamic = "force-static" y generateStaticParams con las tres variantes.

3. NUEVO apps/web/app/apple-icon.tsx
   Icono de 180×180 con el mismo dibujo (convención de Next para apple-touch-icon). Reutiliza el dibujo del punto 2: crea apps/web/src/features/shell/iconoApp.tsx con una función que reciba el tamaño y la proporción del cuadrado y devuelva el JSX para ImageResponse, y úsala en los dos sitios.

4. apps/web/app/layout.tsx
   - viewport: añade viewportFit: "cover" (conserva lo que hay).
   - metadata: añade applicationName "L2 Control", appleWebApp: { capable: true, title: "L2 Control", statusBarStyle: "black-translucent" } y formatDetection: { telephone: false }.
   - Monta <RegistroServiceWorker /> (punto 7) dentro de <body>.

5. NUEVO apps/web/src/features/shell/pantallaCompleta.ts ("use client" no hace falta: son funciones)
   - esAppInstalada(): boolean → true si matchMedia("(display-mode: standalone)") o "(display-mode: fullscreen)" coinciden. false fuera del navegador.
   - esRutaDeEstacion(ruta: string): boolean → true para las 8 rutas de estación listadas arriba.
   - pedirPantallaCompleta(): void → si esAppInstalada(), document.fullscreenEnabled y no hay document.fullscreenElement, llama document.documentElement.requestFullscreen({ navigationUI: "hide" }) y captura (catch) cualquier rechazo SIN lanzar: si el navegador lo niega, se sigue sin pantalla completa.
   - salirDePantallaCompleta(): void → si hay document.fullscreenElement, document.exitFullscreen() con catch.
   Comentario de cabecera: por qué la pantalla completa solo se pide instalada y solo desde un gesto (la Fullscreen API exige activación del usuario).

6. Pedir y soltar la pantalla completa
   - AccesoScreen, en intentar(), en la rama del PIN correcto: ANTES del window.setTimeout, calcula el destino y, si esRutaDeEstacion(destino.ruta), llama pedirPantallaCompleta() ahí mismo (está dentro del clic de «Entrar»: hay activación del usuario).
   - StationBar: añade un botón con icono (Maximize / Minimize de lucide-react) que alterna pantalla completa, de 48×48 px como mínimo, con aria-label «Pantalla completa» / «Salir de pantalla completa», con la clase l2-solo-instalada (solo se ve en la app instalada). Escucha el evento fullscreenchange para saber el estado. Colócalo junto al botón de salir, sin mover lo demás.
   - BackOfficeShell: al montarse, llama salirDePantallaCompleta() (el panel conserva la barra de estado).

7. Service worker mínimo
   - NUEVO apps/web/public/sw.js: un service worker que NO cachea nada todavía. install → self.skipWaiting(); activate → self.clients.claim(); fetch → deja pasar la petición a la red sin tocarla (event.respondWith(fetch(event.request)) solo para peticiones GET del mismo origen; el resto, sin respondWith). Comentario de cabecera: existe para que Chrome ofrezca instalar la app; la caché sin conexión es ADR-003 y llega con el backend; cachear ahora serviría pantallas viejas.
   - NUEVO apps/web/src/features/shell/RegistroServiceWorker.tsx ("use client"): en un useEffect, si "serviceWorker" in navigator y process.env.NODE_ENV === "production", registra "/sw.js" con scope "/", con catch silencioso. Devuelve null. Comentario: en desarrollo no se registra para no interferir con la recarga en caliente.

8. Botón «Instalar la app» en el acceso
   - AccesoScreen, en la pantalla de «¿Quién entra?»: escucha beforeinstallprompt (guarda el evento, llama preventDefault) y appinstalled. Si hay evento guardado, muestra un botón secundario «Instalar la app» con icono (Download de lucide-react), de al menos 48 px, con la clase l2-solo-navegador, junto a los badges del dispositivo. Al pulsarlo llama prompt() y, tras userChoice, descarta el evento. Si nunca llega el evento, no se muestra nada.
   - Tipa el evento con una interfaz local BeforeInstallPromptEvent (no uses any).

9. Márgenes seguros
   - StationBar: el header usa padding-top: var(--seguro-arriba) y padding-left/right con max(valor actual, var(--seguro-izquierda/derecha)). No cambies su alto visible en el navegador (las variables valen 0 allí).
   - BackOfficeShell: el aside y el header móvil respetan var(--seguro-arriba) y var(--seguro-izquierda) del mismo modo.
   Usa clases arbitrarias de Tailwind 4 con las variables (por ejemplo pt-[var(--seguro-arriba)]), sin CSS nuevo.

NO HAGAS:
- No toques nada fuera de apps/. packages/ ya tiene lo que necesitas.
- No añadas dependencias (nada de next-pwa ni workbox).
- No cachees nada en el service worker.
- No cambies cómo se ve la app en un navegador de escritorio.
- No borres ni renombres archivos existentes.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué archivos tocaste, qué decidiste y qué quedó pendiente.
