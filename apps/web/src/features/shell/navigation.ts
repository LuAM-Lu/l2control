import {
  Baby,
  CreditCard,
  House,
  LayoutGrid,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import type { Action } from "@l2/domain-identity";

/**
 * El mapa de módulos del back-office — §9.10.3.
 *
 * UNA SOLA FUENTE. De aquí salen tres cosas que antes se escribían por
 * separado y se desincronizaban: el menú lateral, la página de cada módulo y
 * las migas de navegación. Añadir una sección es tocar este archivo, no seis.
 *
 * Cada sección declara **la acción que la abre**, no una lista de roles: así,
 * añadir un rol nuevo no obliga a recordar catorce sitios donde actualizarlo
 * (§7.3). Sin acción declarada, hereda la del módulo.
 *
 * Y cada sección sin construir dice **qué hará, con qué tarea del plan y qué
 * hace falta antes**. Un enlace que no lleva a ninguna parte es peor que una
 * pantalla vacía: la pantalla vacía al menos explica.
 */

export type Seccion = {
  id: string;
  nombre: string;
  /** Ruta existente, o `null` si la pantalla todavía no está construida. */
  href: Route | null;
  accion?: Action;
  /** Qué resuelve. Se muestra en la página del módulo y en la pantalla vacía. */
  proposito: string;
  /**
   * `"estacion"`: al pulsarla se sale del back-office a una superficie de
   * operación a pantalla completa, sin menú lateral ni migas. Se avisa antes
   * de pulsar (N-04 de la auditoría de navegación); volver es el botón
   * «Panel» de la barra de estación, que ve quien puede abrir el panel.
   */
  abre?: "estacion";
  /** Tarea del plan que la construye, ej. «F6-02». */
  tarea?: string;
  /** Qué bloquea su construcción hoy. */
  necesita?: string;
};

export type Modulo = {
  id: string;
  nombre: string;
  icon: LucideIcon;
  accion: Action;
  /** Resumen de una línea; se lee en la página del módulo, bajo el título. */
  resumen: string;
  secciones: Seccion[];
};

/**
 * Inicio es también el tablero de lo que pasa ahora (F9-08): vivió un día como
 * `/panel/vivo` y se fusionó aquí, porque las dos pantallas enseñaban parque,
 * mesas, cocina y caja, y las cifras de una estaban escritas a mano.
 */
export const INICIO = {
  id: "inicio",
  nombre: "Inicio",
  icon: House,
  accion: "reportes.verSucursal" as Action,
  href: "/panel" as Route,
};

export const MODULOS: readonly Modulo[] = [
  {
    id: "parque",
    nombre: "Parque",
    icon: Baby,
    accion: "parque.checkIn",
    resumen:
      "El tiempo que se cobra. Entrada, monitor de sala con su cronómetro, salida con el desglose y las tarifas que lo rigen.",
    secciones: [
      {
        id: "sala",
        nombre: "Monitor de sala",
        href: "/monitor",
        abre: "estacion",
        proposito:
          "Las estancias abiertas, ordenadas por urgencia, con el cronómetro contra el reloj del servidor.",
      },
      {
        id: "entrada",
        nombre: "Entrada",
        href: "/entrada",
        abre: "estacion",
        proposito: "Registrar niños con el lector de pulseras y su representante.",
      },
      {
        id: "salida",
        nombre: "Salida",
        href: "/salida",
        abre: "estacion",
        proposito: "Cerrar la estancia y calcular el excedente con su desglose.",
      },
      {
        id: "tarifas",
        nombre: "Tarifas y paquetes",
        href: rutaSeccion("parque", "tarifas"),
        accion: "catalogo.modificar",
        proposito:
          "Paquetes por tiempo, gracia, excedente, aviso y aforo. Se edita en borrador y la entrada lo usa al publicar.",
        tarea: "F5-04",
      },
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    icon: LayoutGrid,
    accion: "pedido.tomar",
    resumen:
      "Mesas, comandas y cocina. Es lo que permite que la cuenta del parque y la del restaurante se paguen juntas.",
    secciones: [
      {
        id: "mesas",
        nombre: "Mesas y pedidos",
        href: "/mesas",
        abre: "estacion",
        proposito:
          "El plano de sala: qué mesa está ocupada, desde cuándo y qué pidió. Se vincula a las pulseras de los niños y el pedido se confirma antes de ir a cocina.",
      },
      {
        id: "plano",
        nombre: "Plano del local",
        href: rutaSeccion("restaurante", "plano"),
        // D10: mover mesas es configuración del local, no operación diaria.
        accion: "catalogo.modificar",
        proposito:
          "Dónde está cada mesa, su número, su zona y sus sillas. Se edita en borrador y el salón lo ve al publicar.",
        tarea: "F6-01",
      },
      {
        id: "carta",
        nombre: "Carta y precios",
        href: rutaSeccion("restaurante", "carta"),
        accion: "catalogo.modificar",
        proposito:
          "Platos, categorías y precios. Se edita en borrador y el salón la ve al publicar. Los modificadores llegan después (F6-04).",
        tarea: "F6-03",
      },
      {
        id: "comandas",
        nombre: "Comandas del día",
        href: "/cocina",
        abre: "estacion",
        // La cocina no toma pedidos, pero las comandas son su trabajo.
        accion: "kds.cambiarEstado",
        proposito:
          "Lo que se ha pedido, en qué estado va y cuánto lleva esperando. La cocina lo ve en su propia pantalla.",
        tarea: "F6-05",
      },
    ],
  },
  {
    id: "caja",
    nombre: "Caja",
    icon: CreditCard,
    accion: "documento.emitir",
    resumen:
      "El dinero. Cobro mixto multimoneda, turnos con su arqueo, y la tasa del día que lo gobierna todo.",
    secciones: [
      {
        id: "cobrar",
        nombre: "Cobrar",
        href: "/caja",
        abre: "estacion",
        proposito: "Cobro mixto con IVA, IGTF sobre el medio de pago y destino del excedente.",
      },
      {
        id: "ventas",
        nombre: "Ventas del turno",
        href: "/ventas",
        abre: "estacion",
        proposito: "Los cobros cerrados con su recibo: buscar, reimprimir como copia y enviar por WhatsApp.",
      },
      {
        id: "turnos",
        nombre: "Turnos y cortes",
        href: "/turno",
        abre: "estacion",
        proposito: "Fondo inicial, arqueo a ciegas por moneda y corte Z irreversible.",
      },
      {
        id: "tasas",
        nombre: "Tasas de cambio",
        href: null,
        accion: "tasa.confirmar",
        proposito:
          "Capturar la tasa del BCV, confirmarla y dejarla congelada en cada transacción. Sin tasa vigente no se cobra en bolívares.",
        tarea: "F3-04",
        necesita: "La fuente de la tasa y quién la confirma cada mañana.",
      },
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario",
    icon: Package,
    accion: "inventario.ajustar",
    resumen: "Qué se gasta con cada plato vendido, qué hay que comprar y qué se perdió.",
    secciones: [
      {
        id: "insumos",
        nombre: "Insumos",
        href: null,
        proposito: "Existencias por insumo, con su mínimo y su unidad de compra.",
        tarea: "F8-01",
        necesita: "La carta del restaurante, para saber qué insumos existen.",
      },
      {
        id: "recetas",
        nombre: "Recetas",
        href: null,
        proposito: "Cuánto insumo consume cada plato. Es lo que descuenta el stock al vender.",
        tarea: "F8-03",
        necesita: "Insumos y carta.",
      },
      {
        id: "compras",
        nombre: "Compras y mermas",
        href: null,
        proposito:
          "Entradas por compra y salidas por merma, ambas como asientos: nada se edita, todo se corrige con otro movimiento.",
        tarea: "F8-06",
      },
    ],
  },
  {
    id: "personas",
    nombre: "Personas",
    icon: Users,
    accion: "parque.verContacto",
    resumen: "Quién entra al parque, quién lo atiende y desde qué dispositivo.",
    secciones: [
      {
        id: "representantes",
        nombre: "Representantes y niños",
        href: null,
        proposito:
          "El histórico mínimo: nombre, apodo, edad y una referencia de contacto. Nada más — es lo menos sensible que permite operar (DEC-9).",
        tarea: "F5-01",
      },
      {
        id: "usuarios",
        nombre: "Usuarios y permisos",
        href: rutaSeccion("personas", "usuarios"),
        accion: "usuarios.gestionar",
        proposito:
          "Cada persona con su rol fijo, y los permisos adicionales que se le concedan uno a uno (DEC-15).",
        tarea: "F2-11",
      },
      {
        id: "dispositivos",
        nombre: "Dispositivos",
        href: rutaSeccion("personas", "dispositivos"),
        // N-03: apuntaba a `/acceso`, que es la PANTALLA DE BLOQUEO del equipo.
        // Desde el panel parecía que te cerraban la sesión. Mejor una pantalla
        // honesta que diga qué falta que un enlace que asusta.
        accion: "usuarios.gestionar",
        proposito: "Los equipos autorizados, su sucursal y quién tiene sesión abierta en cada uno.",
        tarea: "F2-02",
      },
    ],
  },
  {
    id: "configuracion",
    nombre: "Configuración",
    icon: Settings,
    accion: "catalogo.modificar",
    resumen: "Los datos del negocio que casi nunca cambian, y que cambiarlos cambia todo.",
    secciones: [
      {
        id: "accesos",
        nombre: "Roles y accesos",
        href: rutaSeccion("configuracion", "accesos"),
        // Quien edita esto puede abrirle el back-office a un rol entero: es de
        // administración, y el dominio impide que se regale a sí mismo la llave.
        accion: "usuarios.gestionar",
        proposito:
          "Qué alcanza cada rol en este local, sobre la matriz de fábrica. Aquí se decide quién entra al back-office.",
        tarea: "F2-05",
      },
      {
        id: "sucursal",
        nombre: "Sucursal",
        href: rutaSeccion("configuracion", "sucursal"),
        proposito:
          "Datos fiscales, horario, moneda funcional, formato de hora y el umbral de vuelto que se puede dejar en caja. El aforo vive en Tarifas y paquetes.",
        tarea: "F5-08b",
      },
      {
        id: "impuestos",
        nombre: "Impuestos",
        href: null,
        proposito:
          "Tipos de IVA con su vigencia y el porcentaje de IGTF. Se versionan por fecha: un cambio no reescribe el pasado.",
        tarea: "F3-06",
      },
      {
        id: "impresoras",
        nombre: "Impresoras",
        href: null,
        proposito: "Impresora fiscal, comandas de cocina y tickets de 58 u 80 mm.",
        tarea: "F1-12",
        necesita: "Tener la impresora en red y sus plantillas.",
      },
    ],
  },
];

/** Busca un módulo por su identificador de ruta. */
export function buscarModulo(id: string): Modulo | undefined {
  return MODULOS.find((m) => m.id === id);
}

/** Busca una sección dentro de un módulo. */
export function buscarSeccion(modulo: Modulo, id: string): Seccion | undefined {
  return modulo.secciones.find((s) => s.id === id);
}

/**
 * Rutas del back-office construidas desde el mapa.
 *
 * La aserción a `Route` es deliberada y está aislada AQUÍ: las rutas
 * tipadas de Next no pueden comprobar una plantilla que se arma en tiempo de
 * ejecución, y el identificador viene de este mismo archivo. Concentrarla en
 * dos funciones evita repartir `as Route` por todas las pantallas, que es
 * como se pierde el valor de tener rutas tipadas.
 */
export function rutaSeccion(moduloId: string, seccionId: string): Route {
  return `/panel/${moduloId}/${seccionId}` as Route;
}

export function rutaModulo(moduloId: string): Route {
  return `/panel/${moduloId}` as Route;
}
