"use client";

import { useEffect, useState, type Ref } from "react";
import { Baby, Check, CircleCheckBig, CircleDollarSign, HandHeart, Phone, TriangleAlert, X } from "lucide-react";
import type { ClienteEncontradoDto, PricePackageDto, RepresentanteEncontradoDto } from "@l2/contracts";
import { money, sum, toMajor, type Money } from "@l2/domain-money";
import { Badge, Initial, Input, Marquesina, MoneyDisplay, cn, formatMoneyVE } from "@l2/ui";
import type { ProductoALaVenta } from "../inventario/catalogo.ts";
import { PackagePicker } from "./PackagePicker";
import { IconoMedias } from "./IconoMedias.tsx";
import { CampoCedula, CampoTelefono } from "../clientes/CamposDelCliente.tsx";
import { CampoDelCliente, type ClienteElegido } from "../clientes/CampoDelCliente.tsx";
import { buscarCliente } from "../clientes/clientes.acciones";
import { claveDeNombre, type Entrada, type EntradaDeNinos } from "./useEntradaDeNinos.ts";

/**
 * Las piezas de la entrada al parque que usan Entrada y la entrada desde la caja (B3-9, M-31): la fila de cada niño, el
 * representante y el total. Reciben datos y emiten eventos; la lógica está en `useEntradaDeNinos`.
 */

/**
 * Los niños de la familia que ya vino (DEC-28; B4-18, W-4), en botones: un toque pone su nombre en el primer niño de la
 * entrada que no lo tiene, otro lo quita. Sin el teclado de letras (antes, un `datalist` que la tablet casi no muestra).
 */
export function SusNinos({
  encontrado,
  entradas,
  onNombrar,
  onAviso,
}: {
  encontrado: RepresentanteEncontradoDto | null;
  entradas: readonly Entrada[];
  /** Pone el nombre de una fila, o lo quita con `""`. */
  onNombrar: (uid: string, nombre: string) => void;
  onAviso: (texto: string) => void;
}) {
  if (!encontrado || encontrado.kids.length === 0) return null;
  return (
    <div role="group" aria-label="Sus niños" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">Sus niños</span>
      {encontrado.kids.map((k) => {
        const es = (n: string) => claveDeNombre(n) === claveDeNombre(k.name) || (k.nickname ? claveDeNombre(n) === claveDeNombre(k.nickname) : false);
        const fila = entradas.find((x) => x.nombre.trim() !== "" && es(x.nombre));
        return (
          <button
            key={k.id}
            type="button"
            aria-pressed={fila !== undefined}
            onClick={() => {
              if (fila) return onNombrar(fila.uid, "");
              const libre = entradas.find((x) => x.nombre.trim() === "");
              if (!libre) return onAviso(`Pasa primero la pulsera de ${k.name}; después tócalo.`);
              onNombrar(libre.uid, k.name);
            }}
            className={cn(
              "inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-cuerpo font-semibold",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              fila ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {fila ? <Check className="size-(--icono-texto) text-brand" aria-hidden="true" /> : <Baby className="size-(--icono-texto) text-ink-3" aria-hidden="true" />}
            <span data-privado="">{k.nickname ?? k.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Un niño de la entrada: su pulsera (o «Sin pulsera»), su nombre, su paquete y sus medias.
 *
 * B4-12 (M-34): donde la fila es ancha (la capa de la entrada en escritorio y en la tablet) va en **dos renglones**:
 * pulsera, nombre y medias, y debajo el paquete en tarjetas (B4-18: un toque, en las dos orientaciones; antes una lista
 * de 14 px). Donde es angosta (el teléfono), las tarjetas y debajo las medias y el nombre. Se mide la fila, no la
 * pantalla. Las medias (B4-16, M-35): un interruptor, apagado de entrada.
 */
export function FilaDeEntrada({
  e,
  numero,
  paquetes,
  medias,
  mediasAgotadas = false,
  encontrado,
  invitadoDe = null,
  onActualizar,
  onQuitar,
}: {
  e: Entrada;
  numero: number;
  paquetes: readonly PricePackageDto[];
  medias: ProductoALaVenta | null;
  /** No queda otro par que dar (B4-16): un interruptor apagado ya no se enciende, y el niño entra sin cobrárselas. */
  mediasAgotadas?: boolean;
  encontrado: RepresentanteEncontradoDto | null;
  /** El cumpleañero, si es un invitado de su cumpleaños (B10-2): sin paquete, medias ni nombre. */
  invitadoDe?: string | null;
  onActualizar: (patch: Partial<Entrada>) => void;
  onQuitar: () => void;
}) {
  const quien = e.sinPulsera ? e.nombre || "este niño" : e.wristbandCode;
  const sinPar = mediasAgotadas && !e.compraMedias;
  return (
    <li className="@container/fila rounded-[var(--radius-card)] border border-line bg-surface p-4 @2xl/fila:px-3 @2xl/fila:py-2.5">
      <div className="flex flex-wrap items-center gap-3 @2xl/fila:gap-2.5">
        <Initial name={String(numero)} tone="brand" className="order-1" />

        {e.sinPulsera ? (
          <Badge tone="brand" icon={<HandHeart size={14} aria-hidden="true" />} className="order-2 shrink-0 px-3 py-1.5 text-[14px]">
            Sin pulsera
          </Badge>
        ) : (
          <Badge tone="idle" className="order-2 shrink-0 px-3 py-1.5 text-[15px]">
            <span className="tnum font-mono">{e.wristbandCode}</span>
          </Badge>
        )}

        <button
          type="button"
          onClick={onQuitar}
          aria-label={e.sinPulsera ? `Quitar al niño sin pulsera ${e.nombre}` : `Quitar la pulsera ${e.wristbandCode}`}
          className="order-3 ml-auto grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit @2xl/fila:order-7 @2xl/fila:ml-0"
        >
          <X size={16} aria-hidden="true" />
        </button>

        {/* Un invitado de cumpleaños no elige paquete: lo cubre el del evento (B10-2). */}
        {invitadoDe ? (
          <span className="order-4 min-w-0 flex-1 basis-full text-[13px] text-ink-2 @2xl/fila:basis-auto">Invitado · Cumpleaños de {invitadoDe}</span>
        ) : (
          // El paquete en tarjetas, un toque (B4-18): en la fila ancha, en su propio renglón debajo.
          <div role="group" aria-label={`Paquete de ${quien}`} className="order-4 basis-full @2xl/fila:order-8">
            <PackagePicker packages={paquetes} selectedId={e.packageId} onSelect={(id) => onActualizar({ packageId: id })} compact />
          </div>
        )}

        {/* B4-16 (M-35): «Compra medias», un interruptor apagado de entrada; encendido, el par va a su cuenta. Sin medias
            que dar, lo dice y queda apagado: el niño entra sin cobrárselas. */}
        {medias && !invitadoDe && (
          <button
            type="button"
            role="switch"
            aria-checked={e.compraMedias}
            aria-label={`${quien}: compra medias, ${formatMoneyVE(toMajor(medias.precio), "USD")}`}
            disabled={sinPar}
            onClick={() => onActualizar({ compraMedias: !e.compraMedias })}
            className={cn(
              "order-6 flex min-h-12 shrink-0 basis-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13.5px] font-semibold whitespace-nowrap @2xl/fila:w-60 @2xl/fila:basis-auto",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed",
              e.compraMedias ? "border-brand bg-brand/15 text-ink" : "border-line bg-base/40 text-ink-2 hover:border-line-strong",
              sinPar && "text-ink-3 hover:border-line",
            )}
          >
            <IconoMedias size={15} className={e.compraMedias ? "text-brand" : "text-ink-3"} />
            {sinPar ? "Sin medias en existencia" : `Compra medias · ${formatMoneyVE(toMajor(medias.precio), "USD")}`}
            {!sinPar && (
              <span aria-hidden="true" className={cn("relative ml-auto h-4 w-7 shrink-0 rounded-full transition-colors", e.compraMedias ? "bg-brand" : "bg-line-strong")}>
                <span className={cn("absolute top-0.5 size-3 rounded-full bg-surface transition-[left]", e.compraMedias ? "left-3.5" : "left-0.5")} />
              </span>
            )}
          </button>
        )}

        {/* DEC-28: el nombre es opcional. Si la familia ya vino, sus niños se proponen. Los invitados de un cumpleaños no
            son de la familia que reservó: se nombran después, desde la sala. */}
        {!invitadoDe && (
          <input
            id={`nombre-${e.uid}`}
            aria-label={e.sinPulsera ? "Nombre del niño sin pulsera (obligatorio)" : `Nombre del niño de la pulsera ${e.wristbandCode} (opcional)`}
            aria-required={e.sinPulsera}
            value={e.nombre}
            onChange={(ev) => onActualizar({ nombre: ev.target.value })}
            placeholder={
              e.sinPulsera
                ? "Nombre (obligatorio: se le reconoce por él)"
                : encontrado && encontrado.kids.length > 0
                  ? "Nombre (o toca uno de sus niños)"
                  : "Nombre (opcional)"
            }
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            spellCheck={false}
            maxLength={60}
            data-privado=""
            className="order-7 min-h-12 w-full basis-full rounded-[var(--radius-control)] border border-line bg-base px-3 text-base text-ink placeholder:text-detalle placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand @2xl/fila:order-3 @2xl/fila:w-auto @2xl/fila:min-w-0 @2xl/fila:flex-1 @2xl/fila:basis-0"
          />
        )}
      </div>
    </li>
  );
}

/**
 * El representante: su teléfono (lo privado lleva `data-privado`: la captura de un reporte de problema no lo lleva,
 * T-11) y, si ya vino, su nombre; si no, se pide.
 */
export function CampoRepresentante({
  entrada: e,
  cedulaRef,
}: {
  /** El estado de la entrada (`useEntradaDeNinos`): la cédula, el teléfono, la familia encontrada y el nombre nuevo. */
  entrada: Pick<
    EntradaDeNinos,
    | "cedula"
    | "setCedula"
    | "telefono"
    | "setTelefono"
    | "encontrado"
    | "porSuCedula"
    | "faltaSuCedula"
    | "telefonoDeOtro"
    | "familiaEnSala"
    | "sumar"
    | "setSumar"
    | "esNuevo"
    | "nombreNuevo"
    | "setNombreNuevo"
  >;
  /** Tras la primera pulsera, el foco va a la cédula. */
  cedulaRef?: Ref<HTMLInputElement>;
}) {
  const { encontrado } = e;
  // Encontrada por su cédula, el teléfono ya lo tiene el directorio: no se pide.
  const pedirTelefono = !e.porSuCedula || e.telefono.trim() !== "";
  // T-23: el elegido en el campo del cliente (quien está aquí, o por su nombre) pone su cédula o su teléfono; la
  // familia se reconoce como siempre.
  const [elegido, setElegido] = useState<ClienteElegido | null>(null);
  const elegir = (c: ClienteElegido) => {
    setElegido(c);
    if (c.cedula && e.cedula.trim() === "") e.setCedula(c.cedula);
    else if (!c.cedula && e.telefono.trim() === "") e.setTelefono(c.telefono);
  };
  const deshacer = () => {
    if (elegido?.cedula && e.cedula === elegido.cedula) e.setCedula("");
    if (elegido && e.telefono === elegido.telefono) e.setTelefono("");
    setElegido(null);
  };
  /** «No es esta persona» con la familia ya reconocida: se vuelve a empezar por la cédula. */
  const noEs = () => {
    e.setCedula("");
    e.setTelefono("");
    setElegido(null);
  };
  // Lo que dejó sin pagar (B3-11, T-23): la entrada lo avisa en rojo y no lo bloquea (se cobra en la caja).
  const [deudas, setDeudas] = useState<ClienteEncontradoDto["deudas"]>([]);
  const suFicha = encontrado?.id ?? null;
  useEffect(() => {
    if (!suFicha) {
      setDeudas([]);
      return;
    }
    let vivo = true;
    buscarCliente({ clienteId: suFicha })
      .then((r) => vivo && setDeudas(r.ok && r.valor ? r.valor.deudas : []))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [suFicha]);
  const debe = deudas.length > 0 ? sum(deudas.map((d) => money(BigInt(d.monto.minor), "USD")), "USD") : null;
  return (
    <>
      {/* Reconocida la familia (por su cédula, o eligiéndola), un renglón dice quién es y el buscador ya no hace falta
          (B4-18: así cabe en la tablet sin desplazar). */}
      {encontrado && !e.faltaSuCedula ? (
        <div className="flex min-h-14 items-center gap-2 self-end rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3" data-privado="">
          <CircleCheckBig className="size-(--icono-texto) shrink-0 text-state-ok" aria-hidden="true" />
          <Marquesina className="flex-1 text-cuerpo" titulo={`${encontrado.fullName} · ya registrado: no hay que teclear nada más`}>
            <span className="font-semibold text-ink">{encontrado.fullName}</span>
            <span className="text-ink-2"> · ya vino</span>
          </Marquesina>
          <button
            type="button"
            onClick={noEs}
            className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-2 text-detalle font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X className="size-(--icono-texto)" aria-hidden="true" />
            No es esta persona
          </button>
        </div>
      ) : (
        <CampoDelCliente elegido={elegido} onElegir={elegir} onDeshacer={deshacer} surface="pos" conDeuda={false} />
      )}
      {/* T-19: la cédula, lo primero. Con ella se reconoce a la familia que vuelve. */}
      <CampoCedula
        label="Cédula del representante"
        valor={e.cedula}
        onCambio={e.setCedula}
        inputRef={cedulaRef}
        surface="pos"
        required
        hint={e.cedula ? undefined : "Lo primero: si ya vino, aparece sola"}
      />

      {pedirTelefono && (
        <CampoTelefono
          valor={e.telefono}
          onCambio={e.setTelefono}
          surface="pos"
          leading={<Phone size={16} aria-hidden="true" />}
          required={!encontrado}
          hint={encontrado ? "Ya lo tenemos" : undefined}
        />
      )}

      {e.telefonoDeOtro && (
        <p role="alert" className="flex items-start gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg px-3 py-2 text-detalle text-state-warn">
          <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
          <span data-privado="">
            Ese teléfono es de {e.telefonoDeOtro.fullName}, con otra cédula. Revisa la cédula, o usa otro teléfono.
          </span>
        </p>
      )}

      {/* La tarjeta, para lo que falta: un representante de antes sin su cédula. */}
      {encontrado && e.faltaSuCedula && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5",
            e.faltaSuCedula ? "border-state-warn/40 bg-state-warn-bg" : "border-state-ok/40 bg-state-ok-bg",
          )}
        >
          {e.faltaSuCedula ? (
            <TriangleAlert size={16} className="shrink-0 text-state-warn" aria-hidden="true" />
          ) : (
            <CircleCheckBig size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink" data-privado="">
              <Marquesina>{encontrado.fullName}</Marquesina>
            </p>
            <p className="text-[12px] text-ink-2">
              {e.faltaSuCedula ? "Ya vino · escribe su cédula y queda anotada" : "Ya registrado · no hay que teclear nada más"}
            </p>
          </div>
        </div>
      )}

      {debe && (
        <p role="alert" className="flex items-start gap-1.5 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
          <CircleDollarSign className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
          <span data-privado="">
            <span className="font-semibold">Debe {formatMoneyVE(toMajor(debe), "USD")} de antes</span> (
            {deudas.map((d) => `#${String(d.orden).padStart(4, "0")} · ${d.lugar}`).join("; ")}). Puede entrar: se cobra en la caja.
          </span>
        </p>
      )}

      {/* B4-12: su familia tiene niños en la sala: el que llega se suma a esa cuenta, con su propio tiempo. */}
      {e.familiaEnSala && (
        <button
          type="button"
          role="switch"
          aria-checked={e.sumar}
          onClick={() => e.setSumar(!e.sumar)}
          className={cn(
            "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
            e.sumar ? "border-brand bg-brand/10" : "border-line bg-base/40 hover:border-line-strong",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("grid size-5 shrink-0 place-content-center rounded border", e.sumar ? "border-brand bg-brand text-on-brand" : "border-line-strong")}
          >
            {e.sumar && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink" data-privado="">
              Sumar a la familia {e.familiaEnSala.familia} ({e.familiaEnSala.ninos} en sala)
            </span>
            <span className="block text-[12px] text-ink-2">
              {e.sumar
                ? `Entra en su cuenta, con su tiempo desde ahora, y sale con ella. ${e.familiaEnSala.mode === "PREPAGO" ? "Lo suyo va a la caja." : "Se cobra todo al salir."}`
                : "Entra con una cuenta aparte."}
            </span>
          </span>
        </button>
      )}

      {e.esNuevo && (
        <Input
          label="Nombre del representante"
          value={e.nombreNuevo}
          onChange={(ev) => e.setNombreNuevo(ev.target.value)}
          placeholder="Nombre y apellido"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          spellCheck={false}
          data-privado=""
          hint="No lo tenemos registrado todavía"
        />
      )}
    </>
  );
}

/** Lo que cuestan los paquetes (y las medias) de esta entrada, y si quedan medias que dar. */
export function TotalDeEntrada({
  total,
  ninos,
  conTiempoAbierto = 0,
  medias,
  paresQueFaltan,
  sinMedias,
  aforo,
}: {
  /** El aforo de la sala con esta entrada (B4-18: al pie, junto a cuántos niños, para que la capa no desplace). */
  aforo?: Readonly<{ activos: number; limite: number; lleno: boolean; pocos: boolean }>;
  total: Money;
  ninos: number;
  /** Cuántos entran con tiempo abierto (B4-17): su tiempo no está en el total, se cobra al salir. */
  conTiempoAbierto?: number;
  medias: ProductoALaVenta | null;
  paresQueFaltan: number;
  /** No queda ningún par (B4-16): los niños entran sin cobrárselas. */
  sinMedias: boolean;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Paquetes</span>
        <MoneyDisplay value={toMajor(total)} currency={total.currency} size="lg" />
      </div>
      {sinMedias && medias && (
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-state-warn" title="No quedan medias en el inventario: entran sin cobrárselas">
          <TriangleAlert size={14} aria-hidden="true" />
          Sin medias que vender
        </p>
      )}
      {medias && !sinMedias && (paresQueFaltan > 0 || medias.existencia !== null) && (
        <p className="mt-1 text-[12px] text-ink-3">
          {paresQueFaltan > 0 ? `Incluye ${paresQueFaltan === 1 ? "un par de medias" : `${paresQueFaltan} pares de medias`}` : "Medias de seguridad"}
          {/* B4-12: cuántos pares quedan, al lado. */}
          {medias.existencia !== null && ` · quedan ${medias.existencia} ${medias.existencia === 1 ? "par" : "pares"}`}
        </p>
      )}
      <p className="mt-1 text-[12px] text-ink-3">
        {ninos === 0 ? "Sin niños en la entrada" : `${ninos} ${ninos === 1 ? "niño" : "niños"}`}
        {conTiempoAbierto > 0 && ` · ${conTiempoAbierto === ninos ? "su tiempo" : `el tiempo abierto de ${conTiempoAbierto}`} se cobra al salir`}
        {aforo && (
          <span className={cn("tnum", aforo.lleno ? "font-semibold text-state-crit" : aforo.pocos ? "font-semibold text-state-warn" : undefined)}>
            {aforo.lleno ? " · aforo completo" : ` · aforo ${aforo.activos} / ${aforo.limite}`}
          </span>
        )}
      </p>
    </div>
  );
}
