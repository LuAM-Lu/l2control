"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Baby, Clock, FileDown, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import type { InformeDelParqueDto } from "@l2/contracts";
import { Cifra, Container, FiltroSegmentado, PageHeader, Resumen, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { ParquePedido } from "./reportes.servidor.ts";
import { FiltroDePeriodo, TablaDeInforme, importe, periodoEnPalabras } from "./informe.tsx";
import { direccionDelParque, duracion, seccionesDelParque, type SeccionDelParque } from "./parque.tsx";

/**
 * Panel → Reportes → Parque (B11-6, M-37). De solo lectura, para administración y supervisión: los niños por día y por
 * hora con el aforo pico, el dinero del tiempo (también lo que se pagó en las mesas), las estancias y las excepciones. El
 * periodo va en la dirección; el PDF lleva todas las secciones.
 */

const RUTA = "/panel/reportes/parque";
const IMPRESION = "/informes/parque";

const PESTANA: Readonly<Record<SeccionDelParque, string>> = { dias: "Por día", horas: "Por hora", dinero: "Dinero", estancias: "Estancias", excepciones: "Excepciones" };

export function ParqueReporteScreen({ hoy, pedido, informe }: ParquePedido) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: { desde: string; hasta: string }) => iniciar(() => router.push(direccionDelParque(RUTA, p) as Route));
  // Una entrada, una salida o una recarga mientras se mira.
  useAlCambiar(["sala"], () => router.refresh());

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Parque" }]}
        titulo="Parque"
        descripcion="Los niños por día y por hora con el aforo pico, el dinero del tiempo (paquetes, recargas y tiempo de más, también lo pagado en mesas), las estancias y las excepciones."
        acciones={
          informe.ok && (
            <Link
              href={direccionDelParque(IMPRESION, pedido) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />

      <FiltroDePeriodo key={`${pedido.desde}|${pedido.hasta}`} hoy={hoy} desde={pedido.desde} hasta={pedido.hasta} cargando={cargando} onPeriodo={ir} />

      {!informe.ok ? (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.problemas?.[0]?.message ?? informe.mensaje}
        </p>
      ) : (
        <Informe informe={informe.valor} cargando={cargando} />
      )}
    </Container>
  );
}

function Informe({ informe, cargando }: { informe: InformeDelParqueDto; cargando: boolean }) {
  const reloj = useReloj();
  const { formatoHora } = useSucursal().ajustes;
  const [pestana, setPestana] = useState<SeccionDelParque>("dias");
  const secciones = seccionesDelParque(informe, reloj, formatoHora);
  const seccion = secciones.find((s) => s.id === pestana) ?? secciones[0]!;
  const r = informe.resumen;
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">{periodoEnPalabras(informe.periodo)}</p>
      <Resumen etiqueta="Resumen del parque">
        <Cifra etiqueta="Niños" icono={<Baby />} valor={String(r.ninos)} pie={r.ninos === 0 ? "Nadie entró" : `${informe.porDia.length} ${informe.porDia.length === 1 ? "día" : "días"}`} tono="idle" onClick={() => setPestana("dias")} activo={pestana === "dias"} />
        <Cifra
          etiqueta="Aforo pico"
          icono={<TrendingUp />}
          valor={r.pico ? `${r.pico.ninos} de ${r.aforo}` : "—"}
          pie={r.pico ? reloj.diaYHora(Date.parse(r.pico.en)) : "Sin estancias"}
          tono={r.pico && r.pico.ninos >= r.aforo ? "warn" : "idle"}
          onClick={() => setPestana("horas")}
          activo={pestana === "horas"}
        />
        <Cifra etiqueta="Tiempo promedio" icono={<Clock />} valor={duracion(r.minutosPromedio)} pie="sin las pausas por comida" tono="idle" onClick={() => setPestana("estancias")} activo={pestana === "estancias"} />
        <Cifra etiqueta="Dinero del tiempo" icono={<Wallet />} valor={importe(r.dinero)} pie={`de ello en mesas ${importe(informe.dinero.enMesas.monto)}`} tono="idle" onClick={() => setPestana("dinero")} activo={pestana === "dinero"} />
      </Resumen>
      <FiltroSegmentado<SeccionDelParque>
        etiqueta="Qué ver"
        opciones={secciones.map((s) => ({ id: s.id, nombre: PESTANA[s.id], ...(s.id === "excepciones" ? { cuenta: informe.excepciones.length } : {}) }))}
        valor={pestana}
        onCambiar={setPestana}
      />
      <TablaDeInforme seccion={seccion} />
    </div>
  );
}
