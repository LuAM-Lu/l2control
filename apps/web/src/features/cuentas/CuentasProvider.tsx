"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FamilyAccountSchema, type FamilyAccountDto } from "@l2/contracts";
import { puedeDescartarse } from "./cuentas.ts";

/**
 * Las cuentas de las familias, compartidas por las estaciones — DEC-21.
 *
 * Entrada abre la cuenta, salida la actualiza y caja la cierra: las tres
 * necesitan ver la misma. Mientras no hay backend, este proveedor hace de
 * servidor de juguete y guarda las cuentas en la sesión del navegador, para
 * que sobrevivan a una recarga y el flujo se pueda enseñar de punta a punta.
 *
 * TODO(F5-14/backend): se sustituye por las llamadas reales. Las pantallas no
 * cambian: siguen pidiendo `cuentas` y llamando a `guardar` (§11.4).
 *
 * Todo lo que entra se valida contra el contrato. Un dato guardado que ya no
 * lo cumple —de una versión anterior, manipulado— se DESCARTA entero: usar
 * una cuenta a medias es peor que empezar de nuevo.
 */

const CLAVE = "l2:cuentas:v1";

/**
 * Las cuentas viajan entre pestañas — F9-08.
 *
 * Cada estación abre su propia pestaña, y el panel en vivo mira desde otra:
 * sin esto, la cajera cobraba y el panel seguía enseñando la cuenta en la
 * cola. Lo que viaja es la lista entera, que con unas decenas de cuentas es
 * barato y no admite estados a medias.
 *
 * TODO(F5-14/backend): lo sustituye el tiempo real del servidor (ADR-008).
 * Lo que llega por el canal es entrada NO confiable: se valida igual.
 */
const CANAL = "l2-cuentas";

type Valor = Readonly<{
  cuentas: readonly FamilyAccountDto[];
  /** Crea o sustituye una cuenta. Rechaza la que no cumpla el contrato. */
  guardar: (cuenta: FamilyAccountDto) => void;
  /** Descarta una venta directa sin cobrar. Cualquier otra cuenta se queda: fail-closed. */
  descartar: (id: string) => void;
  /** Si ya se cargó lo guardado: antes, las cuentas son las iniciales. */
  cargado: boolean;
}>;

const Contexto = createContext<Valor | null>(null);

export function CuentasProvider({
  inicial,
  children,
}: {
  /** Cuentas con las que arranca: las de la demo, o ninguna. TODO(F5-14): del servidor. */
  inicial: readonly FamilyAccountDto[];
  children: React.ReactNode;
}) {
  // Arranca con `inicial`, que llega igual al servidor y al navegador: los dos
  // pintan lo mismo al hidratar. Lo guardado se carga después, en el efecto.
  const [cuentas, setCuentas] = useState<readonly FamilyAccountDto[]>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = FamilyAccountSchema.array().safeParse(JSON.parse(crudo));
        if (r.success) {
          // Cuentas guardadas antes de existir el número de orden: reciben el
          // siguiente correlativo, en el orden en que se abrieron.
          let ultimo = r.data.reduce((max, c) => Math.max(max, c.orderNumber ?? 0), 0);
          setCuentas(r.data.map((c) => (c.orderNumber ? c : { ...c, orderNumber: ++ultimo })));
        } else {
          window.sessionStorage.removeItem(CLAVE);
        }
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con las iniciales.
    }
    // Lo que ya esperaba en la cola sin hora de llegada (datos de ejemplo o
    // guardados antes de existir el campo) cuenta desde que se abre la caja.
    const ahora = new Date().toISOString();
    setCuentas((prev) =>
      prev.map((c) => (c.status === "POR_COBRAR" && !c.pendingSince ? { ...c, pendingSince: ahora } : c)),
    );
    setCargado(true);
  }, []);

  /* ── el canal entre pestañas ── */
  const canal = useRef<BroadcastChannel | null>(null);
  const propio = useRef(false);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(CANAL);
    canal.current = c;
    c.onmessage = (m: MessageEvent<unknown>) => {
      const r = FamilyAccountSchema.array().safeParse(m.data);
      if (!r.success) return;
      propio.current = true;
      setCuentas(r.data);
    };
    return () => {
      c.close();
      canal.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cargado) return;
    // Lo que llegó del canal no se reenvía: sería un eco sin fin.
    if (propio.current) propio.current = false;
    else canal.current?.postMessage(cuentas);
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(cuentas));
    } catch {
      // Sin almacenamiento la sesión sigue funcionando en memoria.
    }
  }, [cuentas, cargado]);

  const guardar = useCallback((cuenta: FamilyAccountDto) => {
    const valida = FamilyAccountSchema.parse(cuenta);
    setCuentas((prev) => {
      const previa = prev.find((c) => c.id === valida.id);
      // Entrar a la cola tiene hora: la de este registro, si la cuenta acaba de
      // pasar a POR_COBRAR. Si ya esperaba, conserva su hora; si salió, no tiene.
      const pendingSince =
        valida.status !== "POR_COBRAR"
          ? undefined
          : previa?.status === "POR_COBRAR"
            ? (previa.pendingSince ?? valida.pendingSince)
            : (valida.pendingSince ?? new Date().toISOString());
      if (previa) {
        // El número de orden no cambia nunca: se conserva el que ya tenía.
        return prev.map((c) =>
          c.id === valida.id ? { ...valida, orderNumber: previa.orderNumber ?? valida.orderNumber, pendingSince } : c,
        );
      }
      // Cuenta nueva: recibe el siguiente correlativo de la sucursal. Se
      // calcula aquí, dentro de la actualización, para que dos altas seguidas
      // no reciban el mismo número.
      const siguiente = prev.reduce((max, c) => Math.max(max, c.orderNumber ?? 0), 0) + 1;
      return [...prev, { ...valida, orderNumber: valida.orderNumber ?? siguiente, pendingSince }];
    });
  }, []);

  const descartar = useCallback((id: string) => {
    setCuentas((prev) => prev.filter((c) => c.id !== id || !puedeDescartarse(c)));
  }, []);

  const valor = useMemo(() => ({ cuentas, guardar, descartar, cargado }), [cuentas, guardar, descartar, cargado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCuentas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useCuentas se usó fuera de CuentasProvider");
  return v;
}
