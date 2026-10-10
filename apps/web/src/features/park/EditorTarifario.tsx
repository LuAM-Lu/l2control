"use client";

import { useState } from "react";
import { Plus, Redo2, Undo2, Save, TriangleAlert, Edit2, ArchiveRestore, ArchiveX, Ticket, Archive, Timer, CalendarClock, History } from "lucide-react";
import {
  POR_PAGINA,
  TarifarioSchema,
  type PaginaDeVersionesTarifarioDto,
  type ParkPolicyDto,
  type PorPagina,
  type PricePackageDto,
  type Resultado,
  type TarifarioDto,
} from "@l2/contracts";
import { fromMajor, toMajor } from "@l2/domain-money";
import { computeSessionView, epochMs, fixed, openEnded, tiempoDeMas, type PaqueteDeUso, type ParkSession } from "@l2/domain-park";
import { Button, Cifra, Confirmacion, Container, EmptyState, Input, MoneyDisplay, PageHeader, Paginacion, Resumen, Sheet, Tabs, avisar, cn, formatMoneyVE } from "@l2/ui";
import { usePaginas } from "../shell/usePaginas.ts";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerVersionesTarifario } from "./tarifario.acciones";
import { toMoney, toParkPolicy } from "./mappers.ts";
import { useTarifario } from "./TarifarioProvider";

/**
 * Ajustes → Tarifas y paquetes — F5-04, F5-06; patrón de Ajustes (M-17, T-7).
 *
 * Se edita un BORRADOR y la entrada solo ve el tarifario cuando se publica, como versión nueva con quién
 * y cuándo. Arriba, el resumen (paquetes a la venta, retirados, reglas y lo publicado); debajo, tres
 * pestañas: los paquetes (alta y edición en hoja lateral), las reglas del parque y el historial de
 * versiones por páginas, con lo que cambió en cada una. Retirar un paquete no lo borra: lo marca con
 * `active: false`, y se puede devolver a la venta.
 */

type ConsultaVersiones = Readonly<{ pagina: number; porPagina: PorPagina }>;
type Vista = "paquetes" | "reglas" | "versiones";

type Borrador = TarifarioDto;

/** «30 min», «1 h», «1 h 30 min» o «Tiempo libre». */
function duracionLegible(d: PricePackageDto["duration"]): string {
  if (d.kind === "openEnded") return "Tiempo libre";
  const h = Math.floor(d.minutes / 60);
  const m = d.minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function EditorTarifario({ versiones: inicialVersiones }: { versiones: Resultado<PaginaDeVersionesTarifarioDto> }) {
  const { tarifario: publicado, version, publicar } = useTarifario();
  const reloj = useReloj();
  const [vista, setVista] = useState<Vista>("paquetes");
  const versiones = usePaginas<ConsultaVersiones, PaginaDeVersionesTarifarioDto>(
    (q) => leerVersionesTarifario(q),
    inicialVersiones.ok ? inicialVersiones.valor : null,
    { pagina: 1, porPagina: 10 },
  );
  // Otra persona publicó: el historial se vuelve a leer solo.
  useAlCambiar(["tarifario"], () => void versiones.releer());
  const [historial, setHistorial] = useState<Borrador[]>([publicado]);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<readonly string[]>([]);
  const [publicando, setPublicando] = useState(false);
  const [editando, setEditando] = useState<PricePackageDto | "nuevo" | null>(null);
  const [paqueteARetirar, setPaqueteARetirar] = useState<PricePackageDto | null>(null);

  const borrador = historial[paso]!;
  const sucio = JSON.stringify(borrador) !== JSON.stringify(publicado);

  const enVenta = borrador.packages.filter((p) => p.active);
  const retirados = borrador.packages.filter((p) => !p.active);

  function cambiar(siguiente: Borrador) {
    setHistorial((h) => [...h.slice(0, paso + 1), siguiente]);
    setPaso((p) => p + 1);
    setErrores([]);
  }

  async function alPublicar() {
    const r = TarifarioSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([r.error.issues[0]?.message ?? "Error de validación"]);
      return;
    }
    setPublicando(true);
    try {
      const resultado = await publicar(r.data);
      if (!resultado.ok) {
        // El servidor revalida y puede decir otra cosa (CONFLICTO, NO_PERMITIDO…): se enseña.
        setErrores([resultado.problemas?.[0]?.message ?? resultado.mensaje]);
        return;
      }
      setHistorial([resultado.valor.tarifario]);
      setPaso(0);
      setErrores([]);
      void versiones.releer();
      avisar.ok("Tarifario publicado", { detalle: "La entrada ya usa los nuevos paquetes y reglas." });
    } catch {
      setErrores(["No se pudo publicar: el servidor no respondió. El borrador sigue aquí; inténtalo de nuevo."]);
    } finally {
      setPublicando(false);
    }
  }

  function descartar() {
    setHistorial([publicado]);
    setPaso(0);
    setErrores([]);
  }

  function retirar(paquete: PricePackageDto) {
    cambiar({
      ...borrador,
      packages: borrador.packages.map((p) => (p.id === paquete.id ? { ...p, active: false } : p)),
    });
    setPaqueteARetirar(null);
  }

  function devolver(paquete: PricePackageDto) {
    cambiar({
      ...borrador,
      packages: borrador.packages.map((p) => (p.id === paquete.id ? { ...p, active: true } : p)),
    });
  }

  const ultima = versiones.datos?.versiones[0] ?? null;
  const desde = enVenta.length > 0 ? enVenta.reduce((m, p) => (BigInt(p.price.minor) < BigInt(m.price.minor) ? p : m)) : null;

  const paquetes = (
    <div className="flex min-h-0 flex-col gap-3 md:h-full">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button surface="admin" variant="neutral" onClick={() => setEditando("nuevo")}>
          <Plus size={15} aria-hidden="true" />
          Añadir paquete
        </Button>
        <Button surface="admin" variant="ghost" aria-label="Deshacer" title="Deshacer" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
          <Undo2 size={15} aria-hidden="true" />
        </Button>
        <Button surface="admin" variant="ghost" aria-label="Rehacer" title="Rehacer" onClick={() => setPaso((p) => Math.min(historial.length - 1, p + 1))} disabled={paso >= historial.length - 1}>
          <Redo2 size={15} aria-hidden="true" />
        </Button>
        <Button surface="admin" variant="ghost" onClick={descartar} disabled={!sucio}>
          Descartar cambios
        </Button>
      </div>
      <div className="flex min-h-0 flex-col gap-4 md:overflow-y-auto">
        {enVenta.length === 0 ? (
          <EmptyState icon={<Ticket size={20} />} title="No hay paquetes a la venta" hint="Sin paquetes, la entrada no puede vender. Añade uno y publica." />
        ) : (
          <ul className="flex flex-col gap-2">
            {enVenta.map((paquete) => (
              <li key={paquete.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2 shadow-card">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                  <span className="truncate text-[14px] font-semibold text-ink">{paquete.name}</span>
                  <span className="text-[13px] text-ink-2">{duracionLegible(paquete.duration)}</span>
                  <span className="text-[13px] text-ink-3">{paquete.mode === "PREPAGO" ? "Se paga al entrar" : "Se paga al salir"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MoneyDisplay value={toMajor(toMoney(paquete.price))} currency={paquete.price.currency} size="md" />
                  <Button surface="admin" variant="ghost" onClick={() => setEditando(paquete)} aria-label={`Editar ${paquete.name}`}>
                    <Edit2 size={15} aria-hidden="true" />
                    Editar
                  </Button>
                  <Button surface="admin" variant="ghost" onClick={() => setPaqueteARetirar(paquete)} aria-label={`Retirar ${paquete.name}`}>
                    <ArchiveX size={15} className="text-state-crit" aria-hidden="true" />
                    Retirar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {retirados.length > 0 && (
          <section aria-label="Paquetes retirados" className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Retirados · {retirados.length}</h3>
            <ul className="flex flex-col gap-2">
              {retirados.map((paquete) => (
                <li key={paquete.id} className="flex min-h-12 flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-dashed border-line bg-surface-2 px-4 py-2">
                  <span className="min-w-0 truncate text-[14px] text-ink-2">
                    {paquete.name} <span className="text-[12px] text-ink-3">· {duracionLegible(paquete.duration)}</span>
                  </span>
                  <Button surface="admin" variant="neutral" onClick={() => devolver(paquete)}>
                    <ArchiveRestore size={15} aria-hidden="true" />
                    Volver a la venta
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );

  const reglas = (
    <div className="min-h-0 md:h-full md:overflow-y-auto">
      <EditorReglas
        key={JSON.stringify(borrador.policy)}
        policy={borrador.policy}
        paquetes={borrador.packages}
        onChange={(nuevaPolicy) => cambiar({ ...borrador, policy: nuevaPolicy })}
      />
    </div>
  );

  const historialDeVersiones = (
    <div className="flex min-h-0 flex-col gap-3 md:h-full">
      <div aria-busy={versiones.cargando} className={cn("flex min-h-0 flex-1 flex-col transition-opacity", versiones.cargando && "opacity-60")}>
        {versiones.error ? (
          <div role="alert" className="rounded-[var(--radius-card)] border border-state-crit/35 bg-state-crit-bg px-4 py-6 text-center text-[13px]">
            <p className="font-semibold text-state-crit">{versiones.error}</p>
            <Button type="button" variant="neutral" surface="admin" className="mt-3" onClick={() => void versiones.releer()}>
              Volver a intentar
            </Button>
          </div>
        ) : (versiones.datos?.versiones.length ?? 0) === 0 ? (
          <EmptyState icon={<History size={20} />} title="Todavía no hay versiones" hint="Cada vez que publiques, queda aquí con quién y qué cambió." />
        ) : (
          <ul className="flex min-h-0 flex-col gap-2 md:overflow-y-auto">
            {versiones.datos!.versiones.map((v) => (
              <li key={v.version} className="shrink-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-[14px] font-bold text-ink">
                    Versión {v.version}
                    {v.version === version && <span className="ml-2 text-[12px] font-semibold text-state-ok">rige ahora</span>}
                  </span>
                  <span className="tnum text-[12px] text-ink-3">
                    {reloj.diaYHora(Date.parse(v.publicadoEn))} · {v.publicadoPor} · {v.aLaVenta} a la venta
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-ink-2">
                  {v.cambios.map((c) => (
                    <li key={c}>· {c}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!versiones.error && versiones.datos && versiones.datos.total > 0 && (
        <Paginacion
          etiqueta="Páginas de las versiones"
          pagina={versiones.consulta.pagina}
          porPagina={versiones.consulta.porPagina}
          opciones={POR_PAGINA}
          total={versiones.datos.total}
          cargando={versiones.cargando}
          onCambiar={(c) => versiones.cambiar(c)}
        />
      )}
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Ajustes", href: "/panel/ajustes" },
          { texto: "Tarifas y paquetes" },
        ]}
        titulo="Tarifas y paquetes"
        descripcion="Lo que cambies aquí es un borrador: la entrada lo verá cuando publiques."
        acciones={
          <Button surface="admin" variant="primary" onClick={() => void alPublicar()} disabled={!sucio || publicando}>
            <Save size={15} aria-hidden="true" />
            {publicando ? "Publicando…" : "Publicar"}
          </Button>
        }
      />

      <Resumen etiqueta="Resumen del tarifario">
        <Cifra
          etiqueta="A la venta"
          icono={<Ticket aria-hidden="true" />}
          tono={enVenta.length === 0 ? "crit" : "idle"}
          valor={`${enVenta.length} ${enVenta.length === 1 ? "paquete" : "paquetes"}`}
          pie={desde ? `Desde ${formatMoneyVE(toMajor(toMoney(desde.price)), "USD")} · ${desde.name}` : "La entrada no puede vender"}
          activo={vista === "paquetes"}
          onClick={() => setVista("paquetes")}
        />
        <Cifra
          etiqueta="Retirados"
          icono={<Archive aria-hidden="true" />}
          valor={String(retirados.length)}
          pie={retirados.length > 0 ? "Se conservan para las estancias de antes" : "Ninguno"}
          onClick={() => setVista("paquetes")}
        />
        <Cifra
          etiqueta="Reglas"
          icono={<Timer aria-hidden="true" />}
          valor={`${borrador.policy.graceMinutes} min de gracia`}
          pie={`${reglaDelTiempoDeMas(borrador.packages, true)} · aforo ${borrador.policy.capacityLimit}`}
          activo={vista === "reglas"}
          onClick={() => setVista("reglas")}
        />
        <Cifra
          etiqueta="Publicado"
          icono={<CalendarClock aria-hidden="true" />}
          tono={sucio ? "warn" : "idle"}
          valor={sucio ? "Cambios sin publicar" : version === 0 ? "Sin publicar" : `Versión ${version}`}
          pie={ultima ? `${reloj.diaYHora(Date.parse(ultima.publicadoEn))} · ${ultima.publicadoPor}` : "Sin historial"}
          activo={vista === "versiones"}
          onClick={() => setVista("versiones")}
        />
      </Resumen>

      {errores.length > 0 && (
        <div role="alert" className="mt-3 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {errores[0]}
        </div>
      )}

      <Tabs
        etiqueta="Tarifario"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => setVista(id as Vista)}
        pestanas={[
          { id: "paquetes", etiqueta: "Paquetes", contador: enVenta.length, contenido: paquetes },
          { id: "reglas", etiqueta: "Reglas del parque", contenido: reglas },
          { id: "versiones", etiqueta: "Versiones", contador: versiones.datos?.total ?? 0, contenido: historialDeVersiones },
        ]}
      />

      <Confirmacion
        abierto={paqueteARetirar !== null}
        onCerrar={() => setPaqueteARetirar(null)}
        titulo={`¿Retirar «${paqueteARetirar?.name ?? ""}» de la venta?`}
        confirmar="Sí, retirar"
        peligro
        onConfirmar={() => paqueteARetirar && retirar(paqueteARetirar)}
      >
        <p>Deja de ofrecerse al publicar, pero se conserva para las estancias de antes. Se puede devolver a la venta más adelante.</p>
      </Confirmacion>

      {editando !== null && (
        <SheetEditarPaquete
          key={editando === "nuevo" ? "nuevo" : editando.id}
          onCerrar={() => setEditando(null)}
          paquete={editando === "nuevo" ? null : editando}
          onGuardar={(nuevo) => {
            if (editando === "nuevo") {
              cambiar({ ...borrador, packages: [...borrador.packages, nuevo] });
            } else {
              cambiar({
                ...borrador,
                packages: borrador.packages.map((p) => (p.id === nuevo.id ? nuevo : p)),
              });
            }
            setEditando(null);
          }}
          borrador={borrador}
        />
      )}
    </Container>
  );
}

// «bloque» y «precio» ya no se editan (B4-17): pasan tal cual, porque la política los guarda y son el respaldo de una
// estancia vieja sin tarifa; el tiempo de más va en bloques del paquete más chico.
type CampoRegla = "gracia" | "bloque" | "precio" | "aviso" | "aforo";
type TextosReglas = Record<CampoRegla, string>;

const ENTERO = /^\d+$/;

function textosDe(p: ParkPolicyDto): TextosReglas {
  return {
    gracia: String(p.graceMinutes),
    bloque: String(p.penaltyBlockMinutes),
    precio: toMajor(toMoney(p.penaltyPricePerBlock)),
    aviso: String(p.warnBeforeMinutes),
    aforo: String(p.capacityLimit),
  };
}

/** El precio tecleado (admite coma decimal), o `null` si no es un monto. */
function precioDe(texto: string) {
  try {
    return fromMajor(texto.trim().replace(",", "."), "USD");
  } catch {
    return null;
  }
}

function erroresDe(t: TextosReglas): Partial<Record<CampoRegla, string>> {
  const e: Partial<Record<CampoRegla, string>> = {};
  if (!ENTERO.test(t.gracia.trim())) e.gracia = "Minutos enteros, 0 o más";
  if (!ENTERO.test(t.bloque.trim()) || Number(t.bloque) <= 0) e.bloque = "Minutos enteros, mayor que 0";
  const precio = precioDe(t.precio);
  if (!precio || precio.amount < 0n) e.precio = "Escribe el precio en dólares, por ejemplo 1,50";
  if (!ENTERO.test(t.aviso.trim())) e.aviso = "Minutos enteros, 0 o más";
  if (!ENTERO.test(t.aforo.trim()) || Number(t.aforo) <= 0) e.aforo = "Niños, mayor que 0";
  return e;
}

/** Solo se llama con textos sin errores. */
function politicaDe(t: TextosReglas): ParkPolicyDto {
  return {
    graceMinutes: Number(t.gracia),
    penaltyBlockMinutes: Number(t.bloque),
    penaltyPricePerBlock: { minor: String(precioDe(t.precio)!.amount), currency: "USD" },
    warnBeforeMinutes: Number(t.aviso),
    capacityLimit: Number(t.aforo),
  };
}

/**
 * El excedente de ejemplo lo calcula el dominio, no la pantalla (§9.7): una
 * estancia de 60 minutos que se pasa `minutosDeMas`.
 */
/** La tarifa del borrador como la usa la regla de precio (B4-17): los paquetes a la venta. */
function tarifaDe(paquetes: readonly PricePackageDto[]): PaqueteDeUso[] {
  return paquetes
    .filter((p) => p.active)
    .map((p) => ({ name: p.name, duration: p.duration.kind === "fixed" ? fixed(p.duration.minutes) : openEnded, price: toMoney(p.price) }));
}

/** El paquete más chico de tiempo fijo: su bloque es el del tiempo de más (B4-17). */
function paqueteMasChico(paquetes: readonly PricePackageDto[]) {
  return paquetes
    .filter((p) => p.active && p.duration.kind === "fixed")
    .sort((a, b) => (a.duration.kind === "fixed" ? a.duration.minutes : 0) - (b.duration.kind === "fixed" ? b.duration.minutes : 0))[0];
}

/** «bloques de 30 min a $ 3,00» (o, corto, «Bloques de 30 min» para la cifra), o lo que falta para decirlo. */
function reglaDelTiempoDeMas(paquetes: readonly PricePackageDto[], corta = false): string {
  const chico = paqueteMasChico(paquetes);
  if (!chico || chico.duration.kind !== "fixed") return corta ? "Sin paquetes de tiempo fijo" : "sin paquetes de tiempo fijo";
  if (corta) return `Bloques de ${chico.duration.minutes} min`;
  return `bloques de ${chico.duration.minutes} min a ${formatMoneyVE(toMajor(toMoney(chico.price)), "USD")}`;
}

/**
 * El ejemplo de las reglas (B4-17): un niño con el paquete de la hora (o el primero de tiempo fijo) que se pasa
 * `minutosDeMas`, cobrado como lo cobra la salida: bloques del paquete más chico, con tope en la combinación.
 */
function ejemploExcedente(p: ParkPolicyDto, paquetes: readonly PricePackageDto[], minutosDeMas: number) {
  const fijos = paquetes.filter((x) => x.active && x.duration.kind === "fixed");
  const base = fijos.find((x) => x.duration.kind === "fixed" && x.duration.minutes === 60) ?? fijos[0];
  if (!base || base.duration.kind !== "fixed") return null;
  const politica = toParkPolicy(p);
  const estancia: ParkSession = {
    id: "ejemplo",
    childName: "Ejemplo",
    wristbandCode: "EJEMPLO",
    mode: "PREPAGO",
    duration: fixed(base.duration.minutes),
    startedAt: epochMs(0),
  };
  const vista = computeSessionView(estancia, politica, epochMs((base.duration.minutes + minutosDeMas) * 60_000));
  const de = tiempoDeMas(vista, toMoney(base.price), tarifaDe(paquetes), politica.graceMinutes);
  return de ? { paquete: base.name, ...de } : null;
}

/**
 * Las reglas del parque, en el borrador.
 *
 * Se teclea texto y el error sale junto al campo mientras se escribe; el
 * borrador cambia al SALIR del campo, y solo si todo es válido: un paso de
 * deshacer por campo, no uno por tecla. Quien la usa la monta con `key` de la
 * política, así que deshacer, rehacer o descartar la vuelven a leer.
 */
function EditorReglas({
  policy,
  paquetes,
  onChange,
}: {
  policy: ParkPolicyDto;
  /** Los paquetes del borrador: el tiempo de más va en bloques del más chico (B4-17). */
  paquetes: readonly PricePackageDto[];
  onChange: (p: ParkPolicyDto) => void;
}) {
  const [textos, setTextos] = useState<TextosReglas>(() => textosDe(policy));
  const errores = erroresDe(textos);
  const valida = Object.keys(errores).length === 0;

  function escribir(campo: CampoRegla, valor: string) {
    setTextos((t) => ({ ...t, [campo]: valor }));
  }

  function confirmar() {
    if (!valida) return;
    const nueva = politicaDe(textos);
    if (JSON.stringify(nueva) !== JSON.stringify(policy)) onChange(nueva);
  }

  const minutosEjemplo = 20;
  const ejemplo = ejemploExcedente(policy, paquetes, minutosEjemplo);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Minutos de gracia"
          surface="admin"
          inputMode="numeric"
          value={textos.gracia}
          error={errores.gracia}
          hint="0 es «sin gracia»: se cobra desde el primer minuto de más"
          onChange={(e) => escribir("gracia", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Aviso antes de vencer (min)"
          surface="admin"
          inputMode="numeric"
          value={textos.aviso}
          error={errores.aviso}
          hint="Cuándo la tarjeta del monitor pasa a «por vencer»"
          onChange={(e) => escribir("aviso", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Aforo (niños)"
          surface="admin"
          inputMode="numeric"
          value={textos.aforo}
          error={errores.aforo}
          onChange={(e) => escribir("aforo", e.target.value)}
          onBlur={confirmar}
        />
      </div>

      {/* B4-17 (M-37): el tiempo de más ya no tiene bloque ni precio propios: va en bloques del paquete más chico, y
          nunca cuesta más que la combinación de paquetes que cubre el tiempo real. */}
      <p className="rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
        <strong className="text-ink">El tiempo de más</strong> se cobra en {reglaDelTiempoDeMas(paquetes)} (el paquete más chico), y nunca
        más que la combinación de paquetes que cubre lo que estuvo. El tiempo abierto y «Más tiempo» usan la misma tarifa.
        {ejemplo && (
          <>
            {" "}
            <strong className="text-ink">Ejemplo:</strong> con «{ejemplo.paquete}», quien se pasa {minutosEjemplo} minutos paga{" "}
            <span className="tnum">
              {ejemplo.blocks} {ejemplo.blocks === 1 ? "bloque" : "bloques"}
            </span>
            : <strong className="tnum text-ink">{formatMoneyVE(toMajor(ejemplo.charge), "USD")}</strong>.
          </>
        )}
      </p>
    </div>
  );
}

function SheetEditarPaquete({
  onCerrar,
  paquete,
  onGuardar,
  borrador,
}: {
  onCerrar: () => void;
  paquete: PricePackageDto | null;
  onGuardar: (p: PricePackageDto) => void;
  borrador: TarifarioDto;
}) {
  const [nombre, setNombre] = useState(paquete?.name ?? "");
  const [tipo, setTipo] = useState<"fijo" | "libre">(paquete?.duration.kind === "fixed" ? "fijo" : paquete?.duration.kind === "openEnded" ? "libre" : "fijo");
  const [minutosTexto, setMinutosTexto] = useState(paquete?.duration.kind === "fixed" ? paquete.duration.minutes.toString() : "60");
  const [precioTexto, setPrecioTexto] = useState(
    paquete ? toMajor(toMoney(paquete.price)) : ""
  );

  const [errorMinutos, setErrorMinutos] = useState<string | null>(null);
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null);

  function procesarId(texto: string) {
    const base =
      texto
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "pkg";
    const sello = Date.now().toString(36);
    let id = `${base}-${sello}`;
    for (let n = 2; borrador.packages.some((p) => p.id === id); n += 1) id = `${base}-${sello}-${n}`;
    return id;
  }

  function guardar() {
    let minutos = 0;
    if (tipo === "fijo") {
      minutos = parseInt(minutosTexto, 10);
      if (isNaN(minutos) || minutos <= 0) {
        setErrorMinutos("Debe ser mayor que 0");
        return;
      }
    }
    setErrorMinutos(null);

    let precio;
    try {
      const limpio = precioTexto.trim().replace(/,/g, ".");
      precio = fromMajor(limpio, "USD");
      if (precio.amount <= 0n) {
        setErrorPrecio("El precio debe ser mayor que cero.");
        return;
      }
    } catch {
      setErrorPrecio("Escribe el precio en dólares, por ejemplo 8,50.");
      return;
    }
    setErrorPrecio(null);

    const dto: PricePackageDto = {
      id: paquete?.id ?? procesarId(nombre),
      name: nombre.trim(),
      mode: tipo === "fijo" ? "PREPAGO" : "POSTPAGO",
      duration: tipo === "fijo" ? { kind: "fixed", minutes: minutos } : { kind: "openEnded" },
      price: { minor: precio.amount.toString(), currency: "USD" },
      active: paquete ? paquete.active : true,
    };

    onGuardar(dto);
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={paquete ? "Editar paquete" : "Añadir paquete"}
      descripcion="Ajusta el nombre, la duración y el precio del paquete."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="tablet" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" disabled={!nombre.trim() || !precioTexto.trim()} onClick={guardar}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Input label="Nombre del paquete" surface="admin" value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Tipo de tiempo</p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={tipo === "fijo"}
              onClick={() => setTipo("fijo")}
              className={cn(
                "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                tipo === "fijo"
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              )}
            >
              Tiempo fijo
            </button>
            <button
              type="button"
              aria-pressed={tipo === "libre"}
              onClick={() => setTipo("libre")}
              className={cn(
                "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                tipo === "libre"
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              )}
            >
              Tiempo libre
            </button>
          </div>
        </div>

        {tipo === "fijo" && (
          <Input
            label="Minutos"
            surface="admin"
            type="number"
            min="1"
            value={minutosTexto}
            error={errorMinutos ?? undefined}
            onChange={(e) => {
              setMinutosTexto(e.target.value);
              setErrorMinutos(null);
            }}
          />
        )}

        <Input
          label="Precio (USD)"
          surface="admin"
          type="text"
          inputMode="decimal"
          value={precioTexto}
          error={errorPrecio ?? undefined}
          onChange={(e) => {
            setPrecioTexto(e.target.value);
            setErrorPrecio(null);
          }}
        />
      </div>
    </Sheet>
  );
}
