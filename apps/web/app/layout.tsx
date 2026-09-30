import type { Metadata, Viewport } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { OperacionProvider } from "../src/features/operacion/OperacionProvider";
import { TiempoRealProvider } from "../src/features/operacion/TiempoRealProvider";
import { sesionesEnCurso } from "../src/features/operacion/operacion.servidor";
import { SesionProvider } from "../src/features/identity/operador";
import { ElevacionProvider } from "../src/features/identity/ElevacionProvider";
import { NOMBRE_ROL } from "../src/features/identity/permisos";
import { sesionActual } from "../src/servidor/sesion";
import { PlanoProvider } from "../src/features/mesas/PlanoProvider";
import { CartaProvider } from "../src/features/mesas/CartaProvider";
import { TarifarioProvider } from "../src/features/park/TarifarioProvider";
import { tarifarioVigente } from "../src/features/park/tarifario.servidor";
import { SucursalProvider } from "../src/features/sucursal/SucursalProvider";
import { ajustesDelLocal } from "../src/features/sucursal/ajustes.servidor";
import { SalaProvider } from "../src/features/park/SalaProvider";
import { salaDelLocal } from "../src/features/park/parque.servidor";
import { TasasProvider } from "../src/features/cash/TasasProvider";
import { historialDeTasas } from "../src/features/cash/tasas.servidor";
import { MediosProvider } from "../src/features/cash/MediosProvider";
import { mediosDelLocal } from "../src/features/cash/medios.servidor";
import { CuentasProvider } from "../src/features/cuentas/CuentasProvider";
import { cuentasDelLocal } from "../src/features/cuentas/cuentas.servidor";
import { VentasProvider } from "../src/features/cash/VentasProvider";
import { ventasDelTurno } from "../src/features/cash/ventas.servidor";
import { PLANO_DEMO, CARTA_DEMO } from "../src/demo/restaurante";
import { RegistroServiceWorker } from "../src/features/shell/RegistroServiceWorker";

/* §8.3 — Quicksand para títulos (da el carácter del parque), Inter para
   interfaz y datos. Quicksand NUNCA para cifras: sus numerales no sirven
   para leer un total de un vistazo. */
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-loaded",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "L2 Control",
  description: "Gestión integral de parque infantil y restaurante",
  applicationName: "L2 Control",
  appleWebApp: {
    capable: true,
    title: "L2 Control",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  // §8.7: nunca se desactiva el zoom.
  initialScale: 1,
  width: "device-width",
  viewportFit: "cover",
  // En el teléfono de la monitora (B4-5) el teclado encoge la pantalla fija en vez de tapar el campo.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lo que ya tiene servidor sale de la base; lo demás, de `src/demo`, que se vacía paso a
  // paso de la ruta (MAESTRO §3 y M-6). El tarifario fue el primero (B0-5).
  const tarifario = await tarifarioVigente();
  // Los ajustes de la sucursal, de la base (B4-4): el formato de hora y el nombre los enseña también
  // el acceso, así que se leen sin sesión.
  const ajustes = await ajustesDelLocal();
  // Las tasas, de la base (B2-1): la caja solo cobra con la del día, confirmada.
  const tasas = await historialDeTasas();
  // Quién opera, leído de su cookie en el servidor (B1-4). El navegador no lo decide.
  const sesion = await sesionActual();
  const operador = sesion ? { id: sesion.userId, nombre: sesion.nombre, rol: NOMBRE_ROL[sesion.role], role: sesion.role } : null;
  // Los medios de pago, de la base (B3-2), y solo con alguien en sesión: los datos de cobro del
  // local no se mandan a la pantalla de acceso.
  const medios = sesion ? await mediosDelLocal() : null;
  // Las cuentas, de la base (B3-3): las que no están cobradas y las cobradas hoy. Sin sesión, ninguna.
  const cuentas = sesion ? await cuentasDelLocal() : [];
  // Las ventas del turno de este equipo, de la base (B3-4).
  const ventas = sesion ? await ventasDelTurno() : [];
  // Los niños en sala, de la base con la hora del servidor (B4-2). Sin sesión, ninguno.
  const sala = sesion ? await salaDelLocal() : null;
  // Quién está en cada puesto, de las sesiones de la base (B5-1). Solo para quien ve Inicio.
  const enCurso = sesion ? await sesionesEnCurso() : [];

  return (
    <html lang="es-VE" className={`${quicksand.variable} ${inter.variable}`}>
      <body>
        <RegistroServiceWorker />
        {/* La operación del local (bus de eventos) por encima de las dos cáscaras:
            lo que emiten las estaciones lo leen el panel y las demás estaciones, por el
            canal en vivo del worker (B5-1). */}
        <SesionProvider
          operador={operador}
          sesionId={sesion?.id ?? null}
          actor={sesion?.actor ?? null}
          branchId={sesion?.branchId ?? null}
        >
        <ElevacionProvider>
        {/* El canal en vivo (B5-1): por encima de todo lo que vuelve a leer cuando algo cambia. */}
        <TiempoRealProvider sesionId={sesion?.id ?? null}>
        {/* Los ajustes del local (B4-4) envuelven a todo lo demás: el formato de hora, la zona y los
            umbrales los lee cualquier superficie, y la sala los necesita para saber cuándo una
            estancia pasa a huérfana (F5-08b, F4-04c, D9). */}
        <SucursalProvider inicial={ajustes}>
        <SalaProvider inicial={sala}>
        <OperacionProvider sesiones={enCurso}>
          {/* V4: el plano publicado vive por encima de las dos cáscaras: lo
              edita el panel y lo lee el salón. */}
          {/* El estado del local vive por encima de las dos cáscaras: lo
              escriben las estaciones y lo lee el panel en vivo (F9-08).
              Las cuentas y las ventas del turno son de la base. */}
                <TasasProvider inicial={tasas}>
                  <MediosProvider inicial={medios}>
                    <PlanoProvider inicial={PLANO_DEMO}>
                      <CartaProvider inicial={CARTA_DEMO}>
                        <TarifarioProvider inicial={tarifario}>
                          <CuentasProvider inicial={cuentas}>
                            <VentasProvider inicial={ventas}>
                              {children}
                            </VentasProvider>
                          </CuentasProvider>
                        </TarifarioProvider>
                      </CartaProvider>
                    </PlanoProvider>
                  </MediosProvider>
                </TasasProvider>
        </OperacionProvider>
        </SalaProvider>
        </SucursalProvider>
        </TiempoRealProvider>
        </ElevacionProvider>
        </SesionProvider>
      </body>
    </html>
  );
}
