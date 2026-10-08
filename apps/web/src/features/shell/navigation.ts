import {
  Baby,
  ChartColumn,
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
  /**
   * Se ve con cualquiera de estas acciones (T-13): la sección sirve a varios permisos (Productos la ve quien da de alta,
   * quien recibe mercancía y quien ajusta). Si está, manda sobre `accion`.
   */
  acciones?: readonly Action[];
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
  /**
   * Las pestañas de una sección que reúne a sus parientes (T-18): la primera es la que se abre. Cada una con su permiso;
   * la sección se ve con cualquiera de ellos (`acciones`).
   */
  pestanas?: readonly PestanaDeSeccion[];
};

/** Una pestaña de una sección (T-18): lo que antes era una sección propia. Sin `accion`, la de su sección. */
export type PestanaDeSeccion = Readonly<{ id: string; nombre: string; accion?: Action }>;

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
      {
        id: "eventos",
        nombre: "Cumpleaños",
        href: rutaSeccion("parque", "eventos"),
        // Reservar es de quien atiende en la caja (B10-1); la monitora ve los de hoy en su aviso.
        accion: "evento.reservar",
        proposito:
          "La agenda de cumpleaños: reservar con día, horario, paquete e invitados; el anticipo pasa a la caja y el saldo queda para el día.",
        tarea: "B10-1",
      },
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    icon: LayoutGrid,
    accion: "pedido.tomar",
    resumen:
      "Mesas y pedidos; la cocina trabaja con la comanda impresa (ADR-022). Es lo que permite que la cuenta del parque y la del restaurante se paguen juntas.",
    secciones: [
      {
        id: "mesas",
        nombre: "Mesas y pedidos",
        href: "/mesas",
        abre: "estacion",
        proposito:
          "El plano de sala: qué mesa está ocupada, desde cuándo y qué pidió, y si su comanda salió en papel. Se vincula a las pulseras de los niños y el pedido se confirma antes de ir a cocina.",
      },
      {
        id: "atencion",
        nombre: "Atención en el salón",
        href: rutaSeccion("restaurante", "atencion"),
        accion: "reportes.verSucursal",
        proposito:
          "Cuánto lleva cada mesa sentada, sin pedir y esperando lo que pidió, con aviso de las que pasan del umbral, y la espera media y máxima del día.",
        tarea: "B6-8",
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
      {
        id: "papel",
        nombre: "Carga desde papel",
        href: "/papel",
        abre: "estacion",
        proposito:
          "Lo anotado en formularios cuando cayeron internet y luz: la caja lo carga en su turno con la hora real del papel y supervisión lo revisa antes del Z.",
        tarea: "B3-7",
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
        // Lo ve quien da de alta, quien recibe y quien ajusta: cada uno con lo suyo (T-13); y quien arma la carta (T-18).
        acciones: ["inventario.catalogo", "inventario.entrada", "inventario.ajustar", "catalogo.modificar"] as Action[],
        proposito:
          "Lo que la caja vende en el mostrador o añade a una cuenta: categoría, IVA y precio con su día, y qué platos están en la carta. Cambiar un precio no altera lo ya vendido.",
        tarea: "F8-02",
        // T-18: la carta vive aquí, junto al precio (un solo sitio para cambiarlo).
        pestanas: [
          { id: "productos", nombre: "Productos" },
          { id: "carta", nombre: "En la carta", accion: "catalogo.modificar" },
        ],
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
        // Lo que pide su servidor (T-13): recibir mercancía, no ajustar existencias.
        accion: "inventario.entrada" as Action,
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
    // Etapa 11 (M-29): de solo lectura, para administración y supervisión. Sale de los asientos y cuadra con los cierres.
    id: "reportes",
    nombre: "Reportes",
    icon: ChartColumn,
    accion: "reportes.verSucursal",
    resumen: "Lo que pasó en un periodo, sacado de los asientos: ventas, inventario y movimientos, cada uno con su PDF.",
    secciones: [
      {
        id: "ventas",
        nombre: "Ventas",
        href: rutaSeccion("reportes", "ventas"),
        proposito:
          "Lo vendido y lo cobrado de un día o de un rango: por medio de pago y moneda, por origen y por cajera y turno, con lo anulado aparte. Cuadra con los cierres Z.",
        tarea: "B11-1",
      },
      {
        id: "inventario",
        nombre: "Inventario al momento",
        href: rutaSeccion("reportes", "inventario"),
        proposito: "Existencia y valor al costo por categoría y producto, lo bajo mínimo, lo agotado y lo sin contar.",
        tarea: "B11-2",
      },
      {
        id: "movimientos",
        nombre: "Movimientos",
        href: rutaSeccion("reportes", "movimientos"),
        proposito: "El kárdex de un producto o una categoría: cada entrada, venta, salida y conteo con su saldo.",
        tarea: "B11-3",
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
        id: "cumpleanos",
        grupo: "Parque y restaurante",
        nombre: "Cumpleaños",
        href: rutaSeccion("ajustes", "cumpleanos"),
        proposito:
          "Los paquetes de cumpleaños (precio, invitados y lo que incluyen) y el anticipo que se cobra al reservar.",
        tarea: "B10-1",
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
        id: "descuentos",
        grupo: "Dinero",
        nombre: "Descuentos",
        href: rutaSeccion("ajustes", "descuentos"),
        proposito:
          "Los descuentos que la caja puede aplicar: por medio de pago, VIP y manuales, con su alcance y su vigencia, y el tope de supervisión.",
        tarea: "B3-6",
      },
      {
        id: "tasas",
        grupo: "Dinero",
        nombre: "Tasas de cambio",
        href: rutaSeccion("ajustes", "tasas"),
        acciones: ["tasa.confirmar", "catalogo.modificar"] as Action[],
        proposito:
          "La tasa del BCV se aplica sola; aquí se ve su historial, se confirma la que quedó retenida y se carga a mano si la fuente falla. Con los feriados bancarios de cada año.",
        tarea: "F3-04",
        pestanas: [
          { id: "tasas", nombre: "Tasas", accion: "tasa.confirmar" },
          { id: "feriados", nombre: "Feriados bancarios", accion: "catalogo.modificar" },
        ],
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
        id: "personas",
        grupo: "Equipo",
        nombre: "Personas y equipos",
        href: rutaSeccion("ajustes", "personas"),
        // Quien edita esto puede abrirle el back-office a un rol entero: es de
        // administración, y el dominio impide que se regale a sí mismo la llave.
        accion: "usuarios.gestionar",
        proposito:
          "Cada persona con su rol y los permisos que se le concedan uno a uno (DEC-15), qué alcanza cada rol en este local y los equipos autorizados, con quién tiene sesión en cada uno.",
        tarea: "T-18",
        pestanas: [
          { id: "usuarios", nombre: "Usuarios y permisos" },
          { id: "accesos", nombre: "Roles y accesos" },
          { id: "dispositivos", nombre: "Dispositivos" },
        ],
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
        href: rutaSeccion("ajustes", "impresoras"),
        proposito: "La impresora térmica del local (recibos, ticket del corte y comandas, en 58 u 80 mm) y el agente de la laptop de caja que imprime en ella.",
        tarea: "B5-2",
      },
      {
        id: "sistema",
        grupo: "Sistema",
        nombre: "Sistema",
        href: rutaSeccion("ajustes", "sistema"),
        acciones: ["sistema.actualizar", "catalogo.modificar"] as Action[],
        proposito:
          "La versión en marcha y las nuevas (ahora o al cierre), los respaldos de cada noche con su ensayo de restauración, y la semilla para llevar la configuración de un local a otro.",
        tarea: "T-18",
        pestanas: [
          { id: "version", nombre: "Versión y actualizaciones", accion: "sistema.actualizar" },
          { id: "respaldos", nombre: "Respaldos", accion: "sistema.actualizar" },
          { id: "semilla", nombre: "Semilla del local", accion: "catalogo.modificar" },
        ],
      },
      {
        id: "soporte",
        grupo: "Sistema",
        nombre: "Soporte",
        href: rutaSeccion("ajustes", "soporte"),
        accion: "soporte.gestionar",
        proposito:
          "Los problemas que reportó el personal, con su captura y los últimos errores: se marcan vistos, en curso o resueltos en una versión, y quien reportó lo ve.",
        tarea: "T-11",
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
  "personas/usuarios": rutaPestana("ajustes", "personas", "usuarios"),
  "personas/dispositivos": rutaPestana("ajustes", "personas", "dispositivos"),
  "configuracion/accesos": rutaPestana("ajustes", "personas", "accesos"),
  "configuracion/sucursal": rutaSeccion("ajustes", "sucursal"),
  "configuracion/impuestos": rutaSeccion("ajustes", "impuestos"),
  "configuracion/feriados": rutaPestana("ajustes", "tasas", "feriados"),
  "configuracion/impresoras": rutaSeccion("ajustes", "impresoras"),
  "caja/medios": rutaSeccion("ajustes", "medios"),
  "caja/tasas": rutaSeccion("ajustes", "tasas"),
  "caja/ventas": "/turno",
  "caja/turnos": "/turno",
  "parque/tarifas": rutaSeccion("ajustes", "tarifas"),
  "restaurante/plano": rutaSeccion("ajustes", "plano"),
  "restaurante/carta": rutaPestana("inventario", "productos", "carta"),
  // T-18 (M-29): Ajustes de 18 secciones a 12. Lo que se juntó es una pestaña de su sección.
  "ajustes/usuarios": rutaPestana("ajustes", "personas", "usuarios"),
  "ajustes/accesos": rutaPestana("ajustes", "personas", "accesos"),
  "ajustes/dispositivos": rutaPestana("ajustes", "personas", "dispositivos"),
  "ajustes/feriados": rutaPestana("ajustes", "tasas", "feriados"),
  "ajustes/respaldos": rutaPestana("ajustes", "sistema", "respaldos"),
  "ajustes/semilla": rutaPestana("ajustes", "sistema", "semilla"),
  "ajustes/carta": rutaPestana("inventario", "productos", "carta"),
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

/** Una pestaña de una sección (T-18): la sección con `?pestana=…`. */
export function rutaPestana(moduloId: string, seccionId: string, pestanaId: string): Route {
  return `/panel/${moduloId}/${seccionId}?pestana=${pestanaId}` as Route;
}

/** La pestaña que se abre: la pedida si la sección la tiene; si no, la primera. */
export function pestanaPedida(moduloId: string, seccionId: string, pedida: string | string[] | undefined): string {
  const modulo = buscarModulo(moduloId);
  const pestanas = (modulo && buscarSeccion(modulo, seccionId)?.pestanas) ?? [];
  const id = Array.isArray(pedida) ? pedida[0] : pedida;
  return pestanas.find((p) => p.id === id)?.id ?? pestanas[0]?.id ?? "";
}
