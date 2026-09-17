import type { Metadata, Viewport } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { PanelSimulacion } from "../src/features/simulacion/PanelSimulacion";
import { SimulacionProvider } from "../src/features/simulacion/SimulacionProvider";
import { PlanoProvider } from "../src/features/mesas/PlanoProvider";
import { CartaProvider } from "../src/features/mesas/CartaProvider";
import { TarifarioProvider } from "../src/features/park/TarifarioProvider";
import { CuentasProvider } from "../src/features/cuentas/CuentasProvider";
import { VentasProvider } from "../src/features/cash/VentasProvider";
import { DEMO_ACTIVA } from "../src/demo/modo";
import { PLANO_DEMO, CARTA_DEMO } from "../src/demo/restaurante";
import { TARIFARIO_DEMO } from "../src/demo/parque";
import { DEMO_CUENTAS } from "../src/demo/cuentas";
import { DEMO_VENTAS } from "../src/demo/ventas";
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
  appleWebApp: { capable: true, title: "L2 Control", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  // §8.7: nunca se desactiva el zoom.
  initialScale: 1,
  width: "device-width",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-VE" className={`${quicksand.variable} ${inter.variable}`}>
      <body>
        <RegistroServiceWorker />
        {/* F1-19: por encima del panel y de las estaciones, para que las dos
            cáscaras vean la misma simulación. */}
        <SimulacionProvider>
          {/* V4: el plano publicado vive por encima de las dos cáscaras: lo
              edita el panel y lo lee el salón. */}
          {/* El estado del local vive por encima de las dos cáscaras: lo
              escriben las estaciones y lo lee el panel en vivo (F9-08).
              Con la demo apagada, se arranca sin cuentas ni ventas. */}
          <PlanoProvider inicial={PLANO_DEMO}>
            <CartaProvider inicial={CARTA_DEMO}>
              <TarifarioProvider inicial={TARIFARIO_DEMO}>
                <CuentasProvider inicial={DEMO_ACTIVA ? DEMO_CUENTAS : []}>
                  <VentasProvider inicial={DEMO_ACTIVA ? DEMO_VENTAS : []}>
                    {children}
                    <PanelSimulacion />
                  </VentasProvider>
                </CuentasProvider>
              </TarifarioProvider>
            </CartaProvider>
          </PlanoProvider>
        </SimulacionProvider>
      </body>
    </html>
  );
}
