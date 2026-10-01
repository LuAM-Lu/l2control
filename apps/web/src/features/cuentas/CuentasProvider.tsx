"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  FamilyAccountSchema,
  type AnularCobroCommand,
  type CobrarCuentaCommand,
  type AplicarDescuentoCommand,
  type CortesiaCommand,
  type CuentaYLibroDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { isDiscardedDraft } from "@l2/domain-cash";
import { avisar } from "@l2/ui";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { puedeDescartarse } from "./cuentas.ts";
import { anularCobro, aplicarDescuento, cobrarCuenta, darCortesia, guardarCuenta, leerCuentas } from "./cuentas.acciones";

/**
 * Las cuentas de la sucursal, compartidas por las estaciones — DEC-21, en el servidor desde B3-3.
 *
 * Entrada abre la cuenta, salida la actualiza, el salón la llena y la caja la cobra: todas leen la
 * misma, la de la base. El layout la lee en el servidor; aquí se vuelve a leer cuando el canal en
 * vivo dice que cambiaron (B5-1), en menos de 2 s, sin sondeo. Nada se guarda en el navegador.
 *
 * GUARDAR ES OPTIMISTA Y EN ORDEN. La pantalla ve su cambio al momento y el servidor lo confirma
 * (con su número de orden y su versión) o lo rechaza, y entonces se avisa y se vuelve a lo que
 * tiene la base. Los cambios de una misma cuenta salen de uno en uno: el segundo se hizo sobre el
 * primero, así que lleva la versión que el servidor dio al primero. Si la versión la dio OTRO
 * equipo, no: esa pantalla no la vio, y el servidor responde CONFLICTO en vez de pisarla.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: el cambio no se guardó." };

type Valor = Readonly<{
  /** Las cuentas vigentes: las no cobradas y las cobradas hoy. */
  cuentas: readonly FamilyAccountDto[];
  /**
   * Crea o cambia una cuenta: se ve al momento y el servidor la confirma. Lanza si la cuenta no
   * cumple el contrato (un error de la pantalla, no del servidor); un rechazo lo avisa y lo devuelve.
   */
  guardar: (cuenta: FamilyAccountDto) => Promise<Resultado<FamilyAccountDto>>;
  /** Descarta una venta de mostrador sin cobrar. Cualquier otra cuenta se queda: fail-closed. */
  descartar: (id: string) => void;
  /** Cobra en el servidor y adopta la cuenta como quedó. */
  cobrar: (cmd: CobrarCuentaCommand) => Promise<Resultado<CuentaYLibroDto>>;
  /** Anula un cobro en el servidor (🔐 comprobado allí) y adopta la cuenta como quedó. */
  anular: (cmd: AnularCobroCommand, autorizacion?: unknown) => Promise<Resultado<CuentaYLibroDto>>;
  /** Regala una línea (o deja de regalarla) en el servidor, con su autorización, y adopta la cuenta. */
  cortesia: (cmd: CortesiaCommand, autorizacion?: unknown) => Promise<Resultado<FamilyAccountDto>>;
  /** Pone un descuento a una cuenta o se lo quita (B3-6), en el servidor y con su autorización. */
  descuento: (cmd: AplicarDescuentoCommand, autorizacion?: unknown) => Promise<Resultado<FamilyAccountDto>>;
  /** Adopta una cuenta que el servidor acaba de devolver por otra vía (la entrada o la salida del parque). */
  adoptar: (cuenta: FamilyAccountDto) => void;
  /** Siempre `true`: las cuentas llegan del servidor con la página. Se mantiene para quien lo mira. */
  cargado: boolean;
}>;

const Contexto = createContext<Valor | null>(null);

/** Sustituye o añade una cuenta, sin cambiar el orden de las demás. */
const conCuenta = (lista: readonly FamilyAccountDto[], c: FamilyAccountDto) =>
  lista.some((x) => x.id === c.id) ? lista.map((x) => (x.id === c.id ? c : x)) : [...lista, c];

export function CuentasProvider({ inicial, children }: { inicial: readonly FamilyAccountDto[]; children: React.ReactNode }) {
  const [cuentas, setCuentas] = useState<readonly FamilyAccountDto[]>(inicial);

  /** Cuántos cambios de cada cuenta van camino del servidor: mientras tanto, manda lo de la pantalla. */
  const enVuelo = useRef(new Map<string, number>());
  /** La cola de cada cuenta: sus cambios salen de uno en uno. */
  const colas = useRef(new Map<string, Promise<unknown>>());
  /** Qué versión dio el servidor a un cambio de ESTE equipo hecho sobre otra: id → (base → nueva). */
  const sucesoras = useRef(new Map<string, Map<number, number>>());

  /** Lo del servidor, salvo las cuentas con cambios de esta pantalla todavía en camino. */
  const adoptarLista = useCallback((delServidor: readonly FamilyAccountDto[]) => {
    setCuentas((prev) => {
      const locales = prev.filter((c) => (enVuelo.current.get(c.id) ?? 0) > 0);
      const ids = new Set(locales.map((c) => c.id));
      const nueva = [...delServidor.filter((c) => !ids.has(c.id)), ...locales];
      return JSON.stringify(nueva) === JSON.stringify(prev) ? prev : nueva;
    });
  }, []);

  // Cuando el layout se vuelve a pintar con otras cuentas (se navegó), se adoptan.
  const huella = JSON.stringify(inicial);
  useEffect(() => {
    adoptarLista(inicial);
  }, [huella]);

  const refrescar = useCallback(async () => {
    const r = await leerCuentas().catch(() => null);
    if (r?.ok) adoptarLista(r.valor.cuentas);
  }, [adoptarLista]);

  // En vivo (B5-1). Un fallo de red no borra lo que se tenía: se vuelve a leer con el siguiente cambio.
  useAlCambiar(["cuentas"], () => void refrescar());

  /** La versión con que sale un cambio hecho sobre `base`: la última que este equipo encadenó. */
  const versionPara = (id: string, base: number | undefined): number | undefined => {
    const cadena = sucesoras.current.get(id);
    let v = base ?? 0;
    while (cadena?.has(v)) v = cadena.get(v)!;
    return v === 0 ? undefined : v;
  };
  const encadenar = (id: string, base: number | undefined, nueva: number | undefined) => {
    if (nueva === undefined) return;
    const cadena = sucesoras.current.get(id) ?? new Map<number, number>();
    cadena.set(base ?? 0, nueva);
    sucesoras.current.set(id, cadena);
  };

  /** Pone `trabajo` en la cola de la cuenta `id` y lleva la cuenta de lo que va en camino. */
  const enCola = useCallback(<T,>(id: string, trabajo: () => Promise<T>): Promise<T> => {
    enVuelo.current.set(id, (enVuelo.current.get(id) ?? 0) + 1);
    const hecho = (colas.current.get(id) ?? Promise.resolve()).then(trabajo).finally(() => {
      const quedan = (enVuelo.current.get(id) ?? 1) - 1;
      if (quedan > 0) enVuelo.current.set(id, quedan);
      else enVuelo.current.delete(id);
    });
    colas.current.set(id, hecho.catch(() => undefined));
    return hecho;
  }, []);

  const guardar = useCallback(
    (cuenta: FamilyAccountDto) => {
      const valida = FamilyAccountSchema.parse(cuenta);
      setCuentas((prev) => conCuenta(prev, valida));
      return enCola(valida.id, async (): Promise<Resultado<FamilyAccountDto>> => {
        const version = versionPara(valida.id, valida.version);
        const { version: _, ...sinVersion } = valida;
        const r = await guardarCuenta({ cuenta: version === undefined ? sinVersion : { ...valida, version } }).catch(() => sinConexion);
        if (r.ok) {
          encadenar(valida.id, valida.version, r.valor.version);
          encadenar(valida.id, version, r.valor.version);
          // Si detrás viene otro cambio de esta cuenta, la pantalla ya enseña ese: no se retrocede.
          if ((enVuelo.current.get(valida.id) ?? 0) <= 1) setCuentas((prev) => conCuenta(prev, r.valor));
        } else {
          avisar.error(r.mensaje, { detalle: "Se vuelve a lo que tiene el servidor." });
          // Lo que no se guardó no se queda en pantalla: se vuelve a lo de la base.
          if ((enVuelo.current.get(valida.id) ?? 0) <= 1) {
            enVuelo.current.delete(valida.id);
            setCuentas((prev) => prev.filter((c) => c.id !== valida.id));
            void refrescar();
          }
        }
        return r;
      });
    },
    [enCola, refrescar],
  );

  const descartar = useCallback(
    (id: string) => {
      const c = cuentas.find((x) => x.id === id);
      if (!c || !puedeDescartarse(c)) return;
      // Nada se borra (regla 5): la venta se vacía y el servidor deja de enseñarla.
      const { split: _, ...sinDividir } = c;
      void guardar({ ...sinDividir, lines: [], status: "ABIERTA" });
    },
    [cuentas, guardar],
  );

  const cobrar = useCallback(
    (cmd: CobrarCuentaCommand) =>
      // Detrás de los cambios de esa cuenta que van en camino: se cobra la versión que quedó.
      enCola(cmd.accountId, async (): Promise<Resultado<CuentaYLibroDto>> => {
        const r = await cobrarCuenta({ ...cmd, version: versionPara(cmd.accountId, cmd.version) ?? cmd.version }).catch(() => sinConexion);
        if (r.ok) setCuentas((prev) => conCuenta(prev, r.valor.cuenta));
        else if (r.motivo === "CONFLICTO") void refrescar();
        return r;
      }),
    [enCola, refrescar],
  );

  const anular = useCallback(
    (cmd: AnularCobroCommand, autorizacion?: unknown) =>
      enCola(cmd.accountId, async (): Promise<Resultado<CuentaYLibroDto>> => {
        const r = await anularCobro(cmd, autorizacion).catch(() => sinConexion);
        if (r.ok) setCuentas((prev) => conCuenta(prev, r.valor.cuenta));
        return r;
      }),
    [enCola],
  );

  const cortesia = useCallback(
    (cmd: CortesiaCommand, autorizacion?: unknown) =>
      enCola(cmd.accountId, async (): Promise<Resultado<FamilyAccountDto>> => {
        const r = await darCortesia({ ...cmd, version: versionPara(cmd.accountId, cmd.version) ?? cmd.version }, autorizacion).catch(() => sinConexion);
        if (r.ok) setCuentas((prev) => conCuenta(prev, r.valor));
        else if (r.motivo === "CONFLICTO") void refrescar();
        return r;
      }),
    [enCola, refrescar],
  );

  const descuento = useCallback(
    (cmd: AplicarDescuentoCommand, autorizacion?: unknown) =>
      enCola(cmd.accountId, async (): Promise<Resultado<FamilyAccountDto>> => {
        const r = await aplicarDescuento({ ...cmd, version: versionPara(cmd.accountId, cmd.version) ?? cmd.version }, autorizacion).catch(() => sinConexion);
        if (r.ok) setCuentas((prev) => conCuenta(prev, r.valor));
        else if (r.motivo === "CONFLICTO") void refrescar();
        return r;
      }),
    [enCola, refrescar],
  );

  const adoptar = useCallback((cuenta: FamilyAccountDto) => {
    setCuentas((prev) => conCuenta(prev, FamilyAccountSchema.parse(cuenta)));
  }, []);

  // Una venta de mostrador vaciada no es una cuenta: no sale en ninguna estación.
  const vigentes = useMemo(() => cuentas.filter((c) => !isDiscardedDraft(c)), [cuentas]);
  const valor = useMemo(
    () => ({ cuentas: vigentes, guardar, descartar, cobrar, anular, cortesia, descuento, adoptar, cargado: true }),
    [vigentes, guardar, descartar, cobrar, anular, cortesia, descuento, adoptar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCuentas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useCuentas se usó fuera de CuentasProvider");
  return v;
}
