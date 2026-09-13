"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Transición entre pantallas con DIRECCIÓN — §8.5, decisión del cliente del
 * 2026-09-11.
 *
 * El movimiento dice dónde estás. Avanzar en la jerarquía entra desde la
 * derecha; volver entra desde la izquierda; cambiar a una pantalla del mismo
 * nivel —de Sala a Entrada, de Cobrar a Turno— es un fundido, porque no se va
 * ni hacia dentro ni hacia fuera (HIG: la dirección debe ser consistente).
 *
 *   nivel 0  acceso
 *   nivel 1  panel
 *   nivel 2  un módulo            /panel/parque
 *   nivel 3  una sección          /panel/parque/tarifas · /entrada · /caja
 *
 * Las superficies de estación cuentan como secciones de su módulo: ir del
 * módulo Parque a Entrada es entrar, y de Entrada al Panel es salir.
 *
 * TRES REGLAS QUE LA HACEN SEGURA
 *  1. El estado base es el final. Si la animación no corre —movimiento
 *     reducido, navegación encadenada— la pantalla aparece igual.
 *  2. No se espera a que termine para nada: una transición cancelada no deja
 *     la interfaz a medias.
 *  3. Tras navegar, el foco pasa al contenido nuevo, para que un lector de
 *     pantalla no se quede leyendo la página anterior (WCAG).
 */

type Direccion = "inicial" | "adelante" | "atras" | "lateral";

const CLASE: Record<Direccion, string> = {
  inicial: "l2-entra",
  adelante: "l2-pagina-adelante",
  atras: "l2-pagina-atras",
  lateral: "l2-pagina-lateral",
};

/**
 * Última ruta mostrada, FUERA de React. Panel y estaciones son dos cáscaras
 * distintas: al pasar de una a otra esta transición se desmonta y se monta de
 * nuevo, y su estado nacería sin saber de dónde se viene.
 *
 * Solo se escribe en un efecto —en el navegador—, así que en el servidor es
 * siempre `null` y el primer render coincide con la hidratación.
 */
let rutaAnterior: string | null = null;

export function nivelDeRuta(ruta: string): number {
  if (ruta === "/" || ruta === "/acceso") return 0;
  const partes = ruta.split("/").filter(Boolean);
  if (partes[0] === "panel") return Math.min(partes.length, 3);
  // Superficies de estación: una sección dentro de su módulo.
  return 3;
}

function direccionEntre(desde: string, hacia: string): Direccion {
  const a = nivelDeRuta(desde);
  const b = nivelDeRuta(hacia);
  return b > a ? "adelante" : b < a ? "atras" : "lateral";
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // La ruta anterior se guarda en estado y se compara DURANTE el render, que
  // es la forma que React admite para derivar un valor de un cambio de props
  // sin un render intermedio con la dirección equivocada.
  const [estado, setEstado] = useState<{ ruta: string; direccion: Direccion }>(() => ({
    ruta: pathname,
    direccion:
      rutaAnterior !== null && rutaAnterior !== pathname
        ? direccionEntre(rutaAnterior, pathname)
        : "inicial",
  }));
  if (estado.ruta !== pathname) {
    setEstado({ ruta: pathname, direccion: direccionEntre(estado.ruta, pathname) });
  }

  useEffect(() => {
    rutaAnterior = pathname;
  }, [pathname]);

  const contenedor = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    contenedor.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    // `overflow-x: clip` evita que el desplazamiento lateral de la entrada
    // asome una barra de scroll horizontal durante 240 ms.
    // Si una pantalla todavía no cabe, se desplaza DENTRO de esta región y la
    // barra de estación no se mueve. Es la red de seguridad, no el diseño.
    <div className="flex min-h-0 flex-1 flex-col overflow-x-clip md:overflow-y-auto">
      <div
        key={pathname}
        ref={contenedor}
        tabIndex={-1}
        className={`${CLASE[estado.direccion]} flex min-h-0 flex-1 flex-col outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
