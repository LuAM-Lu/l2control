"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TarifarioSchema, type Resultado, type TarifarioDto, type TarifarioPublicadoDto } from "@l2/contracts";
import { publicarTarifario } from "./tarifario.acciones";

/**
 * El tarifario publicado — F5-04, F5-06.
 *
 * Vive por encima de las dos cáscaras: lo escribe el back-office (el editor, solo
 * administración) y lo lee la estación (la entrada). **Solo se guarda lo PUBLICADO**: el
 * borrador del editor no sale de su pantalla.
 *
 * Dos fuentes, que decide el servidor (`L2_FUENTE_DE_DATOS`):
 *   servidor  publicar va a la base como versión nueva (B0-5). Otra estación lo ve al
 *             navegar; en vivo, sin navegar, llega con el tiempo real (B5-1).
 *   demo      se guarda en esta pestaña (`sessionStorage`), como antes.
 */

const CLAVE = "l2:tarifario:v1";

type Valor = Readonly<{
  tarifario: TarifarioDto;
  /** Versión vigente en el servidor; `null` con datos de ejemplo. */
  version: number | null;
  /** Sustituye el tarifario en servicio. Nunca lanza por un rechazo: lo devuelve. */
  publicar: (tarifario: TarifarioDto) => Promise<Resultado<TarifarioPublicadoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

type Props = {
  children: React.ReactNode;
} & (
  | { fuente: "servidor"; inicial: TarifarioPublicadoDto }
  | { fuente: "demo"; inicial: TarifarioDto }
);

export function TarifarioProvider(props: Props) {
  const { fuente, children } = props;
  const desdeServidor = props.fuente === "servidor" ? props.inicial : null;
  const inicial = props.fuente === "servidor" ? props.inicial.tarifario : props.inicial;

  const [tarifario, setTarifario] = useState<TarifarioDto>(inicial);
  const [version, setVersion] = useState<number | null>(desdeServidor?.version ?? null);

  // Servidor: cuando el layout se vuelve a pintar con otra versión (esta u otra estación
  // publicó y se navegó), se adopta. `useState` solo mira su valor inicial una vez.
  const versionDelServidor = desdeServidor?.version;
  useEffect(() => {
    if (desdeServidor && versionDelServidor !== undefined) {
      setTarifario(desdeServidor.tarifario);
      setVersion(versionDelServidor);
    }
    // Depende solo de la versión: identifica el contenido, y el objeto cambia en cada pintado.
  }, [versionDelServidor]);

  // Demo: lo publicado en esta pestaña sobrevive a recargar.
  useEffect(() => {
    if (fuente !== "demo") return;
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = TarifarioSchema.safeParse(JSON.parse(crudo));
        if (r.success) setTarifario(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con el inicial.
    }
  }, [fuente]);

  const publicar = useCallback(
    async (nuevo: TarifarioDto): Promise<Resultado<TarifarioPublicadoDto>> => {
      if (fuente === "servidor") {
        const r = await publicarTarifario(nuevo);
        if (r.ok) {
          setTarifario(r.valor.tarifario);
          setVersion(r.valor.version);
        }
        return r;
      }

      const valido = TarifarioSchema.safeParse(nuevo);
      if (!valido.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: valido.error.issues[0]?.message ?? "Datos inválidos" };
      }
      setTarifario(valido.data);
      try {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(valido.data));
      } catch {
        // Sin almacenamiento, el tarifario vive en memoria hasta recargar.
      }
      return { ok: true, valor: { version: 1, publishedAt: new Date().toISOString(), tarifario: valido.data } };
    },
    [fuente],
  );

  const valor = useMemo(() => ({ tarifario, version, publicar }), [tarifario, version, publicar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTarifario(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTarifario se usó fuera de TarifarioProvider");
  return v;
}
