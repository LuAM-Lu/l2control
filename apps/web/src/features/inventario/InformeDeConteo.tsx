"use client";

import { TriangleAlert } from "lucide-react";
import type { AjusteInventarioDto, Resultado } from "@l2/contracts";
import { diferenciasDeConteo } from "@l2/domain-inventory";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { DocumentoDeInforme, SeccionImpresa, enBandas, importe } from "../reportes/informe.tsx";

/**
 * El informe de diferencias de un conteo (B9-10, M-29): lo que faltó y lo que sobró, por categoría y por producto, al
 * costo con que se ajustó. Se guarda con el conteo (su fecha, quién contó y quién autorizó), así que un conteo se compara
 * con otro abriendo los dos. Una hoja A4 que el navegador imprime o guarda como PDF.
 */

const usd = (minor: bigint) => importe({ minor: String(minor), currency: "USD" });
const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export function InformeDeConteo({ ajuste }: { ajuste: Resultado<AjusteInventarioDto> }) {
  const reloj = useReloj();
  const { ajustes } = useSucursal();
  if (!ajuste.ok || ajuste.valor.tipo !== "CONTEO") {
    return (
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-3 py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {!ajuste.ok ? ajuste.mensaje : "Eso no es un conteo."}
        </p>
        <a href="/panel/inventario/salidas" className="text-detalle font-semibold text-brand underline">
          Volver a Salidas y conteo
        </a>
      </div>
    );
  }
  const a = ajuste.valor;
  const lineas = a.lineas.map((l) => ({ ...l, diferencia: l.cantidad, valorMinor: BigInt(l.valor.minor) }));
  const { total, porCategoria } = diferenciasDeConteo(lineas);
  const instante = Date.parse(a.en);
  const categorias = porCategoria.map((c) => c.categoria);

  return (
    <DocumentoDeInforme
      titulo="Informe de diferencias del conteo"
      local={ajustes.nombre}
      periodo={`Contado el ${reloj.diaConAnio(instante)} a las ${reloj.hora(instante)}`}
      filtro={`Contó ${a.por} · autorizó ${a.autorizadoPor}${a.detalle ? ` · ${a.detalle}` : ""}`}
      generadoEn={new Date().toISOString()}
      volver="/panel/inventario/salidas"
    >
      <dl className="mb-3 grid grid-cols-4 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Contados" valor={String(total.contados)} pie={`${total.cuadran} cuadraron`} />
        <Dato termino="Faltaron" valor={total.faltan > 0 ? `−${total.faltan}` : "0"} pie={total.faltan > 0 ? `${usd(total.faltanMinor)} al costo` : "nada"} />
        <Dato termino="Sobraron" valor={total.sobran > 0 ? `+${total.sobran}` : "0"} pie={total.sobran > 0 ? `${usd(total.sobranMinor)} al costo` : "nada"} />
        <Dato termino="Neto al costo" valor={total.netoMinor < 0n ? `− ${usd(-total.netoMinor)}` : usd(total.netoMinor)} pie="lo que movió el ajuste" />
      </dl>

      <SeccionImpresa
        seccion={{
          id: "categorias",
          titulo: "Por categoría",
          columnas: [
            { titulo: "Categoría" },
            { titulo: "Contados", derecha: true },
            { titulo: "Faltaron", derecha: true },
            { titulo: "Al costo", derecha: true },
            { titulo: "Sobraron", derecha: true },
            { titulo: "Al costo", derecha: true },
          ],
          filas: porCategoria.map((c) => [c.categoria, c.contados, c.faltan, usd(c.faltanMinor), c.sobran, usd(c.sobranMinor)]),
          pie: ["Total", total.contados, total.faltan, usd(total.faltanMinor), total.sobran, usd(total.sobranMinor)],
          vacio: "",
        }}
      />
      {/* B11-5: un renglón por producto, la categoría como franja, en una sola tabla. */}
      <SeccionImpresa
        seccion={enBandas(
          "productos",
          "Por producto",
          categorias.map((c) => ({
            id: c,
            titulo: c,
            columnas: [
              { titulo: "Producto" },
              { titulo: "Sistema", derecha: true },
              { titulo: "Contado", derecha: true },
              { titulo: "Diferencia", derecha: true },
              { titulo: "Al costo", derecha: true },
            ],
            filas: lineas
              .filter((l) => l.categoria === c)
              .map((l) => [
                l.nombre,
                l.esperado ?? "—",
                l.contado ?? "—",
                l.diferencia === 0 ? "cuadra" : conSigno(l.diferencia),
                l.valorMinor === 0n ? "—" : l.valorMinor < 0n ? `− ${usd(-l.valorMinor)}` : `+ ${usd(l.valorMinor)}`,
              ]),
            vacio: "",
          })),
        )}
      />
      <p className="text-[8.5pt]">
        Lo que faltó salió al costo promedio; lo que sobró entró al costo promedio o, sin existencia, al de su última entrada.
        «Sistema» es lo que el sistema decía al empezar a contar cada producto.
      </p>
    </DocumentoDeInforme>
  );
}

function Dato({ termino, valor, pie }: { termino: string; valor: string; pie: string }) {
  return (
    <div>
      <dt className="text-[8pt] font-semibold tracking-[0.05em] uppercase">{termino}</dt>
      <dd className="tnum text-[12pt] font-bold">{valor}</dd>
      <dd className="text-[8pt]">{pie}</dd>
    </div>
  );
}
