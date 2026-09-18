"use client";

import { useMemo, useState } from "react";
import { Search, UserCog, UserPlus } from "lucide-react";
import {
  RepresentanteCommandSchema,
  type DirectorioRepresentantesDto,
  type RepresentanteCommand,
  type RepresentanteDto,
} from "@l2/contracts";
import {
  Container,
  PageHeader,
  Input,
  Sheet,
  Button,
  cn,
  Initial,
  avisar,
} from "@l2/ui";

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Un niño del directorio: aquí su `id` siempre está (lo exige el contrato). */
type NinoDelDirectorio = RepresentanteDto["kids"][number];

/**
 * Los errores del mando, por campo.
 *
 * El contrato decide qué está mal y con qué palabras; la hoja solo los coloca
 * donde se cometió el error. Lo que no es de un campo —dos familias con el
 * mismo contacto lo es del directorio entero— vuelve del proveedor y se enseña
 * arriba.
 */
function erroresDelMando(cmd: RepresentanteCommand): Record<string, string> {
  const r = RepresentanteCommandSchema.safeParse(cmd);
  if (r.success) return {};
  const fallos: Record<string, string> = {};
  for (const i of r.error.issues) {
    const campo = String(i.path[0] ?? "");
    if (campo && !fallos[campo]) fallos[campo] = i.message;
  }
  return fallos;
}

const FECHA = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Caracas",
});

export function RepresentantesScreen({
  directorio,
  corregir,
}: {
  directorio: DirectorioRepresentantesDto;
  corregir: (cmd: RepresentanteCommand) => string | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionId, setSeleccionId] = useState<string | null>(
    directorio.representantes.length > 0
      ? (directorio.representantes[0]?.id ?? null)
      : null,
  );
  const [editando, setEditando] = useState<
    | { tipo: "REPRESENTANTE"; id: string }
    | { tipo: "NINO"; repId: string; kidId: string }
    | null
  >(null);

  const lista = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    const qNum = busqueda.trim().replace(/\D/g, "");

    const filtrada = directorio.representantes.filter((r) => {
      if (!q) return true;
      if (sinAcentos(r.fullName).includes(q)) return true;
      if (qNum && r.contactReference.replace(/\D/g, "").includes(qNum))
        return true;
      if (
        r.kids.some(
          (k) =>
            (k.name && sinAcentos(k.name).includes(q)) ||
            (k.nickname && sinAcentos(k.nickname).includes(q)),
        )
      ) {
        return true;
      }
      return false;
    });

    return filtrada.sort((a, b) => {
      const ta = a.ultimaVisita ? Date.parse(a.ultimaVisita) : 0;
      const tb = b.ultimaVisita ? Date.parse(b.ultimaVisita) : 0;
      return tb - ta;
    });
  }, [directorio, busqueda]);

  const seleccion =
    directorio.representantes.find((r) => r.id === seleccionId) ?? null;

  function manejarEdicion(cmd: RepresentanteCommand) {
    const err = corregir(cmd);
    if (err) {
      return err;
    }
    avisar.ok("Cambio guardado");
    setEditando(null);
    return null;
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Personas", href: "/panel/personas" },
          { texto: "Representantes y niños" },
        ]}
        titulo="Representantes y niños"
        descripcion="El directorio de familias. La puerta busca aquí al registrar una entrada para no volver a pedir los datos."
        meta={
          <span className="tnum text-[12.5px] text-ink-3">
            {directorio.representantes.length} familias
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ═════════════════════════ BUSCADOR Y LISTA ═════════════════════════ */}
        <section aria-label="Familias" className="flex min-w-0 flex-col gap-3">
          <Input
            surface="admin"
            label="Buscar familia, niño o teléfono"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. Ana Rojas, 0412..."
            leading={<Search size={14} aria-hidden="true" />}
          />

          {lista.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              {directorio.representantes.length === 0
                ? "Todavía no hay familias registradas."
                : "Nadie con ese nombre."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {lista.map((r) => {
                const activa = r.id === seleccionId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSeleccionId(r.id)}
                      aria-pressed={activa}
                      className={cn(
                        "flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)]",
                        "border bg-surface px-3 py-2 text-left",
                        "transition-[border-color,background-color] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        activa
                          ? "border-brand/60 bg-surface-2"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <Initial
                        name={r.fullName}
                        tone={activa ? "brand" : "idle"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {r.fullName}
                        </span>
                        {/* El que se recorta es el teléfono, no el número de
                            niños: un «1 niñ» cortado no dice nada. */}
                        <span className="tnum flex items-center gap-1.5 text-[11.5px] text-ink-3">
                          <span className="min-w-0 truncate">{r.contactReference}</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">
                            {r.kids.length} {r.kids.length === 1 ? "niño" : "niños"}
                          </span>
                        </span>
                      </span>
                      <span className="flex flex-col items-end text-right">
                        <span className="tnum text-[11.5px] font-medium text-ink-2">
                          {r.visitas === 0
                            ? "Sin visitas todavía"
                            : `${r.visitas} ${r.visitas === 1 ? "visita" : "visitas"}`}
                        </span>
                        {r.ultimaVisita && (
                          <span className="tnum text-[10.5px] text-ink-3">
                            última el {FECHA.format(Date.parse(r.ultimaVisita))}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ═════════════════════════ DETALLE ═════════════════════════ */}
        {seleccion ? (
          <section
            aria-label={`Detalle de ${seleccion.fullName}`}
            className="flex min-w-0 flex-col gap-4"
          >
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Initial
                    name={seleccion.fullName}
                    tone="brand"
                    className="size-12 text-lg"
                  />
                  <div className="min-w-0">
                    <h2 className="font-display truncate text-lg font-bold text-ink">
                      {seleccion.fullName}
                    </h2>
                    <p className="tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                      <span>Contacto: {seleccion.contactReference}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditando({ tipo: "REPRESENTANTE", id: seleccion.id })
                  }
                  className={cn(
                    "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-[12.5px] text-ink-2",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "hover:border-line-strong hover:text-ink focus-visible:outline-brand",
                  )}
                >
                  <UserCog size={14} aria-hidden="true" />
                  Corregir
                </button>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <h3 className="font-display mb-4 text-base font-bold text-ink">
                Niños
              </h3>
              {seleccion.kids.length === 0 ? (
                <p className="text-[13px] text-ink-3">
                  No hay niños registrados en esta familia.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {seleccion.kids.map((kid) => {
                    const sinNombre = !kid.name;
                    return (
                      <li
                        key={kid.id}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line/40 px-3.5 py-3"
                      >
                        <div className="flex flex-col min-w-0">
                          <span
                            className={cn(
                              "truncate text-[13.5px]",
                              sinNombre
                                ? "text-ink-3"
                                : "font-semibold text-ink",
                            )}
                          >
                            {sinNombre ? "Sin nombre todavía" : kid.name}
                            {kid.nickname && (
                              <span className="ml-1.5 font-normal text-ink-3">
                                «{kid.nickname}»
                              </span>
                            )}
                          </span>
                          {kid.ageYears !== undefined && (
                            <span className="tnum text-[11.5px] text-ink-3">
                              {kid.ageYears} años
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEditando({
                              tipo: "NINO",
                              repId: seleccion.id,
                              kidId: kid.id,
                            })
                          }
                          className={cn(
                            "flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-[12.5px] text-ink-2",
                            "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                            "hover:border-line-strong hover:text-ink focus-visible:outline-brand",
                          )}
                        >
                          {sinNombre ? (
                            <>
                              <UserPlus size={14} aria-hidden="true" />
                              Poner nombre
                            </>
                          ) : (
                            <>
                              <UserCog size={14} aria-hidden="true" />
                              Corregir
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <p className="text-[13px] text-ink-3">
            Elige una familia para ver sus detalles.
          </p>
        )}
      </div>

      {editando && editando.tipo === "REPRESENTANTE" && (
        <HojaRepresentante
          key={`rep-${editando.id}`}
          representante={directorio.representantes.find(
            (r) => r.id === editando.id,
          )!}
          onCerrar={() => setEditando(null)}
          onGuardar={manejarEdicion}
        />
      )}

      {editando && editando.tipo === "NINO" && (
        <HojaNino
          key={`kid-${editando.kidId}`}
          representanteId={editando.repId}
          kid={directorio.representantes
            .find((r) => r.id === editando.repId)!
            .kids.find((k) => k.id === editando.kidId)!}
          onCerrar={() => setEditando(null)}
          onGuardar={manejarEdicion}
        />
      )}
    </Container>
  );
}

function HojaRepresentante({
  representante,
  onCerrar,
  onGuardar,
}: {
  representante: RepresentanteDto;
  onCerrar: () => void;
  onGuardar: (cmd: RepresentanteCommand) => string | null;
}) {
  const [fullName, setFullName] = useState(representante.fullName);
  const [contactReference, setContactReference] = useState(
    representante.contactReference,
  );
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});

  function guardar() {
    const cmd: RepresentanteCommand = {
      kind: "CORREGIR_REPRESENTANTE",
      representanteId: representante.id,
      fullName,
      contactReference,
    };
    const fallos = erroresDelMando(cmd);
    if (Object.keys(fallos).length > 0) {
      setCampos(fallos);
      setErrorGlobal(null);
      return;
    }
    setCampos({});
    const error = onGuardar(cmd);
    setErrorGlobal(error);
  }

  /** Corregir un campo borra su queja: nada de errores que sobreviven al arreglo. */
  const limpiar = (campo: string) => {
    setErrorGlobal(null);
    setCampos((prev) => {
      if (!prev[campo]) return prev;
      const { [campo]: _fuera, ...resto } = prev;
      return resto;
    });
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Corregir representante"
      descripcion="Ajusta el nombre o el teléfono si hubo un error al registrar a la familia."
      pie={
        <div className="flex gap-2">
          <Button
            surface="tablet"
            variant="ghost"
            onClick={onCerrar}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            surface="tablet"
            variant="primary"
            onClick={guardar}
            className="flex-1"
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {errorGlobal && (
          <div className="rounded-[var(--radius-card)] bg-state-crit-bg/40 p-3 text-[13px] font-medium text-state-crit">
            {errorGlobal}
          </div>
        )}
        <Input
          surface="tablet"
          label="Nombre del representante"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            limpiar("fullName");
          }}
          {...(campos["fullName"] ? { error: campos["fullName"] } : {})}
        />
        <Input
          surface="tablet"
          label="Teléfono o contacto"
          value={contactReference}
          onChange={(e) => {
            setContactReference(e.target.value);
            limpiar("contactReference");
          }}
          {...(campos["contactReference"]
            ? { error: campos["contactReference"] }
            : {})}
        />
      </div>
    </Sheet>
  );
}

function HojaNino({
  representanteId,
  kid,
  onCerrar,
  onGuardar,
}: {
  representanteId: string;
  kid: NinoDelDirectorio;
  onCerrar: () => void;
  onGuardar: (cmd: RepresentanteCommand) => string | null;
}) {
  const [name, setName] = useState(kid.name ?? "");
  const [nickname, setNickname] = useState(kid.nickname ?? "");
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});

  function guardar() {
    const cmd: RepresentanteCommand = {
      kind: "CORREGIR_NINO",
      representanteId,
      kidId: kid.id,
      name,
      // Borrar el apodo es quedarse sin apodo, no tener uno vacío.
      ...(nickname.trim() ? { nickname } : {}),
    };
    const fallos = erroresDelMando(cmd);
    if (Object.keys(fallos).length > 0) {
      setCampos(fallos);
      setErrorGlobal(null);
      return;
    }
    setCampos({});
    const error = onGuardar(cmd);
    setErrorGlobal(error);
  }

  const limpiar = (campo: string) => {
    setErrorGlobal(null);
    setCampos((prev) => {
      if (!prev[campo]) return prev;
      const { [campo]: _fuera, ...resto } = prev;
      return resto;
    });
  };

  const sinNombre = !kid.name;

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={sinNombre ? "Poner nombre al niño" : "Corregir datos del niño"}
      descripcion={
        sinNombre
          ? "Esta estancia entró rápido solo con pulsera. Ponle nombre ahora."
          : "Ajusta el nombre o apodo si hubo un error de tecleo."
      }
      pie={
        <div className="flex gap-2">
          <Button
            surface="tablet"
            variant="ghost"
            onClick={onCerrar}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            surface="tablet"
            variant="primary"
            onClick={guardar}
            className="flex-1"
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {errorGlobal && (
          <div className="rounded-[var(--radius-card)] bg-state-crit-bg/40 p-3 text-[13px] font-medium text-state-crit">
            {errorGlobal}
          </div>
        )}
        <Input
          surface="tablet"
          label="Nombre completo"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            limpiar("name");
          }}
          placeholder="Ej. Valentina Rojas"
          {...(campos["name"] ? { error: campos["name"] } : {})}
        />
        <Input
          surface="tablet"
          label="Apodo (opcional)"
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            limpiar("nickname");
          }}
          placeholder="Ej. Vale"
          {...(campos["nickname"] ? { error: campos["nickname"] } : {})}
        />
      </div>
    </Sheet>
  );
}
