import { ImageResponse } from "next/og";
import { dibujarIconoApp, type FondoDelIcono } from "../../../src/features/shell/iconoApp";

/**
 * Iconos de la app instalada (PWA), para el manifiesto.
 *
 * Los de uso general son el logo sobre transparente, casi de borde a borde. El «maskable» lleva fondo
 * claro y el logo en el 60 % del lado: Android lo recorta con su propia forma y solo garantiza el
 * círculo central del 80 % (un logo de 640 × 555 cabe entero en ese círculo hasta el 60 %).
 */
export const dynamic = "force-static";

const VARIANTES: Readonly<Record<string, { lado: number; porcentaje: number; fondo: FondoDelIcono }>> = {
  "192": { lado: 192, porcentaje: 92, fondo: "transparente" },
  "512": { lado: 512, porcentaje: 92, fondo: "transparente" },
  maskable: { lado: 512, porcentaje: 60, fondo: "claro" },
};

export function generateStaticParams() {
  return Object.keys(VARIANTES).map((variante) => ({ variante }));
}

export async function GET(_peticion: Request, { params }: { params: Promise<{ variante: string }> }) {
  // En Next 16 los parámetros llegan como promesa.
  const { variante } = await params;
  const v = VARIANTES[variante];
  if (!v) return new Response("No existe ese icono", { status: 404 });

  return new ImageResponse(dibujarIconoApp(v.lado, v.porcentaje, v.fondo), {
    width: v.lado,
    height: v.lado,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
