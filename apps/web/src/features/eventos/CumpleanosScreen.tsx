"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { Archive, Cake, Info, Pencil, Percent, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import type { CatalogoDto, CatalogoEventosPublicadoDto, PaqueteEventoDto } from "@l2/contracts";
import { ANTICIPO_POR_DEFECTO_BPS } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { money, toMajor } from "@l2/domain-money";
import { basisPointsFromPercent, percentFromBasisPoints } from "@l2/domain-tax";
import { Badge, Button, Cifra, Confirmacion, Container, Dialog, EmptyState, Input, MoneyDisplay, PageHeader, Resumen, Sheet, Tabs, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { publicarCatalogoEventos } from "./eventos.acciones";

/**
 * Ajustes → Cumpleaños (B10-1, D-EVT; patrón de Ajustes, M-17). Administración carga los paquetes de
 * cumpleaños: precio, mínimo y máximo de invitados (nunca por encima del aforo) y lo que incluye, del
 * catálogo de productos. Junto a ellos, el anticipo que se cobra al reservar (el 50 % por defecto).
 * Todo se publica junto como una versión; un paquete no se borra, se retira, porque las reservas
 * hechas lo nombran (y lo conservan copiado: cambiarlo no toca lo ya reservado).
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const enDolares = (m: { minor: string }) => money(BigInt(m.minor), "USD");
const incluyeTexto = (p: PaqueteEventoDto) => p.incluye.map((x) => (x.quantity > 1 ? `${x.quantity} × ${x.name}` : x.name)).join(", ");

type Borrador = { id: string | null; nombre: string; precio: string; min: string; max: string; incluye: { productId: string; quantity: string }[] };

export function CumpleanosScreen({ publicado, productos }: { publicado: CatalogoEventosPublicadoDto; productos: CatalogoDto | null }) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const actor = useActorEnSesion();
  const puede = actor ? can(actor, "catalogo.modificar") !== "DENEGADO" : false;
  const { preciosConIva } = useSucursal().ajustes;
  useAlCambiar(["eventos", "tarifario"], () => router.refresh());

  const catalogo = publicado.catalogo;
  const paquetes = catalogo?.paquetes ?? [];
  const anticipoBps = catalogo?.anticipoBps ?? ANTICIPO_POR_DEFECTO_BPS;
  const aLaVenta = paquetes.filter((p) => p.active);
  const retirados = paquetes.filter((p) => !p.active);
  const vendibles = (productos?.productos ?? []).filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const [vista, setVista] = useState<"venta" | "retirados">("venta");
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [anticipo, setAnticipo] = useState<string | null>(null);
  const [retirando, setRetirando] = useState<PaqueteEventoDto | null>(null);
  const [enviando, setEnviando] = useState(false);

  /** Publica el catálogo entero con los paquetes y el anticipo que se le pasen. */
  const publicar = async (nuevos: readonly PaqueteEventoDto[], bps: number, hecho: string): Promise<boolean> => {
    setEnviando(true);
    try {
      const cmd = {
        sobre: publicado.version,
        catalogo: { anticipoBps: bps, paquetes: nuevos.map((p) => ({ ...p, incluye: p.incluye.map(({ productId, quantity }) => ({ productId, quantity })) })) },
      };
      const r = await conElevacion(() => publicarCatalogoEventos(cmd));
      if (r.ok) {
        avisar.ok(hecho);
        router.refresh();
        return true;
      }
      if (r.problemas?.length) {
        // El servidor señala el campo del paquete (catalogo.paquetes.i.campo): se pinta en la hoja.
        setErrores(Object.fromEntries(r.problemas.map((p) => [String(p.path[3] ?? p.path[p.path.length - 1]), r.mensaje])));
      }
      avisar.error(r.mensaje);
      return false;
    } catch {
      avisar.error("No se pudo hablar con el servidor. No se publicó nada.");
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const abrir = (p: PaqueteEventoDto | null) => {
    setErrores({});
    setBorrador(
      p
        ? {
            id: p.id,
            nombre: p.name,
            precio: toMajor(enDolares(p.price)).replace(".", ","),
            min: String(p.minInvitados),
            max: String(p.maxInvitados),
            incluye: p.incluye.map((x) => ({ productId: x.productId, quantity: String(x.quantity) })),
          }
        : { id: null, nombre: "", precio: "", min: "10", max: String(Math.min(20, publicado.aforo ?? 20)), incluye: [] },
    );
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrador) return;
    const nuevos: Record<string, string> = {};
    const precio = importeTecleado(borrador.precio, "USD");
    if (!precio || precio.amount <= 0n) nuevos.price = "Un precio en dólares mayor que cero";
    const min = Number(borrador.min);
    const max = Number(borrador.max);
    if (!Number.isInteger(min) || min < 1) nuevos.minInvitados = "Al menos un invitado";
    if (!Number.isInteger(max) || max < 1) nuevos.maxInvitados = "Al menos un invitado";
    else if (publicado.aforo !== null && max > publicado.aforo) nuevos.maxInvitados = `El aforo es de ${publicado.aforo}`;
    if (!nuevos.minInvitados && !nuevos.maxInvitados && min > max) nuevos.minInvitados = "El mínimo no pasa del máximo";
    if (borrador.nombre.trim().length < 2) nuevos.name = "Escribe el nombre del paquete";
    const incluye = borrador.incluye.map((x) => ({ productId: x.productId, quantity: Number(x.quantity) }));
    if (incluye.some((x) => !x.productId || !Number.isInteger(x.quantity) || x.quantity < 1)) nuevos.incluye = "Elige cada producto y cuántos";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    const paquete: PaqueteEventoDto = {
      id: borrador.id ?? crypto.randomUUID(),
      name: borrador.nombre.trim(),
      price: { minor: String(precio!.amount), currency: "USD" },
      minInvitados: min,
      maxInvitados: max,
      // El nombre lo pone el servidor desde el catálogo de productos.
      incluye: incluye.map((x) => ({ ...x, name: vendibles.find((p) => p.id === x.productId)?.nombre ?? "—" })),
      active: true,
    };
    const lista = borrador.id ? paquetes.map((p) => (p.id === borrador.id ? { ...paquete, active: p.active } : p)) : [...paquetes, paquete];
    if (await publicar(lista, anticipoBps, borrador.id ? `Paquete actualizado: ${paquete.name}` : `Paquete a la venta: ${paquete.name}`)) setBorrador(null);
  };

  const fila = (p: PaqueteEventoDto, retirado: boolean) => (
    <li key={p.id} className={cn("flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between", retirado && "text-ink-3")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
          {p.name}
          <MoneyDisplay value={toMajor(enDolares(p.price))} currency="USD" size="sm" />
          <Badge tone="idle" icon={<Users size={12} aria-hidden="true" />}>
            <span className="tnum">
              {p.minInvitados} a {p.maxInvitados}
            </span>
          </Badge>
        </p>
        <p className="truncate text-[12.5px] text-ink-2">{p.incluye.length > 0 ? `Incluye ${incluyeTexto(p)}` : "Sin productos incluidos"}</p>
      </div>
      {puede && (
        <div className="flex shrink-0 gap-1.5 self-start sm:self-auto">
          {!retirado && (
            <Button type="button" variant="ghost" surface="admin" className="gap-1.5" onClick={() => abrir(p)}>
              <Pencil size={14} aria-hidden="true" /> Editar
            </Button>
          )}
          {retirado ? (
            <Button type="button" variant="ghost" surface="admin" className="gap-1.5" disabled={enviando} onClick={() => void publicar(paquetes.map((x) => (x.id === p.id ? { ...x, active: true } : x)), anticipoBps, `De vuelta a la venta: ${p.name}`)}>
              <RotateCcw size={14} aria-hidden="true" /> Volver a la venta
            </Button>
          ) : (
            <Button type="button" variant="ghost" surface="admin" className="gap-1.5" onClick={() => setRetirando(p)}>
              <Trash2 size={14} className="text-state-crit" aria-hidden="true" /> Retirar
            </Button>
          )}
        </div>
      )}
    </li>
  );

  const lista = (items: readonly PaqueteEventoDto[], retirado: boolean) => (
    <div className="flex min-h-0 flex-col gap-3 md:h-full">
      {items.length === 0 ? (
        <EmptyState
          icon={<Cake size={20} />}
          title={retirado ? "Ningún paquete retirado" : "Todavía no hay paquetes de cumpleaños"}
          hint={retirado ? "Los que retires se quedan aquí y pueden volver a la venta." : "Sin paquetes no se reserva ningún cumpleaños: crea el primero."}
        />
      ) : (
        <ul className="flex min-h-0 flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:overflow-y-auto">{items.map((p) => fila(p, retirado))}</ul>
      )}
      <p className="flex shrink-0 items-start gap-1.5 text-[12.5px] text-ink-3">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        Cambiar un paquete no toca las reservas hechas: cada una guarda el paquete como se reservó.
      </p>
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Cumpleaños" }]}
        titulo="Cumpleaños"
        descripcion={`Los paquetes que se reservan en Parque → Eventos: su precio ${preciosConIva ? "con el IVA incluido" : "sin IVA"}, cuántos invitados admiten y lo que incluyen. Al reservar se cobra el anticipo; el saldo, el día del evento.`}
        acciones={
          puede ? (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => abrir(null)} disabled={publicado.aforo === null}>
              <Plus size={15} aria-hidden="true" /> Nuevo paquete
            </Button>
          ) : undefined
        }
      />

      <Resumen etiqueta="Resumen de los paquetes de cumpleaños">
        <Cifra
          etiqueta="A la venta"
          icono={<Cake aria-hidden="true" />}
          tono={aLaVenta.length === 0 ? "warn" : "idle"}
          valor={String(aLaVenta.length)}
          pie={aLaVenta.length > 0 ? "Se ofrecen al reservar" : "Sin paquetes no se reserva"}
          activo={vista === "venta"}
          onClick={() => setVista("venta")}
        />
        <Cifra
          etiqueta="Anticipo"
          icono={<Percent aria-hidden="true" />}
          valor={`${percentFromBasisPoints(anticipoBps)} %`}
          pie={puede ? "Del precio del paquete · tocar para cambiarlo" : "Del precio del paquete"}
          {...(puede ? { onClick: () => setAnticipo(percentFromBasisPoints(anticipoBps)) } : {})}
        />
        <Cifra
          etiqueta="Aforo"
          icono={<Users aria-hidden="true" />}
          tono={publicado.aforo === null ? "warn" : "idle"}
          valor={publicado.aforo === null ? "—" : String(publicado.aforo)}
          pie={publicado.aforo === null ? "El parque no tiene tarifario publicado" : "Ningún paquete admite más invitados"}
        />
        <Cifra
          etiqueta="Retirados"
          icono={<Archive aria-hidden="true" />}
          valor={String(retirados.length)}
          pie={publicado.version ? `Versión ${publicado.version}${publicado.publicadoPor ? ` · ${publicado.publicadoPor}` : ""}` : "Nunca publicado"}
          activo={vista === "retirados"}
          onClick={() => setVista("retirados")}
        />
      </Resumen>

      <Tabs
        etiqueta="Paquetes de cumpleaños"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => setVista(id as "venta" | "retirados")}
        pestanas={[
          { id: "venta", etiqueta: "A la venta", contador: aLaVenta.length, contenido: lista(aLaVenta, false) },
          { id: "retirados", etiqueta: "Retirados", contador: retirados.length, contenido: lista(retirados, true) },
        ]}
      />

      <Sheet
        abierto={borrador !== null}
        onCerrar={() => setBorrador(null)}
        titulo={borrador?.id ? "Editar paquete" : "Nuevo paquete"}
        descripcion={`${preciosConIva ? "El precio es lo que paga el cliente, con el IVA incluido." : "El precio va sin IVA: la caja lo suma al cobrar."} Lo que incluye sale del catálogo de productos.`}
        pie={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setBorrador(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="paquete-cumple" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
              {enviando ? "Publicando…" : "Guardar y publicar"}
            </Button>
          </div>
        }
      >
        {borrador && (
          <form id="paquete-cumple" onSubmit={guardar} className="flex flex-col gap-3">
            <Input
              surface="admin"
              label="Nombre"
              placeholder="Básico"
              autoComplete="off"
              maxLength={40}
              value={borrador.nombre}
              error={errores.name || undefined}
              onChange={(e) => {
                setBorrador({ ...borrador, nombre: e.target.value });
                setErrores((x) => ({ ...x, name: "" }));
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                surface="admin"
                label="Precio ($)"
                inputMode="decimal"
                autoComplete="off"
                placeholder="150,00"
                className="tnum"
                value={borrador.precio}
                error={errores.price || undefined}
                onChange={(e) => {
                  setBorrador({ ...borrador, precio: e.target.value });
                  setErrores((x) => ({ ...x, price: "" }));
                }}
              />
              <Input
                surface="admin"
                label="Mínimo"
                inputMode="numeric"
                autoComplete="off"
                className="tnum"
                value={borrador.min}
                error={errores.minInvitados || undefined}
                onChange={(e) => {
                  setBorrador({ ...borrador, min: e.target.value.replace(/\D/g, "") });
                  setErrores((x) => ({ ...x, minInvitados: "" }));
                }}
              />
              <Input
                surface="admin"
                label="Máximo"
                inputMode="numeric"
                autoComplete="off"
                className="tnum"
                value={borrador.max}
                error={errores.maxInvitados || undefined}
                hint={publicado.aforo !== null ? `Aforo: ${publicado.aforo}` : undefined}
                onChange={(e) => {
                  setBorrador({ ...borrador, max: e.target.value.replace(/\D/g, "") });
                  setErrores((x) => ({ ...x, maxInvitados: "" }));
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Incluye</span>
              {borrador.incluye.length === 0 && <p className="text-[12.5px] text-ink-3">Nada todavía: el alquiler, la torta, las bebidas…</p>}
              {borrador.incluye.map((x, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-1.5">
                  <select
                    aria-label={`Producto ${i + 1}`}
                    className={CAMPO}
                    value={x.productId}
                    onChange={(e) => {
                      const incluye = borrador.incluye.map((y, j) => (j === i ? { ...y, productId: e.target.value } : y));
                      setBorrador({ ...borrador, incluye });
                      setErrores((z) => ({ ...z, incluye: "" }));
                    }}
                  >
                    <option value="">Elige el producto…</option>
                    {vendibles.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id !== x.productId && borrador.incluye.some((y) => y.productId === p.id)}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Cantidad del producto ${i + 1}`}
                    inputMode="numeric"
                    className={cn(CAMPO, "tnum")}
                    value={x.quantity}
                    onChange={(e) => {
                      const incluye = borrador.incluye.map((y, j) => (j === i ? { ...y, quantity: e.target.value.replace(/\D/g, "") } : y));
                      setBorrador({ ...borrador, incluye });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Quitar el producto ${i + 1}`}
                    className="grid size-10 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit"
                    onClick={() => setBorrador({ ...borrador, incluye: borrador.incluye.filter((_, j) => j !== i) })}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {errores.incluye && <p className="text-[12px] font-medium text-state-crit">{errores.incluye}</p>}
              <Button
                type="button"
                variant="ghost"
                surface="admin"
                className="gap-1.5 self-start"
                disabled={borrador.incluye.length >= 30 || vendibles.length === 0}
                onClick={() => setBorrador({ ...borrador, incluye: [...borrador.incluye, { productId: "", quantity: "1" }] })}
              >
                <Plus size={14} aria-hidden="true" /> Añadir producto
              </Button>
            </div>
          </form>
        )}
      </Sheet>

      <Dialog
        abierto={anticipo !== null}
        onCerrar={() => setAnticipo(null)}
        titulo="Anticipo al reservar"
        descripcion="El porcentaje del precio del paquete que se cobra al reservar. Las reservas hechas conservan el suyo."
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setAnticipo(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              surface="admin"
              disabled={enviando}
              onClick={() => {
                const bps = anticipo === null ? null : basisPointsFromPercent(anticipo);
                if (!bps) {
                  setErrores((x) => ({ ...x, anticipo: "Un porcentaje entre 0,01 y 100" }));
                  return;
                }
                void publicar(paquetes, bps, `Anticipo: ${percentFromBasisPoints(bps)} %`).then((ok) => ok && setAnticipo(null));
              }}
            >
              {enviando ? "Publicando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        <Input
          surface="admin"
          label="Anticipo (%)"
          inputMode="decimal"
          value={anticipo ?? ""}
          error={errores.anticipo || undefined}
          onChange={(e) => {
            setAnticipo(e.target.value);
            setErrores((x) => ({ ...x, anticipo: "" }));
          }}
        />
      </Dialog>

      <Confirmacion
        abierto={retirando !== null}
        onCerrar={() => setRetirando(null)}
        titulo={`¿Retirar «${retirando?.name ?? ""}»?`}
        confirmar={enviando ? "Retirando…" : "Sí, retirar"}
        peligro
        ocupado={enviando}
        onConfirmar={() =>
          retirando &&
          void publicar(paquetes.map((x) => (x.id === retirando.id ? { ...x, active: false } : x)), anticipoBps, `Paquete retirado: ${retirando.name}`).then(() => setRetirando(null))
        }
      >
        <p>Deja de ofrecerse al reservar. No se borra: las reservas hechas lo conservan, y puede volver a la venta.</p>
      </Confirmacion>
    </Container>
  );
}
