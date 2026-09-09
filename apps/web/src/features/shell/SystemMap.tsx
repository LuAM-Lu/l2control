"use client";

import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Calculator,
  CreditCard,
  LayoutGrid,
  LogIn,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Badge, MoneyDisplay, cn } from "@l2/ui";

/**
 * Mapa del sistema — la pieza para mostrar y entender L2 Control.
 *
 * NO es la pantalla donde se trabaja, y esa distinción es lo que arregla el
 * desorden de la versión anterior: intentaba ser el sitio de trabajo Y el
 * mapa a la vez, y no era ninguna de las dos.
 *
 * Aquí se explica el sistema contando **una tarde real**, porque el reloj es
 * la materia prima de este negocio: un parque cobra tiempo. La línea de
 * tiempo no es un adorno, es la forma natural de este dominio.
 */

type Estado = {
  turnoAbierto: string;
  ninosEnSala: number;
  aforo: number;
  conTiempoCumplido: number;
  porVencer: number;
  tasa: string | null;
  tasaHora: string;
};

type Hito = {
  hora: string;
  titulo: string;
  quien: string;
  que: string;
  garantia: string;
  href: "/monitor" | "/entrada" | "/salida" | "/caja" | "/turno" | null;
  superficie: string;
  icon: typeof Baby;
};

const TARDE: Hito[] = [
  {
    hora: "14:00",
    titulo: "Abre el turno",
    quien: "Marisol, cajera",
    que: "Declara el fondo inicial contando billetes, por moneda: 50,00 USD y 2.000,00 Bs.",
    garantia:
      "Sin turno abierto no se puede cobrar. Y un dispositivo solo puede tener un turno abierto a la vez.",
    href: "/turno",
    superficie: "Turno de caja",
    icon: Calculator,
  },
  {
    hora: "14:32",
    titulo: "Llega una familia",
    quien: "Ana, monitora",
    que: "Pasa dos pulseras por el lector. Escribe los nombres mientras escanea la siguiente: el foco salta solo. Busca a la representante por teléfono y aparece sola, porque ya vino antes.",
    garantia:
      "Menos de 90 segundos con dos niños. Una pulsera ya activa en sala se rechaza; el aforo avisa antes de dejar entrar a nadie más.",
    href: "/entrada",
    superficie: "Entrada",
    icon: LogIn,
  },
  {
    hora: "15:22",
    titulo: "El tiempo corre",
    quien: "La sala",
    que: "Doce tarjetas en la pantalla, ordenadas por urgencia. A los diez minutos del final, la de Vale pasa a ámbar y suena el aviso.",
    garantia:
      "El cronómetro lo lleva el servidor. Cambiar el reloj de la tablet mueve lo que se ve, nunca lo que se cobra.",
    href: "/monitor",
    superficie: "Monitor de parque",
    icon: Baby,
  },
  {
    hora: "15:58",
    titulo: "Se sientan a comer",
    quien: "Jesús, mesero",
    que: "Vincula las pulseras de los niños a la mesa 12. A partir de ahí, la cuenta de la mesa lleva los platos y el tiempo de parque juntos.",
    garantia:
      "Es el diferencial: el representante paga una sola vez al final, y el negocio ve el consumo cruzado.",
    href: null,
    superficie: "Mesas y comandas · pendiente",
    icon: LayoutGrid,
  },
  {
    hora: "16:12",
    titulo: "Se van",
    quien: "Ana, monitora",
    que: "Pasa las dos pulseras. Santiago se pasó siete minutos: cinco de gracia y dos que se cobran, un bloque de quince iniciado.",
    garantia:
      "El desglose se muestra siempre. «Son 6,50» sin explicación es una discusión; «3,00 del paquete más 1,50 por dos minutos» no lo es.",
    href: "/salida",
    superficie: "Salida",
    icon: LogOut,
  },
  {
    hora: "16:14",
    titulo: "Paga",
    quien: "Marisol, cajera",
    que: "Cinco dólares en efectivo y el resto en Pago Móvil. El total sube 0,15: el IGTF grava el medio de pago, no la venta, y solo toca la parte en divisas.",
    garantia:
      "Sobran 2,59 y hay que decir qué se hace con ellos. Un excedente sin destino no cierra el cobro.",
    href: "/caja",
    superficie: "Caja",
    icon: CreditCard,
  },
  {
    hora: "22:30",
    titulo: "Cierra el turno",
    quien: "Marisol, cajera",
    que: "Cuenta los billetes de la gaveta. El sistema no le enseña lo que espera hasta que termina de contar. Faltan ocho centavos y quedan registrados.",
    garantia:
      "El corte Z es irreversible y sella los correlativos. Después, ninguna operación monetaria toca ese turno.",
    href: "/turno",
    superficie: "Turno de caja",
    icon: Calculator,
  },
];

/** El camino del dinero de esa misma venta, con sus cifras reales. */
const DINERO = [
  { etiqueta: "Paquete 1 hora · Vale", valor: "5.00", tono: "muted" as const },
  { etiqueta: "Paquete 30 min · Santiago", valor: "3.00", tono: "muted" as const },
  { etiqueta: "Tiempo de más · 1 bloque", valor: "1.50", tono: "muted" as const },
];

const ROLES_MATRIZ = [
  { rol: "Administrador", superficies: 11, sensibles: 0 },
  { rol: "Supervisor", superficies: 9, sensibles: 8 },
  { rol: "Cajero", superficies: 6, sensibles: 5 },
  { rol: "Monitor de parque", superficies: 4, sensibles: 2 },
  { rol: "Mesero", superficies: 1, sensibles: 1 },
  { rol: "Cocina", superficies: 1, sensibles: 0 },
];

const GUARDAS = [
  {
    titulo: "Sin tasa del día, no se cobra en bolívares",
    detalle:
      "Ni con la de ayer, ni con cero. La pantalla lo dice antes de que el cajero lo descubra intentando cobrar.",
  },
  {
    titulo: "Un excedente sin destino no cierra el cobro",
    detalle:
      "Vuelto, propina o caja: hay que elegir. Lo que sobra y nadie explica es dinero perdido.",
  },
  {
    titulo: "El vuelto cruzado usa la tasa de la transacción",
    detalle:
      "Se paga en dólares y se devuelve en bolívares a la misma tasa del cobro. Devolverlo a otra es la filtración más fácil de hacer.",
  },
  {
    titulo: "Nada se borra",
    detalle:
      "Anular es un evento con motivo, autorizador y hora. Un error se corrige con un asiento de reversión, nunca editando el anterior.",
  },
  {
    titulo: "El corte Z sella el turno",
    detalle: "Irreversible por diseño. Después, ninguna operación monetaria puede tocarlo.",
  },
  {
    titulo: "Sin internet, el negocio sigue cobrando",
    detalle:
      "Un servidor en el local lleva la operación; la nube es réplica. La pantalla anuncia el nivel de degradación con palabras.",
  },
];

export function SystemMap({ estado }: { estado: Estado }) {
  const requiereAtencion = estado.conTiempoCumplido > 0 || estado.tasa === null;

  return (
    <div className="min-h-dvh bg-base">
      {/* ─────────────────────────────── estado ahora ───────────────── */}
      <div
        className={cn(
          "border-b",
          requiereAtencion ? "border-state-crit/30 bg-state-crit-bg/30" : "border-line",
        )}
      >
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3.5">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
            Ahora
          </span>

          {estado.conTiempoCumplido > 0 && (
            <Link href="/monitor" className="flex items-baseline gap-2 no-underline">
              <span className="tnum font-display text-xl leading-none font-bold text-state-crit">
                {estado.conTiempoCumplido}
              </span>
              <span className="text-[13px] text-state-crit">con tiempo cumplido</span>
            </Link>
          )}

          {estado.porVencer > 0 && (
            <span className="flex items-baseline gap-2">
              <span className="tnum font-display text-xl leading-none font-bold text-state-warn">
                {estado.porVencer}
              </span>
              <span className="text-[13px] text-state-warn">por vencer</span>
            </span>
          )}

          <span className="flex items-baseline gap-2">
            <span className="tnum font-display text-xl leading-none font-bold text-ink">
              {estado.ninosEnSala}
            </span>
            <span className="text-[13px] text-ink-2">
              niños en sala <span className="text-ink-3">de {estado.aforo}</span>
            </span>
          </span>

          <span className="ml-auto flex items-center gap-4 text-[13px]">
            <span className="text-ink-3">
              Turno abierto <span className="tnum text-ink-2">{estado.turnoAbierto}</span>
            </span>
            {estado.tasa ? (
              <span className="text-ink-3">
                Tasa <span className="tnum text-ink-2">{estado.tasa} Bs</span>
                <span className="tnum ml-1">· {estado.tasaHora}</span>
              </span>
            ) : (
              <Badge tone="crit">Sin tasa del día</Badge>
            )}
          </span>
        </div>
      </div>

      {/* ─────────────────────────────── apertura ───────────────────── */}
      <header className="mx-auto w-full max-w-[1180px] px-6 pt-16 pb-12">
        <p className="font-mono text-[11px] tracking-[0.16em] text-brand uppercase">
          Abby Kingdom · Parque y restaurante
        </p>
        <h1 className="font-display mt-4 max-w-[16ch] text-[clamp(2.5rem,6vw,4.25rem)] leading-[0.98] font-bold tracking-[-0.035em] text-ink">
          Un parque cobra tiempo.
        </h1>
        <p className="mt-6 max-w-[54ch] text-[17px] leading-relaxed text-ink-2">
          Y el tiempo no espera a que alguien lo apunte en un cuaderno. L2 Control lleva el
          cronómetro de cada niño, une su estancia con la cuenta del restaurante, y cuadra la caja
          en tres monedas al final del día.
        </p>
        <p className="mt-4 max-w-[54ch] text-[15px] text-ink-3">
          Así es una tarde de sábado, paso a paso.
        </p>
      </header>

      {/* ─────────────────────────── la tarde ───────────────────────── */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-20">
        <ol className="relative">
          {/* La columna vertebral. Se detiene antes del último nodo para que
              la línea no sobresalga por debajo. */}
          <span
            aria-hidden="true"
            className="absolute top-3 bottom-16 left-[5.75rem] hidden w-px bg-line md:block"
          />

          {TARDE.map((h) => {
            const Icon = h.icon;
            const construida = h.href !== null;

            return (
              <li key={h.hora} className="relative grid gap-x-10 pb-12 md:grid-cols-[4.5rem_1fr]">
                {/* hora */}
                <div className="md:text-right">
                  <span className="tnum font-display text-lg font-bold text-ink-2">{h.hora}</span>
                </div>

                {/* nodo */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[5.75rem] hidden size-2.5 -translate-x-1/2 translate-y-[0.55rem] rounded-full md:block",
                    construida ? "bg-brand" : "bg-line-strong",
                  )}
                />

                <div className="pt-0.5 md:pl-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-display text-[1.6rem] leading-tight font-bold tracking-[-0.02em] text-ink">
                      {h.titulo}
                    </h2>
                    <span className="text-[13px] text-ink-3">{h.quien}</span>
                  </div>

                  <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
                    {h.que}
                  </p>

                  {/* Lo que el sistema garantiza en ese paso: la razón de ser
                      de cada pantalla, no una lista de funciones. */}
                  <p className="mt-3 max-w-[62ch] border-l-2 border-brand/40 pl-4 text-[14px] leading-relaxed text-ink-3">
                    {h.garantia}
                  </p>

                  <div className="mt-4">
                    {construida ? (
                      <Link
                        href={h.href!}
                        className="group inline-flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2.5 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/50 hover:text-ink"
                      >
                        <Icon size={16} className="text-brand" aria-hidden="true" />
                        {h.superficie}
                        <ArrowRight
                          size={14}
                          className="text-ink-3 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-2.5 rounded-[var(--radius-control)] border border-dashed border-line px-4 py-2.5 text-[13.5px] text-ink-3">
                        <Icon size={16} aria-hidden="true" />
                        {h.superficie}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─────────────────────── por dónde va el dinero ─────────────── */}
      <section className="border-t border-line bg-surface/30">
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <h2 className="font-display text-[2rem] leading-tight font-bold tracking-[-0.025em] text-ink">
              Por dónde va el dinero
            </h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
              Es la parte que más se equivoca en un sistema venezolano, y la que decide si la caja
              cuadra. Dos impuestos con naturalezas distintas: el IVA grava lo que se vendió y se
              conoce al facturar; el <strong className="text-ink">IGTF grava el medio de pago</strong>,
              y no se sabe hasta que el cliente decide cómo paga.
            </p>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
              Por eso el total <em>sube</em> al pagar en divisas. No es un fallo: es la norma, y el
              sistema lo dice con palabras en lugar de dejar que el cajero lo descubra solo.
            </p>
            <p className="mt-6 max-w-[52ch] text-[13.5px] text-ink-3">
              Todo monto se guarda como entero de centavos, nunca como decimal. Y cada pago guarda
              la tasa con la que se convirtió: así el reporte de ayer no cambia cuando la tasa suba
              mañana.
            </p>
          </div>

          {/* El recibo de la venta de las 16:14, con sus cifras reales. */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <p className="mb-4 font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
              Venta de las 16:14
            </p>

            <dl className="flex flex-col gap-2 text-[13.5px]">
              {DINERO.map((d) => (
                <div key={d.etiqueta} className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-2">{d.etiqueta}</dt>
                  <dd>
                    <MoneyDisplay value={d.valor} currency="USD" size="sm" tone={d.tono} />
                  </dd>
                </div>
              ))}

              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="text-ink-2">IVA 16 %</dt>
                <dd>
                  <MoneyDisplay value="1.52" currency="USD" size="sm" tone="muted" />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-semibold text-ink">Total del documento</dt>
                <dd>
                  <MoneyDisplay value="11.02" currency="USD" size="md" />
                </dd>
              </div>

              <div className="mt-3 rounded-[var(--radius-control)] border border-state-warn/30 bg-state-warn-bg/60 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12.5px] text-state-warn">
                    IGTF 3 %
                    <span className="block text-[11.5px] text-ink-3">
                      solo sobre los 5,00 pagados en efectivo $
                    </span>
                  </dt>
                  <dd>
                    <MoneyDisplay value="0.15" currency="USD" size="sm" tone="negative" />
                  </dd>
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="font-semibold text-ink">Total a cobrar</dt>
                <dd>
                  <MoneyDisplay value="11.17" currency="USD" size="lg" />
                </dd>
              </div>

              <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3 text-[12.5px] text-ink-3">
                <div className="flex justify-between gap-4">
                  <span>Efectivo $</span>
                  <span className="tnum">5.00</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Pago Móvil · 2.000,00 Bs a 228,41</span>
                  <span className="tnum">8.76</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-line/60 pt-1.5 text-brand">
                  <span>Vuelto</span>
                  <span className="tnum">2.59</span>
                </div>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ───────────────────────── quién toca qué ───────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-6 py-16 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div>
            <h2 className="font-display text-[2rem] leading-tight font-bold tracking-[-0.025em] text-ink">
              Quién toca qué
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
              Seis roles, veinticinco operaciones. No es una lista de casillas: hay un tercer estado
              entre «puede» y «no puede».
            </p>
            <p className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-ink-3">
              Anular un plato ya en producción, aplicar un descuento o reimprimir un documento
              <strong className="text-state-warn"> se pueden hacer, pero exigen motivo y un segundo
              par de ojos</strong>, registrados antes de ejecutar. Ahí es donde se pierde dinero en
              un restaurante, y por eso ninguna de esas tres es un simple sí.
            </p>
            <Link
              href="/acceso"
              className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-brand no-underline hover:underline"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              Ver cómo se entra al sistema
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="pb-3 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                    Rol
                  </th>
                  <th className="pb-3 text-right text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                    Superficies
                  </th>
                  <th className="pb-3 text-right text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                    Con autorización
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLES_MATRIZ.map((r) => (
                  <tr key={r.rol} className="border-b border-line/50 last:border-0">
                    <td className="py-3 text-ink">{r.rol}</td>
                    <td className="tnum py-3 text-right text-ink-2">{r.superficies} de 11</td>
                    <td className="tnum py-3 text-right">
                      {r.sensibles > 0 ? (
                        <span className="text-state-warn">{r.sensibles}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[12.5px] text-ink-3">
              Y la sucursal es parte del permiso: un supervisor de una sede no autoriza nada en
              otra, aunque su rol se lo permita.
            </p>
          </div>
        </div>
      </section>

      {/* ────────────────────── lo que no deja pasar ─────────────────── */}
      <section className="border-t border-line bg-surface/30">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-16">
          <h2 className="font-display max-w-[18ch] text-[2rem] leading-tight font-bold tracking-[-0.025em] text-ink">
            Lo que el sistema no deja pasar
          </h2>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">
            La amenaza de un punto de venta no es un atacante externo: es un error a las siete de la
            tarde con cola delante. Estas reglas están escritas en el código y comprobadas con
            pruebas, no confiadas a la memoria de nadie.
          </p>

          <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {GUARDAS.map((g, i) => (
              <li key={g.titulo} className="flex gap-4">
                <span className="tnum mt-0.5 font-mono text-[11px] text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-[1.05rem] leading-snug font-bold text-ink">
                    {g.titulo}
                  </h3>
                  <p className="mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-ink-2">
                    {g.detalle}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-baseline justify-between gap-4 px-6 py-8 text-[12.5px] text-ink-3">
          <span>
            L2 Control · prototipo con datos de ejemplo. Las cifras son reales en su cálculo, no en
            su origen.
          </span>
          <span className="tnum font-mono">181 pruebas · 6 superficies</span>
        </div>
      </footer>
    </div>
  );
}
