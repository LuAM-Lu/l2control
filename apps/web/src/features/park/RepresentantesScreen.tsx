"use client";

import { useState } from "react";
import { Crown, UserCog, UserPlus } from "lucide-react";
import { can } from "@l2/domain-identity";
import { useActorEnSesion } from "../identity/sesion.ts";
import {
  RepresentanteCommandSchema,
  type PaginaDelDirectorioDto,
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
  ListaLarga,
  Marquesina,
  useMediaQuery,
  useVistaDeLista,
  type VistaDeLista,
} from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";

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
/** Qué descuento VIP tiene la familia, en palabras. */
function textoVip(vip: { reglaId: string; nombre: string } | null, reglas: readonly { id: string; detalle: string }[]): string {
  if (!vip) return "Sin descuento VIP: la caja no le ofrece ninguno por ser de la familia.";
  const regla = reglas.find((r) => r.id === vip.reglaId);
  return regla ? `${vip.nombre} · ${regla.detalle}` : `${vip.nombre} · regla retirada: ya no se ofrece`;
}

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


/** Lo que se busca en el directorio (T-22): lo escrito y la letra del índice. */
export type ConsultaDelDirectorio = Readonly<{ texto: string; letra: string | null }>;

/**
 * T-22 (M-38): la lista es del servidor (sin tope): busca, trae de a 50 con «Cargar más» y tiene el índice A–Z; tres
 * vistas (Tarjetas, Lista y Compacta) que cada persona elige y se recuerdan en el equipo.
 */
export function RepresentantesScreen({
  pagina,
  consulta,
  cargando,
  error,
  onBuscar,
  onLetra,
  onCargarMas,
  corregir,
  reglasVip = [],
  marcarVip,
}: {
  pagina: PaginaDelDirectorioDto;
  consulta: ConsultaDelDirectorio;
  cargando: boolean;
  error: string | null;
  onBuscar: (texto: string) => void;
  onLetra: (letra: string | null) => void;
  onCargarMas: () => void;
  corregir: (cmd: RepresentanteCommand) => Promise<string | null>;
  /** Las reglas VIP vigentes con que administración puede marcar a una familia (B3-6). */
  reglasVip?: readonly { id: string; nombre: string; detalle: string }[];
  marcarVip?: (guardianId: string, reglaId: string | null) => Promise<string | null>;
}) {
  const reloj = useReloj();
  const actor = useActorEnSesion();
  const puedeMarcarVip = marcarVip !== undefined && actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
  const [marcandoVip, setMarcandoVip] = useState(false);
  const [errorVip, setErrorVip] = useState<string | null>(null);
  const [vista, setVista] = useVistaDeLista("representantes", actor?.id ?? null);
  const [seleccionId, setSeleccionId] = useState<string | null>(pagina.representantes[0]?.id ?? null);
  const ancha = useMediaQuery("(min-width: 64rem)");
  /** En una pantalla estrecha, el detalle abierto en su hoja (T-22). */
  const [enHoja, setEnHoja] = useState(false);
  const [editando, setEditando] = useState<
    | { tipo: "REPRESENTANTE"; id: string }
    | { tipo: "NINO"; repId: string; kidId: string }
    | null
  >(null);


  const seleccion = pagina.representantes.find((r) => r.id === seleccionId) ?? null;

  async function manejarEdicion(cmd: RepresentanteCommand) {
    const err = await corregir(cmd);
    if (err) {
      return err;
    }
    avisar.ok("Cambio guardado");
    setEditando(null);
    return null;
  }

  const detalle = seleccion ? (
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display flex items-center gap-1.5 text-base font-bold text-ink">
                <Crown size={16} className={seleccion.vip ? "text-brand" : "text-ink-3"} aria-hidden="true" />
                Descuento VIP
              </h3>
              <p className="text-[13px] text-ink-2">{textoVip(seleccion.vip ?? null, reglasVip)}</p>
            </div>
            {puedeMarcarVip && (
              <select
                aria-label={`Descuento VIP de ${seleccion.fullName}`}
                disabled={marcandoVip || (reglasVip.length === 0 && !seleccion.vip)}
                value={seleccion.vip?.reglaId ?? ""}
                onChange={async (e) => {
                  const reglaId = e.target.value || null;
                  setMarcandoVip(true);
                  setErrorVip(null);
                  const err = await marcarVip!(seleccion.id, reglaId);
                  setMarcandoVip(false);
                  if (err) setErrorVip(err);
                  else avisar.ok(reglaId ? "Familia marcada VIP" : "Marca VIP quitada");
                }}
                className="min-h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                <option value="">{reglasVip.length === 0 && !seleccion.vip ? "Crea un descuento VIP en Ajustes" : "Sin VIP"}</option>
                {reglasVip.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} · {r.detalle}
                  </option>
                ))}
              </select>
            )}
          </div>
          {errorVip && (
            <p role="alert" className="mt-2 text-[12px] text-state-crit">
              {errorVip}
            </p>
          )}
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
    );

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Parque", href: "/panel/parque" },
          { texto: "Representantes y niños" },
        ]}
        titulo="Representantes y niños"
        descripcion="El directorio de familias. La puerta busca aquí al registrar una entrada para no volver a pedir los datos."
        meta={
          <span className="tnum text-[12.5px] text-ink-3">
            {pagina.familias} {pagina.familias === 1 ? "familia" : "familias"}
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ═════════════════════════ BUSCADOR Y LISTA ═════════════════════════ */}
        <ListaLarga
          etiqueta="Familias"
          elementos={pagina.representantes}
          clave={(r) => r.id}
          vista={vista}
          onVista={setVista}
          buscador={{ placeholder: "Nombre, niño o teléfono", coincide: () => true }}
          servidor={{
            total: pagina.total,
            buscado: consulta.texto,
            onBuscar,
            cargando,
            onCargarMas,
            error,
            letras: { disponibles: pagina.letras, activa: consulta.letra, onLetra },
          }}
          vacio={
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">Todavía no hay familias registradas.</p>
          }
          sinCoincidencias="Nadie con eso en el directorio."
          render={(r, v) => <FilaDeFamilia r={r} vista={v} activa={r.id === seleccionId} onElegir={() => {
            setSeleccionId(r.id);
            setEnHoja(true);
          }} diaNumerico={reloj.diaNumerico} />}
        />

        {/* ═════════════════════════ DETALLE ═════════════════════════ */}
        {/* T-22: en una pantalla estrecha (la tablet en vertical) va en una hoja al tocar la familia: debajo de la lista
            quedaría lejos. */}
        {ancha && detalle}
      </div>

      {!ancha && (
        <Sheet abierto={enHoja && seleccion !== null} onCerrar={() => setEnHoja(false)} titulo={seleccion?.fullName ?? "Familia"} descripcion="Sus datos, su descuento VIP y sus niños.">
          {detalle}
        </Sheet>
      )}

      {editando && editando.tipo === "REPRESENTANTE" && (
        <HojaRepresentante
          key={`rep-${editando.id}`}
          representante={pagina.representantes.find(
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
          kid={pagina.representantes
            .find((r) => r.id === editando.repId)!
            .kids.find((k) => k.id === editando.kidId)!}
          onCerrar={() => setEditando(null)}
          onGuardar={manejarEdicion}
        />
      )}
    </Container>
  );
}

/** Una familia de la lista, en la vista elegida: tarjeta, renglón de lista o renglón compacto. */
function FilaDeFamilia({
  r,
  vista,
  activa,
  onElegir,
  diaNumerico,
}: {
  r: RepresentanteDto;
  vista: VistaDeLista;
  activa: boolean;
  onElegir: () => void;
  diaNumerico: (t: number) => string;
}) {
  const visitas = r.visitas === 0 ? "Sin visitas todavía" : `${r.visitas} ${r.visitas === 1 ? "visita" : "visitas"}`;
  const ninos = `${r.kids.length} ${r.kids.length === 1 ? "niño" : "niños"}`;
  const vip = r.vip && (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-brand/40 px-1.5 text-[10.5px] font-bold text-brand">
      <Crown size={10} aria-hidden="true" />
      VIP
    </span>
  );
  const base = cn(
    "w-full cursor-pointer text-left transition-[border-color,background-color] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  );
  if (vista === "COMPACTA") {
    return (
      <button
        type="button"
        onClick={onElegir}
        aria-pressed={activa}
        title={`${r.fullName} · ${r.contactReference} · ${ninos} · ${visitas}`}
        className={cn(base, "flex min-h-10 items-center gap-2 px-3", activa ? "bg-surface-2" : "hover:bg-surface-2")}
      >
        <Marquesina className="flex-1 text-[13px] font-semibold text-ink">
          <span data-privado="">{r.fullName}</span>
        </Marquesina>
        {vip}
        <span className="tnum shrink-0 text-[11.5px] text-ink-3" data-privado="">
          {r.contactReference}
        </span>
      </button>
    );
  }
  if (vista === "TARJETAS") {
    return (
      <button
        type="button"
        onClick={onElegir}
        aria-pressed={activa}
        className={cn(base, "flex h-full flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-3", activa ? "border-brand/60 bg-surface-2" : "border-line hover:border-line-strong")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Initial name={r.fullName} tone={activa ? "brand" : "idle"} />
          <Marquesina className="flex-1 text-[13.5px] font-semibold text-ink">
            <span data-privado="">{r.fullName}</span>
          </Marquesina>
          {vip}
        </span>
        <span className="tnum text-[12px] text-ink-2" data-privado="">
          {r.contactReference} · {ninos}
        </span>
        <span className="tnum text-[11.5px] text-ink-3">
          {visitas}
          {r.ultimaVisita ? ` · la última el ${diaNumerico(Date.parse(r.ultimaVisita))}` : ""}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      className={cn(base, "flex min-h-14 items-center gap-2.5 rounded-[var(--radius-control)] border bg-surface px-3 py-2", activa ? "border-brand/60 bg-surface-2" : "border-line hover:border-line-strong")}
    >
      <Initial name={r.fullName} tone={activa ? "brand" : "idle"} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold text-ink">
          <Marquesina className="min-w-0 flex-1">
            <span data-privado="">{r.fullName}</span>
          </Marquesina>
          {vip}
        </span>
        {/* El que se recorta es el teléfono, no el número de niños: un «1 niñ» cortado no dice nada. */}
        <span className="tnum flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <span className="min-w-0 truncate" data-privado="">
            {r.contactReference}
          </span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{ninos}</span>
        </span>
      </span>
      <span className="flex flex-col items-end text-right">
        <span className="tnum text-[11.5px] font-medium text-ink-2">{visitas}</span>
        {r.ultimaVisita && <span className="tnum text-[10.5px] text-ink-3">última el {diaNumerico(Date.parse(r.ultimaVisita))}</span>}
      </span>
    </button>
  );
}

function HojaRepresentante({
  representante,
  onCerrar,
  onGuardar,
}: {
  representante: RepresentanteDto;
  onCerrar: () => void;
  onGuardar: (cmd: RepresentanteCommand) => Promise<string | null>;
}) {
  const [fullName, setFullName] = useState(representante.fullName);
  const [contactReference, setContactReference] = useState(
    representante.contactReference,
  );
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});

  async function guardar() {
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
    const error = await onGuardar(cmd);
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
  onGuardar: (cmd: RepresentanteCommand) => Promise<string | null>;
}) {
  const [name, setName] = useState(kid.name ?? "");
  const [nickname, setNickname] = useState(kid.nickname ?? "");
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});

  async function guardar() {
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
    const error = await onGuardar(cmd);
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
