import {
  Baby,
  CreditCard,
  House,
  LayoutGrid,
  Package,
  Settings,
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
  /** Subtítulo que agrupa secciones dentro de un módulo largo (Ajustes). */
  grupo?: string;
};

export type Modulo = {
  id: string;
  nombre: string;
  icon: LucideIcon;
  accion: Action;
  /** «ajustes» va abajo del menú, separado de lo que se opera (M-13). Sin ella, arriba. */
  zona?: "ajustes";
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

/**
 * Los módulos, en el orden del menú — M-13 (JORNADA.md §1).
 *
 * Arriba, lo que se OPERA durante la jornada: parque, restaurante, caja e inventario. Abajo, en
 * «Ajustes», lo que se configura de vez en cuando (tarifas, carta, medios, tasas, impuestos,
 * feriados, personas, equipos). Antes eran siete módulos al mismo nivel y los impuestos pesaban
 * tanto como la caja; la app es para operar el local, y el menú lo dice.
 */
export const MODULOS: readonly Modulo[] = [
  {
    id: "parque",
    nombre: "Parque",
    icon: Baby,
    accion: "parque.checkIn",
    resumen:
      "El tiempo que se cobra. Entrada, monitor de sala con su cronómetro, salida con el desglose y las familias que vuelven.",
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
        id: "representantes",
        nombre: "Representantes y niños",
        href: rutaSeccion("parque", "representantes"),
        // Ver el contacto de una familia es un permiso propio (§7.6).
        accion: "parque.verContacto",
        proposito:
          "El histórico mínimo: nombre, apodo, edad y una referencia de contacto. Nada más — es lo menos sensible que permite operar (DEC-9).",
        tarea: "F5-01",
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
    resumen: "El dinero. Cobro mixto multimoneda y el turno de caja, con sus ventas y su cierre.",
    secciones: [
      {
        id: "cobrar",
        nombre: "Cobrar",
        href: "/caja",
        abre: "estacion",
        proposito: "Cobro mixto con IVA, IGTF sobre el medio de pago y destino del excedente.",
      },
      {
        id: "turno",
        nombre: "Turno",
        href: "/turno",
        abre: "estacion",
        proposito:
          "El turno de principio a fin: lo que hay en la gaveta y lo cobrado por medio, las ventas con su recibo (reimprimir, anular) y el cierre con su arqueo.",
      },
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario",
    icon: Package,
    accion: "inventario.ajustar",
    resumen:
      "Lo que se vende en el mostrador con su precio, y después qué se gasta con cada plato, qué hay que comprar y qué se perdió.",
    secciones: [
      {
        id: "productos",
        nombre: "Productos",
        href: rutaSeccion("inventario", "productos"),
        proposito:
          "Lo que la caja vende en el mostrador o añade a una cuenta: categoría, IVA y precio con su día. Cambiar un precio no altera lo ya vendido.",
        tarea: "F8-02",
      },
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
        id: "entradas",
        nombre: "Entradas de mercancía",
        href: rutaSeccion("inventario", "entradas"),
        proposito:
          "Lo que llega, por compra o reposición: bultos de tantas unidades a tanto el bulto. Sube la existencia y da el costo promedio de cada producto.",
        tarea: "F8-06",
      },
      {
        id: "salidas",
        nombre: "Salidas y conteo",
        href: rutaSeccion("inventario", "salidas"),
        proposito:
          "Merma, consumo interno, regalo y devolución al proveedor, con motivo y autorización, y el conteo físico.",
        tarea: "F8-07",
      },
    ],
  },
  {
    id: "ajustes",
    nombre: "Ajustes",
    icon: Settings,
    zona: "ajustes",
    accion: "catalogo.modificar",
    resumen:
      "Lo que se configura de vez en cuando y cambia cómo trabaja el local: precios, cobro, impuestos, personas y equipos.",
    secciones: [
      {
        id: "tarifas",
        grupo: "Parque y restaurante",
        nombre: "Tarifas y paquetes",
        href: rutaSeccion("ajustes", "tarifas"),
        proposito:
          "Paquetes por tiempo, gracia, excedente, aviso y aforo. Se edita en borrador y la entrada lo usa al publicar.",
        tarea: "F5-04",
      },
      {
        id: "carta",
        grupo: "Parque y restaurante",
        nombre: "Carta y precios",
        href: rutaSeccion("ajustes", "carta"),
        proposito:
          "Platos, categorías y precios. Se edita en borrador y el salón la ve al publicar. Los modificadores llegan después (F6-04).",
        tarea: "F6-03",
      },
      {
        id: "plano",
        grupo: "Parque y restaurante",
        nombre: "Plano del local",
        href: rutaSeccion("ajustes", "plano"),
        // D10: mover mesas es configuración del local, no operación diaria.
        proposito:
          "Dónde está cada mesa, su número, su zona y sus sillas. Se edita en borrador y el salón lo ve al publicar.",
        tarea: "F6-01",
      },
      {
        id: "medios",
        grupo: "Dinero",
        nombre: "Medios de pago",
        href: rutaSeccion("ajustes", "medios"),
        proposito:
          "Qué se puede cobrar y con qué datos: medios activos, terminales del punto de venta, y el banco, el teléfono y el correo que la caja le enseña al cliente.",
        tarea: "F4-02",
      },
      {
        id: "tasas",
        grupo: "Dinero",
        nombre: "Tasas de cambio",
        href: rutaSeccion("ajustes", "tasas"),
        accion: "tasa.confirmar",
        proposito:
          "La tasa del BCV se aplica sola; aquí se ve su historial, se confirma la que quedó retenida y se carga a mano si la fuente falla.",
        tarea: "F3-04",
      },
      {
        id: "impuestos",
        grupo: "Dinero",
        nombre: "Impuestos",
        href: rutaSeccion("ajustes", "impuestos"),
        proposito:
          "Tipos de IVA con su vigencia y el porcentaje de IGTF. Se versionan por fecha: un cambio no reescribe el pasado.",
        tarea: "F3-06",
      },
      {
        id: "feriados",
        grupo: "Dinero",
        nombre: "Feriados bancarios",
        href: rutaSeccion("ajustes", "feriados"),
        proposito:
          "Los feriados bancarios de cada año, copiados del calendario de SUDEBAN. Un feriado no es día hábil: lo cubre la tasa del día hábil anterior.",
        tarea: "B2-4",
      },
      {
        id: "usuarios",
        grupo: "Equipo",
        nombre: "Usuarios y permisos",
        href: rutaSeccion("ajustes", "usuarios"),
        accion: "usuarios.gestionar",
        proposito:
          "Cada persona con su rol fijo, y los permisos adicionales que se le concedan uno a uno (DEC-15).",
        tarea: "F2-11",
      },
      {
        id: "dispositivos",
        grupo: "Equipo",
        nombre: "Dispositivos",
        href: rutaSeccion("ajustes", "dispositivos"),
        accion: "usuarios.gestionar",
        proposito: "Los equipos autorizados, su sucursal y quién tiene sesión abierta en cada uno.",
        tarea: "F2-02",
      },
      {
        id: "accesos",
        grupo: "Equipo",
        nombre: "Roles y accesos",
        href: rutaSeccion("ajustes", "accesos"),
        // Quien edita esto puede abrirle el back-office a un rol entero: es de
        // administración, y el dominio impide que se regale a sí mismo la llave.
        accion: "usuarios.gestionar",
        proposito:
          "Qué alcanza cada rol en este local, sobre la matriz de fábrica. Aquí se decide quién entra al back-office.",
        tarea: "F2-05",
      },
      {
        id: "sucursal",
        grupo: "El local",
        nombre: "Sucursal",
        href: rutaSeccion("ajustes", "sucursal"),
        proposito:
          "Datos fiscales, horario, moneda funcional, formato de hora y el umbral de vuelto que se puede dejar en caja. El aforo vive en Tarifas y paquetes.",
        tarea: "F5-08b",
      },
      {
        id: "impresoras",
        grupo: "El local",
        nombre: "Impresoras",
        href: null,
        proposito: "Impresora fiscal, comandas de cocina y tickets de 58 u 80 mm.",
        tarea: "F1-12",
        necesita: "Tener la impresora en red y sus plantillas.",
      },
    ],
  },
];

/**
 * Direcciones que se mudaron con M-13 y adónde van ahora. Un enlace guardado, un favorito o una
 * pestaña abierta no se rompen: la página los lleva a su sitio nuevo.
 */
export const RUTAS_MOVIDAS: Readonly<Record<string, Route>> = {
  personas: rutaModulo("ajustes"),
  configuracion: rutaModulo("ajustes"),
  "personas/representantes": rutaSeccion("parque", "representantes"),
  // B9-3: «Compras y mermas» se partió en entradas (B9-3) y salidas con conteo (B9-4).
  "inventario/compras": rutaSeccion("inventario", "entradas"),
  "inventario/mermas": rutaSeccion("inventario", "salidas"),
  "personas/usuarios": rutaSeccion("ajustes", "usuarios"),
  "personas/dispositivos": rutaSeccion("ajustes", "dispositivos"),
  "configuracion/accesos": rutaSeccion("ajustes", "accesos"),
  "configuracion/sucursal": rutaSeccion("ajustes", "sucursal"),
  "configuracion/impuestos": rutaSeccion("ajustes", "impuestos"),
  "configuracion/feriados": rutaSeccion("ajustes", "feriados"),
  "configuracion/impresoras": rutaSeccion("ajustes", "impresoras"),
  "caja/medios": rutaSeccion("ajustes", "medios"),
  "caja/tasas": rutaSeccion("ajustes", "tasas"),
  "caja/ventas": "/turno",
  "caja/turnos": "/turno",
  "parque/tarifas": rutaSeccion("ajustes", "tarifas"),
  "restaurante/plano": rutaSeccion("ajustes", "plano"),
  "restaurante/carta": rutaSeccion("ajustes", "carta"),
};

/** Lo de arriba del menú (operar) y lo de abajo (Ajustes), en ese orden. */
export function modulosDeZona(modulos: readonly Modulo[], zona: "operar" | "ajustes"): Modulo[] {
  return modulos.filter((m) => (m.zona ?? "operar") === zona);
}

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
