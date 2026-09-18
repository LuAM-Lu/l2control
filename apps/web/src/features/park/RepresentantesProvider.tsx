"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DirectorioRepresentantesSchema,
  RepresentanteCommandSchema,
  type DirectorioRepresentantesDto,
  type RepresentanteCommand,
} from "@l2/contracts";

/**
 * Proveedor del directorio de representantes y niños (F5-01).
 *
 * TODO(F5-01/backend): el directorio vendrá del servidor y las visitas se
 * calcularán con las estancias.
 */

const CLAVE = "l2:representantes:v1";

type Valor = Readonly<{
  directorio: DirectorioRepresentantesDto;
  /**
   * Aplica un cambio al directorio. Devuelve un mensaje de error si el
   * contrato rechaza el estado final (ej. colisión de contactos), o null si
   * todo fue bien.
   */
  corregir: (cmd: RepresentanteCommand) => string | null;
}>;

const Contexto = createContext<Valor | null>(null);

export function RepresentantesProvider({
  inicial,
  children,
}: {
  inicial: DirectorioRepresentantesDto;
  children: React.ReactNode;
}) {
  const [directorio, setDirectorio] =
    useState<DirectorioRepresentantesDto>(inicial);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = DirectorioRepresentantesSchema.safeParse(JSON.parse(crudo));
        if (r.success) setDirectorio(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: seguimos con el inicial
    }
  }, []);

  const corregir = useCallback(
    (cmd: RepresentanteCommand): string | null => {
      const mando = RepresentanteCommandSchema.safeParse(cmd);
      if (!mando.success) {
        return mando.error.issues[0]?.message ?? "El cambio no es válido.";
      }
      const v = mando.data;

      const nuevos = [...directorio.representantes];

      if (v.kind === "CORREGIR_REPRESENTANTE") {
        const i = nuevos.findIndex((r) => r.id === v.representanteId);
        if (i === -1) return "Representante no encontrado.";
        nuevos[i] = {
          ...nuevos[i]!,
          fullName: v.fullName,
          contactReference: v.contactReference,
        };
      } else if (v.kind === "CORREGIR_NINO") {
        const i = nuevos.findIndex((r) => r.id === v.representanteId);
        if (i === -1) return "Representante no encontrado.";

        const rep = nuevos[i]!;
        const k = rep.kids.findIndex((kid) => kid.id === v.kidId);
        if (k === -1) return "Niño no encontrado.";

        const nuevosKids = [...rep.kids];
        const { nickname: _fuera, ...sinApodo } = nuevosKids[k]!;
        nuevosKids[k] = {
          ...sinApodo,
          name: v.name,
          ...(v.nickname ? { nickname: v.nickname } : {}),
        };
        nuevos[i] = {
          ...rep,
          kids: nuevosKids,
        };
      }

      // Validar FUERA del actualizador de estado: si falla, devolvemos el
      // mensaje y react no se entera. Un throw dentro del setDirectorio rompería el pintado.
      const directorioPropuesto: DirectorioRepresentantesDto = {
        representantes: nuevos,
      };
      const r = DirectorioRepresentantesSchema.safeParse(directorioPropuesto);
      if (!r.success) {
        return (
          r.error.issues[0]?.message ?? "El directorio resultante es inválido."
        );
      }

      setDirectorio(r.data);
      try {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(r.data));
      } catch {
        // En memoria hasta recargar
      }

      return null; // OK
    },
    [directorio],
  );

  const valor = useMemo(
    () => ({ directorio, corregir }),
    [directorio, corregir],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useRepresentantes(): Valor {
  const v = useContext(Contexto);
  if (!v)
    throw new Error("useRepresentantes se usó fuera de RepresentantesProvider");
  return v;
}
