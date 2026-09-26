import type { Metadata, Viewport } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { OperacionProvider } from "../src/features/operacion/OperacionProvider";
import { PlanoProvider } from "../src/features/mesas/PlanoProvider";
import { CartaProvider } from "../src/features/mesas/CartaProvider";
import { TarifarioProvider } from "../src/features/park/TarifarioProvider";
import { tarifarioVigente } from "../src/features/park/tarifario.servidor";
import { SucursalProvider } from "../src/features/sucursal/SucursalProvider";
import { DispositivosProvider } from "../src/features/identity/DispositivosProvider";
import { RepresentantesProvider } from "../src/features/park/RepresentantesProvider";
import { TasasProvider } from "../src/features/cash/TasasProvider";
import { MediosProvider } from "../src/features/cash/MediosProvider";
import { CuentasProvider } from "../src/features/cuentas/CuentasProvider";
import { VentasProvider } from "../src/features/cash/VentasProvider";
import { PLANO_DEMO, CARTA_DEMO } from "../src/demo/restaurante";
import { AJUSTES_DEMO } from "../src/demo/sucursal";
import { DEMO_DISPOSITIVOS } from "../src/demo/dispositivos";
import { DIRECTORIO_DEMO } from "../src/demo/representantes";
import { HISTORIAL_DEMO } from "../src/demo/tasas";
import { MEDIOS_DEMO } from "../src/demo/medios";
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
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lo que ya tiene servidor sale de la base; lo demás, de `src/demo`, que se vacía paso a
  // paso de la ruta (MAESTRO §3 y M-6). El tarifario fue el primero (B0-5).
  const tarifario = await tarifarioVigente();

  return (
    <html lang="es-VE" className={`${quicksand.variable} ${inter.variable}`}>
      <body>
        <RegistroServiceWorker />
        {/* La operación del local (bus de eventos) por encima de las dos cáscaras:
            lo que emiten las estaciones lo leen el panel y las demás estaciones. */}
        <OperacionProvider>
          {/* V4: el plano publicado vive por encima de las dos cáscaras: lo
              edita el panel y lo lee el salón. */}
          {/* El estado del local vive por encima de las dos cáscaras: lo
              escriben las estaciones y lo lee el panel en vivo (F9-08).
              Cuentas y ventas arrancan vacías: no hay ninguna inventada. */}
          {/* Los ajustes del local y los equipos autorizados envuelven a todo
              lo demás: el formato de hora y el umbral de la caja los lee
              cualquier superficie (F5-08b, F4-04c, F2-02). */}
          <SucursalProvider inicial={AJUSTES_DEMO}>
            <DispositivosProvider inicial={DEMO_DISPOSITIVOS}>
              <RepresentantesProvider inicial={DIRECTORIO_DEMO}>
                <TasasProvider inicial={HISTORIAL_DEMO}>
                  <MediosProvider inicial={MEDIOS_DEMO}>
                    <PlanoProvider inicial={PLANO_DEMO}>
                      <CartaProvider inicial={CARTA_DEMO}>
                        <TarifarioProvider inicial={tarifario}>
                          <CuentasProvider inicial={[]}>
                            <VentasProvider inicial={[]}>
                              {children}
                            </VentasProvider>
                          </CuentasProvider>
                        </TarifarioProvider>
                      </CartaProvider>
                    </PlanoProvider>
                  </MediosProvider>
                </TasasProvider>
              </RepresentantesProvider>
            </DispositivosProvider>
          </SucursalProvider>
        </OperacionProvider>
      </body>
    </html>
  );
}
