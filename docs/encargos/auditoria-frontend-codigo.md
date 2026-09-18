Audita el frontend de L2 Control para que funcione bien en CUALQUIER tamaño de desktop y tablet (horizontal y vertical), y para que se pueda instalar como PWA en Android. Es una auditoría de CÓDIGO: la maestra mide en paralelo la app funcionando en el navegador; no repitas eso, busca lo que solo se ve leyendo el código.

ALCANCE (lee todo esto):
- apps/web/app/**            rutas, layouts, globals.css
- apps/web/src/features/**    pantallas y lógica de aplicación
- packages/ui/src/**          primitivos y patrones
- packages/config/tokens.css  tokens de diseño
Contexto obligatorio antes de empezar: CLAUDE.md, docs/PLAN.md §8 (diseño) y §9.10 (cáscaras), docs/cerrados/UX-MEJORAS.md y docs/cerrados/AUDITORIA-NAVEGACION.md (no repitas lo que ya dicen).

QUÉ BUSCAR, EN ESTE ORDEN DE IMPORTANCIA:

1. Responsive desktop y tablet (desde 768 px hasta 1920 px de ancho, en horizontal y vertical)
   - Anchos o altos fijos en px que rompen en otros tamaños; min-w que fuerzan scroll horizontal.
   - h-screen / 100vh donde en tablet debería ser dvh (la barra del navegador y el teclado cambian el alto).
   - Layouts que solo contemplan lg/xl y quedan mal entre 768 y 1024, o en vertical (800×1280).
   - Estaciones que desplazan cuando no deberían (preferencia del cliente: sin scroll a 1366×768 y 1280×800).
   - Texto que se corta o se monta, cifras largas en bolívares sin renglón propio.
   - Interacciones que solo funcionan con hover (en tablet no hay hover) o con teclado físico.
   - Objetivos táctiles por debajo del mínimo de su superficie (KDS 64, POS 56, tablet 48, admin 32).

2. Preparación PWA e instalación en Android
   - Falta de manifiesto, iconos (192, 512, maskable), theme-color, apple-touch-icon.
   - viewport sin viewport-fit=cover; falta de env(safe-area-inset-*) donde haría falta.
   - Estilos que no contemplan display-mode standalone/fullscreen.
   - Dónde encajaría pedir pantalla completa (Fullscreen API) al entrar a una estación, y qué lo impediría.

3. Accesibilidad e interfaz (skill web-design-guidelines)
4. React y Next.js (skill vercel-react-best-practices): componentes de cliente que podrían ser de servidor, efectos innecesarios, renders de más, importaciones pesadas.
5. Coherencia visual con los tokens (skill frontend-design; design-taste-frontend solo como criterio de calidad).

FORMATO DE SALIDA (en español, sin preámbulo):

Una lista de como máximo 60 hallazgos, ordenados de más a menos grave, cada uno así:

### G-NN · Título corto — gravedad (crítico | alto | medio | bajo)
- Dónde: archivo:línea (una o varias)
- Qué pasa y en qué tamaño o situación se nota
- Regla o skill que lo pide
- Arreglo propuesto, concreto
- Esfuerzo: S | M | L · Quién: obrera (si solo toca apps/) o maestra (si toca packages/ o decide diseño)

Después de la lista, una sección «Patrones repetidos» con los problemas que aparecen en muchos archivos y una propuesta para resolverlos de una vez (por ejemplo, un componente o un token nuevo).

Termina con «Lo que está bien», en pocas líneas, para no tocarlo.

No inventes: cita solo líneas que hayas leído. Si no pudiste leer algo, dilo.
