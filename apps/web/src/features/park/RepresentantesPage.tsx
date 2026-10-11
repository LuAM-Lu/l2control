"use client";

import { useCallback, useRef, useState } from "react";
import type { DescuentosDelLocalDto, PaginaDelDirectorioDto, RepresentanteCommand } from "@l2/contracts";
import { DE_A, EmptyState } from "@l2/ui";
import { TriangleAlert } from "lucide-react";
import { useActorEnSesion } from "../identity/sesion.ts";
import { buscarEnElDirectorio, corregirDirectorio } from "./parque.acciones";
import { marcarFamiliaVip } from "../cash/descuentos.acciones";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { textoAlcance, textoValor } from "../cash/descuentos.ts";
import { RepresentantesScreen, type ConsultaDelDirectorio } from "./RepresentantesScreen.tsx";

/**
 * Directorio de familias (F5-01), del servidor desde B4-1.
 *
 * La página lo lee en el servidor y aquí se corrige con la acción: el servidor revalida, audita y
 * devuelve el directorio como quedó. `null` si quien entra no puede ver contactos o el servidor no
 * lo dio: se dice, no se enseña una lista vacía que parezca un local sin familias.
 *
 * T-22 (M-38): el directorio no tiene tope. El servidor busca (lo escrito, la letra del índice) y trae de a 50; «Cargar
 * más» trae las siguientes. Una respuesta que llega tarde (se escribió otra cosa mientras tanto) no pisa la de ahora.
 */

export function RepresentantesPage({ inicial, descuentos }: { inicial: PaginaDelDirectorioDto | null; descuentos: DescuentosDelLocalDto | null }) {
  const actor = useActorEnSesion();
  const [pagina, setPagina] = useState(inicial);
  const [consulta, setConsulta] = useState<ConsultaDelDirectorio>({ texto: "", letra: null });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La consulta que vale: la última que se pidió. */
  const vigente = useRef(0);
  const conElevacion = useConElevacion();
  // Las reglas VIP vigentes: con ellas se marca a una familia (B3-6).
  const reglasVip = (descuentos?.reglas ?? [])
    .filter((r) => r.tipo === "VIP" && r.retirada === null)
    .map((r) => ({ id: r.id, nombre: r.nombre, detalle: `${textoValor(r.valor)} sobre ${textoAlcance(r.alcance)}` }));

  /** Pide una página: la primera de una consulta nueva, o la siguiente (`juntar`) de la misma. */
  const pedir = useCallback(async (c: ConsultaDelDirectorio, desde: number, juntar: boolean) => {
    const n = ++vigente.current;
    setCargando(true);
    const r = await buscarEnElDirectorio({ texto: c.texto, letra: c.letra, desde, cuantos: DE_A }).catch(() => null);
    if (n !== vigente.current) return;
    setCargando(false);
    if (!r) return setError("Sin conexión con el servidor: el directorio no se pudo buscar.");
    if (!r.ok) return setError(r.mensaje);
    setError(null);
    setPagina((p) => (juntar && p ? { ...r.valor, representantes: [...p.representantes, ...r.valor.representantes.filter((x) => !p.representantes.some((y) => y.id === x.id))] } : r.valor));
  }, []);

  // Lo que se consulta ahora, para los manejadores que no deben cambiar con cada tecla.
  const actual = useRef(consulta);
  actual.current = consulta;
  const buscar = useCallback(
    (texto: string) => {
      if (actual.current.texto === texto) return;
      const nueva = { ...actual.current, texto };
      setConsulta(nueva);
      void pedir(nueva, 0, false);
    },
    [pedir],
  );
  const elegirLetra = useCallback(
    (letra: string | null) => {
      const nueva = { ...consulta, letra };
      setConsulta(nueva);
      void pedir(nueva, 0, false);
    },
    [consulta, pedir],
  );
  const cargarMas = useCallback(() => {
    if (pagina) void pedir(consulta, pagina.representantes.length, true);
  }, [consulta, pagina, pedir]);

  /** Marca a la familia VIP con esa regla, o le quita la marca (`null`). Pide confirmar identidad. */
  const marcarVip = useCallback(
    async (guardianId: string, reglaId: string | null): Promise<string | null> => {
      const r = await conElevacion(() => marcarFamiliaVip({ guardianId, reglaId })).catch(() => null);
      if (!r) return "Sin conexión con el servidor: la marca no se guardó.";
      if (!r.ok) return r.mensaje;
      setPagina((d) => d && { ...d, representantes: d.representantes.map((x) => (x.id === guardianId ? { ...x, vip: r.valor.vip } : x)) });
      return null;
    },
    [conElevacion],
  );

  const corregir = useCallback(async (cmd: RepresentanteCommand): Promise<string | null> => {
    const r = await corregirDirectorio(cmd).catch(() => null);
    if (!r) return "Sin conexión con el servidor: el cambio no se guardó.";
    if (!r.ok) return r.mensaje;
    // El servidor devuelve el directorio como quedó: aquí se cambia lo que está a la vista.
    const nuevos = new Map(r.valor.representantes.map((x) => [x.id, x]));
    setPagina((d) => d && { ...d, representantes: d.representantes.map((x) => nuevos.get(x.id) ?? x) });
    return null;
  }, []);

  if (!actor) return null;
  if (!pagina) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="El directorio no está disponible"
        hint="Tu puesto no puede ver los contactos de las familias, o el servidor no respondió. Vuelve a cargar la página."
      />
    );
  }
  return (
    <RepresentantesScreen
      pagina={pagina}
      consulta={consulta}
      cargando={cargando}
      error={error}
      onBuscar={buscar}
      onLetra={elegirLetra}
      onCargarMas={cargarMas}
      corregir={corregir}
      reglasVip={reglasVip}
      marcarVip={marcarVip}
    />
  );
}
