import { ImageResponse } from "next/og";
import { dibujarIconoApp } from "../../../src/features/shell/iconoApp";

/**
 * Iconos de la app instalada (PWA), para el manifiesto.
 *
 * «maskable» deja el cuadrado en el 60 % del lado: Android recorta el icono con
 * su propia forma y solo garantiza el círculo central del 80 %.
 */
export const dynamic = "force-static";

const VARIANTES: Readonly<Record<string, { lado: number; porcentaje: number }>> = {
  "192": { lado: 192, porcentaje: 80 },
  "512": { lado: 512, porcentaje: 80 },
  maskable: { lado: 512, porcentaje: 60 },
};

export function generateStaticParams() {
  return Object.keys(VARIANTES).map((variante) => ({ variante }));
}

export async function GET(_peticion: Request, { params }: { params: Promise<{ variante: string }> }) {
  // En Next 16 los parámetros llegan como promesa (la versión de la obrera los
  // leía de forma síncrona).
  const { variante } = await params;
  const v = VARIANTES[variante];
  if (!v) return new Response("No existe ese icono", { status: 404 });

  return new ImageResponse(dibujarIconoApp(v.lado, v.porcentaje), {
    width: v.lado,
    height: v.lado,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
