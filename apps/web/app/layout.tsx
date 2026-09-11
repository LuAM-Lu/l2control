import type { Metadata, Viewport } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { PanelSimulacion } from "../src/features/simulacion/PanelSimulacion";
import { SimulacionProvider } from "../src/features/simulacion/SimulacionProvider";

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
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  // §8.7: nunca se desactiva el zoom.
  initialScale: 1,
  width: "device-width",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-VE" className={`${quicksand.variable} ${inter.variable}`}>
      <body>
        {/* F1-19: por encima del panel y de las estaciones, para que las dos
            cáscaras vean la misma simulación. */}
        <SimulacionProvider>
          {children}
          <PanelSimulacion />
        </SimulacionProvider>
      </body>
    </html>
  );
}
