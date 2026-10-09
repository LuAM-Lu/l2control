"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AreaDeComandaDto, EnviarPedidoCommand, PedidoDto, PedidoEnviadoDto, Rechazo, Resultado } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { deshacerServido, enviarPedido, leerPedidos, reimprimirComanda, servirPedido } from "./pedidos.acciones";

/**
 * Los pedidos de hoy y su comanda, en vivo — B6-2, ADR-022.
 *
 * Vive por encima de las cáscaras: lo usan el salón (los pedidos de cada mesa, si su comanda salió y
 * «Reimprimir») e Inicio (las comandas que no salieron). Se vuelve a leer cuando el canal dice que
 * cambiaron los pedidos o la cola de impresión (un agente confirmó o falló). Nada se guarda en el
 * navegador.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: el pedido no se envió." };

type Valor = Readonly<{
  pedidos: readonly PedidoDto[];
  /** Envía un pedido y adopta la cuenta de la mesa como quedó. Nunca lanza por un rechazo: lo devuelve. */
  enviar: (cmd: EnviarPedidoCommand) => Promise<Resultado<PedidoEnviadoDto>>;
  /** La comanda de un área (B6-10); sin ella, la única que tenga. */
  reimprimir: (pedidoId: string, area?: AreaDeComandaDto | null) => Promise<Resultado<PedidoDto>>;
  /** Marca servidos platos de un pedido (B6-11) o, sin decirlos, todo lo que falte (B6-8): termina su espera. */
  servir: (pedidoId: string, lineas?: readonly number[], sinHora?: boolean) => Promise<Resultado<PedidoDto>>;
  /** Deshace, en el momento, un plato marcado servido (B6-11). */
  deshacer: (pedidoId: string, linea: number) => Promise<Resultado<PedidoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

const conPedido = (lista: readonly PedidoDto[], p: PedidoDto) =>
  lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [p, ...lista];

export function PedidosProvider({ inicial, children }: { inicial: readonly PedidoDto[]; children: React.ReactNode }) {
  const [pedidos, setPedidos] = useState<readonly PedidoDto[]>(inicial);
  const { adoptar } = useCuentas();
  const huella = JSON.stringify(inicial.map((p) => [p.id, p.comanda.estado, p.comanda.reimpresiones, p.comandas.map((c) => c.estado).join(), p.lineas.map((l) => l.servido?.en ?? "").join(), p.servido?.en ?? null]));
  useEffect(() => {
    setPedidos(inicial);
  }, [huella]);

  const releer = useCallback(async () => {
    const r = await leerPedidos().catch(() => null);
    if (r?.ok) setPedidos(r.valor.pedidos);
  }, []);
  useAlCambiar(["pedidos", "impresion"], () => void releer());

  const enviar = useCallback(
    async (cmd: EnviarPedidoCommand) => {
      const r = await enviarPedido(cmd).catch(() => sinConexion);
      if (r.ok) {
        setPedidos((l) => conPedido(l, r.valor.pedido));
        adoptar(r.valor.cuenta);
      }
      return r;
    },
    [adoptar],
  );

  const reimprimir = useCallback(async (pedidoId: string, area?: AreaDeComandaDto | null) => {
    const r = await reimprimirComanda({ pedidoId, ...(area ? { area } : {}) }).catch((): Rechazo => ({ ...sinConexion, mensaje: "Sin conexión con el servidor: la comanda no se reimprimió." }));
    if (r.ok) setPedidos((l) => conPedido(l, r.valor));
    return r;
  }, []);

  const servir = useCallback(async (pedidoId: string, lineas?: readonly number[], sinHora?: boolean) => {
    const r = await servirPedido({ pedidoId, ...(lineas ? { lineas: [...lineas] } : {}), ...(sinHora ? { sinHora: true } : {}) }).catch(
      (): Rechazo => ({ ...sinConexion, mensaje: "Sin conexión con el servidor: no se marcó servido." }),
    );
    if (r.ok) setPedidos((l) => conPedido(l, r.valor));
    return r;
  }, []);

  const deshacer = useCallback(async (pedidoId: string, linea: number) => {
    const r = await deshacerServido({ pedidoId, linea }).catch((): Rechazo => ({ ...sinConexion, mensaje: "Sin conexión con el servidor: no se deshizo." }));
    if (r.ok) setPedidos((l) => conPedido(l, r.valor));
    return r;
  }, []);

  const valor = useMemo(() => ({ pedidos, enviar, reimprimir, servir, deshacer }), [pedidos, enviar, reimprimir, servir, deshacer]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePedidos(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("usePedidos se usó fuera de PedidosProvider");
  return v;
}
