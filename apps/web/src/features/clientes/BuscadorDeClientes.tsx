"use client";

import { useEffect, useMemo, useState } from "react";
import { Baby, Receipt, Search, TriangleAlert, UserRound } from "lucide-react";
import type { ClienteEncontradoDto, EstanciaDto, FamilyAccountDto } from "@l2/contracts";
import { money, sum, toMajor } from "@l2/domain-money";
import { Dialog, Input, formatMoneyVE } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";
import { useSala } from "../park/SalaProvider.tsx";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { encontrarClientes } from "./clientes.acciones";

/**
 * El buscador de clientes — T-19 (M-34, S-19). Lo abren la caja, el salón y la sala.
 *
 * Por su nombre, su cédula (con o sin letra) o su teléfono, como se escriba. El directorio lo busca el servidor (con lo
 * que debe, B3-11); lo abierto lo pone esta pantalla con lo que ya tiene: sus cuentas sin cobrar y sus niños en la
 * sala. Una cuenta abierta a nombre de alguien que no está en el directorio (su teléfono era de otra persona) también
 * sale. Los datos llevan `data-privado` (PLAN §7.6).
 */

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const ABIERTAS: readonly FamilyAccountDto["status"][] = ["ABIERTA", "POR_COBRAR"];

type Resultado = Readonly<{
  clave: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  deudas: ClienteEncontradoDto["deudas"];
  cuentas: readonly FamilyAccountDto[];
  ninos: readonly EstanciaDto[];
}>;

/** Lo abierto de quien coincide con lo escrito, aunque no esté en el directorio. */
function coincideLaCuenta(c: FamilyAccountDto, texto: string): boolean {
  if (!c.cliente) return false;
  const q = sinAcentos(texto.trim());
  const cifras = q.replace(/\D/g, "");
  if (cifras.length >= 5) return [c.cliente.cedula, c.cliente.telefono].some((d) => d.replace(/\D/g, "").includes(cifras));
  return q.length >= 3 && sinAcentos(c.cliente.nombre).includes(q);
}

export function BuscadorDeClientes({
  abierto,
  onCerrar,
  alAbrirCuenta,
  puedeAbrir = () => true,
}: {
  /** Qué cuentas abre esta pantalla (la caja, las que están por cobrar). */
  puedeAbrir?: (c: FamilyAccountDto) => boolean;
  abierto: boolean;
  onCerrar: () => void;
  /** Lo que hace la pantalla con una cuenta abierta del cliente (la caja la elige; el salón abre su mesa). */
  alAbrirCuenta?: ((c: FamilyAccountDto) => void) | undefined;
}) {
  const [texto, setTexto] = useState("");
  const [respuesta, setRespuesta] = useState<{ texto: string; clientes: readonly ClienteEncontradoDto[] } | { texto: string; error: string } | null>(null);
  const { cuentas } = useCuentas();
  const { sala } = useSala();
  const hora = useHora();
  const buscado = texto.trim();
  const listo = buscado.length >= 3;

  useEffect(() => {
    if (!abierto || !listo) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      encontrarClientes({ texto: buscado })
        .then((r) => {
          if (!vivo) return;
          setRespuesta(r.ok ? { texto: buscado, clientes: r.valor } : { texto: buscado, error: r.mensaje });
        })
        .catch(() => vivo && setRespuesta({ texto: buscado, error: "Sin conexión con el servidor: no se pudo buscar." }));
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [abierto, listo, buscado]);

  const vigente = respuesta?.texto === buscado ? respuesta : null;
  const resultados = useMemo((): Resultado[] => {
    if (!vigente || "error" in vigente) return [];
    const abiertas = cuentas.filter((c) => ABIERTAS.includes(c.status));
    const sesiones = sala?.sessions ?? [];
    const vistos = new Set<string>();
    const delDirectorio = vigente.clientes.map((c): Resultado => {
      const ninos = sesiones.filter((s) => s.guardianId === c.clienteId);
      const suyas = abiertas.filter((a) => a.cliente?.clienteId === c.clienteId || ninos.some((s) => s.accountId === a.id));
      for (const a of suyas) vistos.add(a.id);
      return { clave: c.clienteId, nombre: c.nombre, cedula: c.cedula, telefono: c.telefono, deudas: c.deudas, cuentas: suyas, ninos };
    });
    const sueltas = abiertas
      .filter((a) => !vistos.has(a.id) && coincideLaCuenta(a, buscado))
      .map((a): Resultado => ({ clave: a.id, nombre: a.cliente!.nombre, cedula: a.cliente!.cedula, telefono: a.cliente!.telefono, deudas: [], cuentas: [a], ninos: [] }));
    // Primero quien tiene algo abierto o debe: es a quien se busca casi siempre.
    const peso = (r: Resultado) => r.cuentas.length + r.ninos.length + r.deudas.length;
    return [...delDirectorio, ...sueltas].sort((a, b) => Number(peso(b) > 0) - Number(peso(a) > 0));
  }, [vigente, cuentas, sala, buscado]);

  return (
    <Dialog
      abierto={abierto}
      onCerrar={() => {
        setTexto("");
        setRespuesta(null);
        onCerrar();
      }}
      titulo="Buscar cliente"
      descripcion="Por su nombre, su cédula o su teléfono: lo que tiene abierto, sus niños en la sala y lo que debe."
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Nombre, cédula o teléfono"
          surface="tablet"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          leading={<Search className="size-(--icono-texto)" aria-hidden="true" />}
          placeholder="María Pérez, 12.345.678 o 0414-123.45.67"
          data-privado=""
        />

        {!listo ? (
          <p className="text-detalle text-ink-3">Escribe al menos 3 letras o dígitos.</p>
        ) : !vigente ? (
          <p role="status" className="text-detalle text-ink-3">
            Buscando…
          </p>
        ) : "error" in vigente ? (
          <p role="alert" className="flex items-center gap-1.5 text-detalle text-state-crit">
            <TriangleAlert className="size-(--icono-texto) shrink-0" aria-hidden="true" />
            {vigente.error}
          </p>
        ) : resultados.length === 0 ? (
          <p role="status" className="flex items-start gap-1.5 text-detalle text-ink-2">
            <UserRound className="mt-0.5 size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
            Nadie con ese nombre, cédula o teléfono. Si es la primera vez que viene, se registra al sentarlo o en la entrada.
          </p>
        ) : (
          <ul className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto" aria-label="Clientes encontrados">
            {resultados.map((r) => (
              <li key={r.clave} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
                <p className="text-cuerpo font-semibold text-ink" data-privado="">
                  {r.nombre}
                </p>
                <p className="tnum text-detalle text-ink-2" data-privado="">
                  {[r.cedula ?? "Sin cédula", r.telefono].filter(Boolean).join(" · ")}
                </p>
                {r.deudas.length > 0 && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg px-2 py-1 text-detalle text-state-warn">
                    <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
                    Debe {formatMoneyVE(toMajor(sum(r.deudas.map((d) => money(BigInt(d.monto.minor), "USD")), "USD")), "USD")} de antes: se cobra en la caja.
                  </p>
                )}
                {r.cuentas.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Cuentas abiertas">
                    {r.cuentas.map((c) => {
                      const contenido = (
                        <>
                          <Receipt className="size-(--icono-etiqueta) shrink-0" aria-hidden="true" />
                          {nombreDeCuenta(c)} · {c.status === "POR_COBRAR" ? "por cobrar" : "abierta"}
                        </>
                      );
                      return (
                        <li key={c.id}>
                          {alAbrirCuenta && puedeAbrir(c) ? (
                            <button
                              type="button"
                              onClick={() => alAbrirCuenta(c)}
                              className="flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-brand/50 bg-brand/10 px-2.5 text-detalle font-medium text-ink hover:bg-brand/15"
                            >
                              {contenido}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 py-1 text-detalle text-ink-2">{contenido}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {r.ninos.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5" aria-label="Niños en la sala">
                    {r.ninos.map((s) => (
                      <li key={s.id} className="flex items-center gap-1.5 text-detalle text-ink-2">
                        <Baby className="size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
                        <span data-privado="">{s.kid.name ?? "Sin nombre"}</span>
                        <span className="tnum text-ink-3">
                          · {s.wristbandCode} · {s.packageName} · desde las {hora(Date.parse(s.startedAt))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.cuentas.length === 0 && r.ninos.length === 0 && <p className="mt-1 text-nota text-ink-3">Nada abierto ahora.</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
