"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { VentaCerradaSchema, type AnulacionDto, type ImpresionDto, type VentaCerradaDto } from "@l2/contracts";

/**
 * Las ventas cerradas del turno — UX-MEJORAS §9 (C12).
 *
 * La caja registra aquí cada cobro con la foto de su recibo, y «Ventas» las
 * lista para reimprimir. Como `CuentasProvider`, hace de servidor de juguete en
 * la sesión del navegador y valida todo lo que carga contra el contrato: un
 * dato guardado que no lo cumple se descarta entero.
 *
 * APPEND-ONLY (regla 5): no hay «editar» ni «borrar». Una venta entra una vez;
 * una impresión se AÑADE a su lista. La anulación (DEC-24) será otra entrada,
 * no un cambio de esta.
 *
 * TODO(F4-03/backend): el servidor guarda la venta y registra la impresión en
 * auditoría antes de devolver el recibo (§5.4).
 */

// v2: la venta guarda sus pagos y líneas (DEC-24). Lo de v1 no se puede anular.
const CLAVE = "l2:ventas:v2";

type Valor = Readonly<{
  /** De la más reciente a la más antigua. */
  ventas: readonly VentaCerradaDto[];
  registrar: (venta: VentaCerradaDto) => void;
  /** Añade una impresión. Si la venta ya tenía alguna, esta fue una COPIA. */
  anotarImpresion: (id: string, impresion: ImpresionDto) => void;
  /**
   * Añade la anulación a una venta (DEC-24). Valida la venta ENTERA con su
   * anulación contra el contrato y lanza si no cumple o si ya estaba anulada:
   * quien llama no aplica nada más si esto falla (fail-closed).
   */
  anular: (id: string, anulacion: AnulacionDto) => VentaCerradaDto;
}>;

const Contexto = createContext<Valor | null>(null);

export function VentasProvider({
  inicial,
  children,
}: {
  /** Ventas con las que arranca: las de la demo, o ninguna. TODO(F4-03): del servidor. */
  inicial: readonly VentaCerradaDto[];
  children: React.ReactNode;
}) {
  const [ventas, setVentas] = useState<readonly VentaCerradaDto[]>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = VentaCerradaSchema.array().safeParse(JSON.parse(crudo));
        if (r.success) setVentas(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con las iniciales.
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(ventas));
    } catch {
      // Sin almacenamiento, la sesión sigue en memoria.
    }
  }, [ventas, cargado]);

  const registrar = useCallback((venta: VentaCerradaDto) => {
    const valida = VentaCerradaSchema.parse(venta);
    // Una venta entra una sola vez: un doble registro no la duplica.
    setVentas((prev) => (prev.some((v) => v.id === valida.id) ? prev : [valida, ...prev]));
  }, []);

  const anotarImpresion = useCallback((id: string, impresion: ImpresionDto) => {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, prints: [...v.prints, impresion] } : v)));
  }, []);

  const anular = useCallback(
    (id: string, anulacion: AnulacionDto) => {
      const venta = ventas.find((v) => v.id === id);
      if (!venta) throw new Error("La venta no existe");
      if (venta.voided) throw new Error(`La orden ${venta.recibo.orden} ya estaba anulada`);
      const anulada = VentaCerradaSchema.parse({ ...venta, voided: anulacion });
      setVentas((prev) => prev.map((v) => (v.id === id && !v.voided ? anulada : v)));
      return anulada;
    },
    [ventas],
  );

  // De la más reciente a la más antigua, sea cual sea el orden en que llegaron.
  const ordenadas = useMemo(() => [...ventas].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt)), [ventas]);
  const valor = useMemo(
    () => ({ ventas: ordenadas, registrar, anotarImpresion, anular }),
    [ordenadas, registrar, anotarImpresion, anular],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useVentas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useVentas se usó fuera de VentasProvider");
  return v;
}
