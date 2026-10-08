/**
 * El manual dentro de la app — T-12 (M-27, P-4).
 *
 * Una entrada por pantalla: para qué sirve, cómo se usa en pocos pasos y los problemas que más se repiten con su
 * solución. La ayuda enseña la de la pantalla en la que se está; la búsqueda recorre todas; y un error conocido
 * (por las palabras de su mensaje) ofrece «Cómo se resuelve» en su propio aviso. Es el mismo texto que usará el
 * manual impreso por rol de B8-2: se escribe una vez.
 *
 * Datos puros, sin pantalla: cada texto dice lo que el sistema hace hoy. Si una pantalla cambia, cambia su entrada
 * (y, si su recorrido cambia, su versión en `recorridos.ts`).
 */
import type { Role } from "@l2/domain-identity";

export type Problema = Readonly<{
  /** Lo que se ve: el aviso o el síntoma, como lo diría quien atiende. */
  sintoma: string;
  /** Qué hacer, en pocas palabras y en orden. */
  solucion: string;
  /**
   * Palabras del mensaje del servidor que lo reconocen (en minúsculas, sin acentos). Si un aviso de error las
   * contiene, ofrece «Cómo se resuelve» y abre esta solución.
   */
  reconoce?: readonly string[];
}>;

export type EntradaDelManual = Readonly<{
  id: string;
  /** La ruta de la pantalla; vale también para sus subrutas (la más larga que coincida gana). */
  ruta: string;
  titulo: string;
  /** Quién la usa. Sin roles, la ve cualquiera. */
  roles?: readonly Role[];
  proposito: string;
  pasos: readonly string[];
  problemas: readonly Problema[];
  /** El recorrido guiado de esta pantalla, si tiene (`recorridos.ts`). */
  recorrido?: string;
}>;

const OPERACION_PARQUE: readonly Role[] = ["MONITOR_PARQUE", "CAJERO", "SUPERVISOR", "ADMIN"];
const CAJA: readonly Role[] = ["CAJERO", "SUPERVISOR", "ADMIN"];
const SALON: readonly Role[] = ["MESERO", "CAJERO", "SUPERVISOR", "ADMIN"];
const DIRECCION: readonly Role[] = ["SUPERVISOR", "ADMIN"];

/** Lo que vale en cualquier pantalla: entrar, salir, la conexión, el tema. */
const GENERALES: readonly Problema[] = [
  {
    sintoma: "«Equipo sin registrar» al entrar",
    solucion:
      "Escribe el nombre del equipo y pulsa «Pedir registro». Administración lo aprueba en Ajustes → Personas y equipos → Dispositivos (o desde el mismo equipo con «Soy de administración») comparando el código que se ve en pantalla.",
    reconoce: ["equipo sin registrar", "equipo no esta aprobado"],
  },
  {
    sintoma: "«Tu sesión terminó» o «Entra por el acceso»",
    solucion: "Vuelve a entrar con tu nombre y tu PIN. La sesión se cierra sola tras un rato sin uso, o si administración cambió tu rol.",
    reconoce: ["tu sesion termino", "entra por el acceso"],
  },
  {
    sintoma: "«Sin conexión con el servidor»",
    solucion:
      "Revisa el internet del local (el router principal y el de respaldo 4G). Lo que no se guardó se vuelve a intentar al pulsar otra vez: no se registra dos veces. Si se cayeron los dos, se trabaja en los formularios de papel (Caja → Papel).",
    reconoce: ["sin conexion con el servidor"],
  },
  {
    sintoma: "«Tu puesto no permite hacer esto»",
    solucion: "Tu rol no tiene ese permiso. Pídeselo a quien lo tenga, o que administración lo ajuste en Ajustes → Personas y equipos: en Roles y accesos, o en tu ficha de Usuarios y permisos.",
    reconoce: ["tu puesto no permite"],
  },
  {
    sintoma: "«Esto necesita la autorización de un supervisor»",
    solucion: "Pide a supervisión o a administración que ponga su PIN en el diálogo de autorización. Queda en la auditoría quién autorizó.",
    reconoce: ["autorizacion de un supervisor"],
  },
  {
    sintoma: "«Para esto hay que confirmar que eres tú»",
    solucion:
      "Lo de configuración (precios, personas, ajustes) pide confirmar tu identidad: tu contraseña y, si no es tu equipo de confianza, el código de tu app de autenticación, tu llave o un código de recuperación. Vale 15 minutos.",
    reconoce: ["confirmar que eres tu"],
  },
];

export const MANUAL: readonly EntradaDelManual[] = [
  {
    id: "acceso",
    ruta: "/acceso",
    titulo: "Entrar al sistema",
    proposito: "Cada persona entra con su nombre y su PIN en un equipo aprobado. El equipo es el primer factor: sin él, un PIN correcto no sirve.",
    pasos: [
      "Toca tu nombre en la lista.",
      "Escribe tu PIN de cuatro cifras y pulsa «Entrar».",
      "Si te equivocas varias veces, el acceso espera un rato antes de dejarte intentar otra vez.",
      "Para cambiar de persona en el mismo equipo, pulsa el botón de salir junto a tu nombre.",
    ],
    problemas: GENERALES,
  },
  {
    id: "entrada",
    ruta: "/entrada",
    titulo: "Entrada al parque",
    roles: OPERACION_PARQUE,
    proposito: "Registrar la llegada de los niños: su pulsera, su paquete de tiempo y quién los trae y a quién se llama.",
    pasos: [
      "Pasa la pulsera de cada niño por el lector, o usa la cámara. Cada pulsera crea una fila.",
      "Elige el paquete de tiempo de cada niño. El nombre es opcional y se puede poner después.",
      "Un niño que no tolera la pulsera entra con «Sin pulsera»: su nombre es obligatorio, porque es como se le reconoce.",
      "Escribe el teléfono del representante: si ya vino, aparece solo, con sus niños.",
      "Elige cómo paga: ahora (prepago, no se devuelve si sale antes) o todo al salir (cuenta abierta, por lo que usó), y registra.",
    ],
    problemas: [
      {
        sintoma: "«La pulsera ya se usó en otra visita»",
        solucion: "Las pulseras son de un solo uso. Pon una nueva del lote y pásala otra vez.",
        reconoce: ["ya se uso en otra visita", "pulsera usada", "pulsera repetida"],
      },
      {
        sintoma: "«La pulsera ya está activa en sala»",
        solucion: "Ese niño ya está dentro. Búscalo en la sala; si se fue sin registrar su salida, regístrala en Salida.",
        reconoce: ["ya esta activa en sala"],
      },
      {
        sintoma: "«No es de la serie del local» o «son de los niños que entran sin pulsera»",
        solucion: "Usa una pulsera del lote del local. La serie (prefijo y largo) está en Ajustes → Sucursal. Los códigos SP- los pone el sistema a los niños sin pulsera.",
        reconoce: ["no es de la serie del local", "son de los ninos que entran sin pulsera"],
      },
      {
        sintoma: "«Un niño sin pulsera se reconoce por su nombre»",
        solucion: "Escribe el nombre del niño en su fila antes de registrar.",
        reconoce: ["se reconoce por su nombre"],
      },
      {
        sintoma: "«Aforo completo»",
        solucion: "Espera a que salga alguien. Un niño olvidado de un día anterior no cuenta: lo cierra supervisión desde Inicio. El aforo se cambia en Ajustes → Tarifas y paquetes.",
        reconoce: ["aforo completo", "no caben"],
      },
      {
        sintoma: "«Ese paquete ya no está a la venta» o no hay paquetes",
        solucion: "Administración publica las tarifas en Ajustes → Tarifas y paquetes. Vuelve a elegir el paquete.",
        reconoce: ["ya no esta a la venta", "no hay tarifario"],
      },
    ],
    recorrido: "entrada",
  },
  {
    id: "sala",
    ruta: "/monitor",
    titulo: "Sala del parque",
    roles: OPERACION_PARQUE,
    proposito: "Ver a cada niño con el tiempo que le queda, y atenderlo desde su ficha.",
    pasos: [
      "Cada tarjeta dice el tiempo: verde en tiempo, amarillo por vencer o en gracia, rojo con el tiempo cumplido (con lo que va de más).",
      "Toca un niño, o pasa su pulsera por el lector, para abrir su ficha.",
      "En la ficha: recargar tiempo, pausa por comida (una por visita, hasta 10 minutos), poner su nombre o vincularlo a una mesa.",
      "«Registrar su salida» lleva a la salida con ese niño.",
    ],
    problemas: [
      {
        sintoma: "«Ya usó su pausa»",
        solucion: "Hay una pausa por comida por visita. Si vuelve a salir, su tiempo corre.",
        reconoce: ["ya uso su pausa"],
      },
      {
        sintoma: "«Esa estancia está a revisar»",
        solucion: "Lleva demasiadas horas o es de un día anterior: casi seguro el niño ya no está. La cierra supervisión desde Inicio, sin cobrar tiempo de más.",
        reconoce: ["esta a revisar"],
      },
      {
        sintoma: "«El tiempo abierto no se recarga»",
        solucion: "El pase libre o la cuenta por tiempo abierto se cobra entero al salir: no hay minutos que sumar.",
        reconoce: ["el tiempo abierto no se recarga"],
      },
    ],
    recorrido: "sala",
  },
  {
    id: "salida",
    ruta: "/salida",
    titulo: "Salida del parque",
    roles: OPERACION_PARQUE,
    proposito: "Cerrar la visita de los niños: lo que usaron, el tiempo de más y dónde se paga.",
    pasos: [
      "Pasa la pulsera de quien se va (o elige en «Sin pulsera» a un niño que entró sin ella). Si se va la familia entera, pasa todas seguidas.",
      "Revisa el desglose: en cuenta abierta, si salió antes, se cobra el paquete más barato que cubre lo que estuvo.",
      "Marca quién lo recoge: su representante u otra persona, con su nombre.",
      "Elige dónde se paga: en caja o cargado a una mesa (la cuenta de su familia en esa mesa), y registra.",
    ],
    problemas: [
      {
        sintoma: "«Cada familia sale por separado»",
        solucion: "Registra primero la salida de una familia y luego la de la otra.",
        reconoce: ["cada familia sale por separado"],
      },
      {
        sintoma: "«La mesa tiene varias cuentas: elige a cuál va»",
        solucion: "La mesa es compartida: elige en la lista la familia de esos niños.",
        reconoce: ["elige a cual va"],
      },
      {
        sintoma: "«Se dio por incobrable»",
        solucion: "La cuenta de esa familia la cerró supervisión como incobrable: la salida la resuelve supervisión.",
        reconoce: ["incobrable"],
      },
    ],
    recorrido: "salida",
  },
  {
    id: "caja",
    ruta: "/caja",
    titulo: "Cobrar",
    roles: CAJA,
    proposito: "Cobrar lo que se debe: la cola de cuentas por cobrar (parque, mesas, de pie, mostrador) y las ventas directas.",
    pasos: [
      "La cola «Por cobrar» va de la más antigua a la más nueva. Elige una cuenta, o pasa la pulsera de un niño para traer la de su familia.",
      "En una venta de mostrador, añade los productos de la carta (o pasa su código de barras).",
      "Elige el medio de pago y escribe el monto; se puede pagar con varios medios (mixto). El vuelto se calcula solo.",
      "Cobra (Ctrl+Intro con el teclado). El recibo sale en la impresora de caja si «Recibo» está encendido; si no, se imprime después desde el turno.",
    ],
    problemas: [
      {
        sintoma: "«No hay turno abierto» o la caja no cobra",
        solucion: "Abre el turno en Caja → Turno, con el fondo de la gaveta. Todo lo cobrado queda en ese turno.",
        reconoce: ["no hay turno abierto", "la caja no cobra"],
      },
      {
        sintoma: "«Sin tasa» o no se puede cobrar en bolívares",
        solucion: "Falta la tasa del BCV de hoy. Llega sola; si la API falla, administración la carga a mano en Ajustes → Tasas de cambio. En dólares se cobra siempre.",
        reconoce: ["sin tasa", "tasa vigente"],
      },
      {
        sintoma: "«N sin imprimir» o el recibo no sale",
        solucion: "Revisa que la impresora tenga papel y esté encendida, y que el agente de impresión de la laptop de caja esté en marcha. Luego «Reintentar» en el aviso.",
        reconoce: ["sin imprimir", "la impresora no responde", "no salio", "no imprime", "recibo"],
      },
      {
        sintoma: "«La cuenta cambió» al cobrar",
        solucion: "Otro equipo la cambió mientras tanto (un pedido, una salida). Vuelve a elegirla: ya se ve como quedó.",
        reconoce: ["la cuenta cambio", "otro equipo"],
      },
    ],
    recorrido: "caja",
  },
  {
    id: "turno",
    ruta: "/turno",
    titulo: "Turno de caja",
    roles: CAJA,
    proposito: "Abrir y cerrar el turno de la caja: el fondo, los cortes y el arqueo.",
    pasos: [
      "Abre el turno contando el fondo de la gaveta, en dólares y en bolívares.",
      "El corte X enseña lo cobrado sin cerrar nada.",
      "Para cerrar: cuenta lo que hay (arqueo a ciegas) y sella el corte Z. Hasta $ 1,00 de diferencia lo firma la cajera; más, supervisión.",
      "En un relevo, la que sale retira lo vendido y deja el fondo; la que entra lo declara al abrir.",
    ],
    problemas: [
      {
        sintoma: "La jornada no se cierra",
        solucion: "No se cierra con pendientes: cuentas por cobrar o abiertas (incluidas mesas y cuentas de pie), niños en sala, estancias a revisar u otros turnos abiertos. Inicio los enumera.",
        reconoce: ["no se cierra", "pendientes"],
      },
      {
        sintoma: "Hay cargas de papel sin revisar",
        solucion: "Supervisión revisa la carga en Caja → Papel con su PIN (quien la cargó no la revisa). Después se sella el Z.",
        reconoce: ["sin revisar"],
      },
    ],
  },
  {
    id: "mesas",
    ruta: "/mesas",
    titulo: "Mesas",
    roles: SALON,
    proposito: "Atender el salón: sentar a las familias, tomar sus pedidos (la comanda sale en papel) y mandar la cuenta a caja.",
    pasos: [
      "Toca una mesa libre y «Sentar»: el nombre es opcional y se dice cuántas personas son.",
      "Si otra familia comparte la mesa, «Otra familia»: cada una tiene su cuenta, su pedido y su cobro.",
      "Quien pide sin mesa: «De pie», con un nombre o una seña.",
      "«Tomar pedido», elige de la carta y «Revisar y enviar a cocina»: la comanda sale en la impresora.",
      "Cuando el plato llega a la mesa, toca «Servido» en su pedido: ahí termina su espera. En «Atender» salen las mesas que esperan su pedido o no han pedido.",
      "«Pide la cuenta» la manda a caja. Si no consumieron nada, «Liberar».",
    ],
    problemas: [
      {
        sintoma: "«La mesa cambió: otro equipo le abrió una cuenta»",
        solucion: "Otra tablet sentó a alguien ahí mientras tanto. Mira la mesa: si es otra familia, usa «Otra familia».",
        reconoce: ["otro equipo le abrio una cuenta"],
      },
      {
        sintoma: "«No hay impresora de comandas»",
        solucion: "El pedido no se envía sin papel para la cocina. Administración la configura en Ajustes → Impresoras (marca «comandas»).",
        reconoce: ["no hay impresora de comandas"],
      },
      {
        sintoma: "«La comanda no salió»",
        solucion: "Revisa la impresora (papel, encendida) y el agente de la laptop de caja, y pulsa «Volver a imprimir» en el pedido. Si no, avisa a la cocina de palabra.",
        reconoce: ["la comanda no salio", "comandas no salieron"],
      },
      {
        sintoma: "«El precio cambió»",
        solucion: "Administración cambió el precio mientras tomabas el pedido. Revísalo con la mesa y vuelve a enviarlo.",
        reconoce: ["el precio de"],
      },
      {
        sintoma: "«Ya hay una cuenta con ese nombre»",
        solucion: "Usa otro nombre o una seña para no confundirlas («Pérez 2», «camisa azul»).",
        reconoce: ["usa otro nombre"],
      },
    ],
    recorrido: "mesas",
  },
  {
    id: "inicio",
    ruta: "/panel",
    titulo: "Inicio",
    roles: DIRECCION,
    proposito: "El día del local de un vistazo: lo vendido, la sala, las mesas, la caja, lo que pide atención y la Puesta a punto.",
    pasos: [
      "Arriba, los avisos que piden acción (tasa, impresión, respaldos, estancias a revisar).",
      "Las cifras del día y quién está en cada puesto, en vivo.",
      "La Puesta a punto dice qué falta configurar; se tacha sola.",
    ],
    problemas: GENERALES,
  },
  {
    id: "inventario",
    ruta: "/panel/inventario",
    titulo: "Inventario",
    roles: DIRECCION,
    proposito: "Los productos con su existencia, las entradas de mercancía, las salidas y el conteo.",
    pasos: [
      "Productos: la existencia de cada uno, su mínimo y su costo promedio. «Alta en lote» carga el catálogo en una hoja, sin cantidades.",
      "Productos → En la carta: qué platos ofrece el mesero y su precio con su día (un solo sitio para el precio).",
      "Entradas de mercancía: una tabla; se puede pegar desde Excel. «Inventario inicial» trae los que faltan por contar (0 si no hay).",
      "Salidas y conteo: merma, consumo interno, regalo o devolución, con motivo; el conteo deja la existencia igual a lo contado.",
    ],
    problemas: [
      {
        sintoma: "Un producto sale «Agotado» en la caja",
        solucion: "Sin existencia no se vende. Carga su entrada de mercancía.",
        reconoce: ["agotado", "no queda"],
      },
      {
        sintoma: "Un producto sale «Sin contar» o «Sin inventario inicial»",
        solucion:
          "Se dio de alta sin cantidades y todavía no se contó: no se vende hasta entonces. Cuéntalo en Entradas → Inventario inicial (escribe 0 si no hay ninguno) o en un conteo.",
        reconoce: ["sin inventario inicial", "sin contar", "inventario inicial"],
      },
    ],
  },
  {
    id: "ajustes",
    ruta: "/panel/ajustes",
    titulo: "Ajustes",
    roles: ["ADMIN"],
    proposito:
      "La configuración del local en 12 secciones: tarifas, cumpleaños, plano, medios, descuentos, tasas (con los feriados), impuestos, personas y equipos, sucursal, impresoras, sistema (versión, respaldos y semilla) y soporte. La carta está en Inventario → Productos.",
    pasos: [
      "Cada sección tiene arriba sus cifras, y el alta y la edición se hacen en una hoja lateral.",
      "Las que reúnen varias cosas las ponen en pestañas: Personas y equipos (usuarios, roles y dispositivos), Tasas (y feriados) y Sistema (versión, respaldos y semilla).",
      "Lo que cambia precios o personas pide confirmar tu identidad (vale 15 minutos).",
      "Nada se borra: un precio nuevo rige desde su día; lo que ya no se usa se retira.",
    ],
    problemas: GENERALES,
  },
  {
    id: "reportes",
    ruta: "/panel/reportes",
    titulo: "Reportes",
    roles: DIRECCION,
    proposito: "Lo que pasó en un periodo, de solo lectura y sacado de los asientos: las ventas de un día o de un rango, con su PDF.",
    pasos: [
      "Elige el periodo (hoy, ayer, esta semana, este mes o el anterior) o un rango de hasta 93 días y, si quieres, una cajera.",
      "Arriba, lo vendido, lo cobrado en dólares con la tasa de cada cobro, lo anulado y los cierres Z; debajo, una pestaña por sección.",
      "«PDF» abre la hoja para imprimir: en el diálogo del navegador, elige la impresora o «Guardar como PDF».",
    ],
    problemas: [
      {
        sintoma: "Un turno sale «No cuadra con su Z»",
        solucion:
          "Lo que hoy dicen los asientos de ese turno no es lo que dejó escrito su cierre Z; debajo dice qué no cuadra. Repórtalo desde la ayuda con el día y el punto.",
        reconoce: ["no cuadra"],
      },
      {
        sintoma: "«Hasta 93 días: parte el periodo»",
        solucion: "Un informe cabe en un trimestre. Pide el periodo en dos o más partes.",
        reconoce: ["93 dias", "parte el periodo"],
      },
    ],
  },
  {
    id: "atencion",
    ruta: "/panel/restaurante/atencion",
    titulo: "Atención en el salón",
    roles: ["ADMIN", "SUPERVISOR"],
    proposito: "Cuánto lleva cada mesa sentada, sin pedir y esperando lo que pidió, para llamar a quien atiende; y la espera media y máxima del día.",
    pasos: [
      "Arriba, cuántas mesas piden atención y la espera media y máxima de hoy.",
      "Cada cuenta del salón, la que más pide atención primero: «Esperando su pedido» o «Sin atender».",
      "La espera de un pedido termina cuando el mesero toca «Servido»; uno sin marcar sigue contando.",
      "Los minutos a partir de los cuales se avisa se cambian en Ajustes → Sucursal.",
    ],
    problemas: [
      {
        sintoma: "Una mesa sale «Esperando su pedido» y ya comieron",
        solucion: "Nadie marcó «Servido» en su pedido. Pídele al mesero que lo marque desde la mesa: deja de contar.",
      },
    ],
  },
  {
    id: "soporte",
    ruta: "/panel/ajustes/soporte",
    titulo: "Soporte",
    roles: ["ADMIN"],
    proposito:
      "Los problemas que reportó el personal desde la ayuda de su pantalla o desde un aviso de error, con lo que contó, la pantalla, la versión, el equipo, los últimos errores y la captura.",
    pasos: [
      "Arriba, cuántos hay nuevos, en curso y resueltos; tocar una cifra filtra la lista.",
      "Toca un reporte para leerlo entero y ver su captura.",
      "Márcalo «Visto», «En curso» o «Resuelto» con la versión que lo arregla: quien lo reportó lo ve en su ayuda.",
      "Los reportes del mismo error dicen cuántos son: lo que más se repite es lo que más urge.",
    ],
    problemas: [
      {
        sintoma: "«El aviso no salió» en un reporte",
        solucion:
          "El servidor no pudo mandar el correo al desarrollo. El reporte está guardado igual; revisa el correo del servidor en su configuración (lo hace quien administra el servidor). Se reintenta solo varias veces.",
        reconoce: ["aviso no salio"],
      },
    ],
  },
];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** La entrada del manual de una ruta: la de ruta más larga que la contenga. */
export function entradaDe(ruta: string): EntradaDelManual | null {
  let mejor: EntradaDelManual | null = null;
  for (const e of MANUAL) {
    const coincide = ruta === e.ruta || ruta.startsWith(`${e.ruta}/`);
    if (coincide && (!mejor || e.ruta.length > mejor.ruta.length)) mejor = e;
  }
  return mejor;
}

export type Resultado = Readonly<{ entrada: EntradaDelManual; problema: Problema | null }>;

/**
 * Busca en todo el manual (títulos, pasos y problemas). No exige todas las palabras: cuenta cuántas aparecen (una
 * palabra vale también por su raíz: «usada» encuentra «usó» y «uso»), y ordena de más a menos. Así una pregunta
 * dicha a la manera de quien atiende encuentra la respuesta escrita de otra manera.
 */
export function buscar(texto: string): Resultado[] {
  const palabras = sinAcentos(texto.trim())
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3);
  if (palabras.length === 0) return [];
  const puntos = (t: string) => {
    const s = sinAcentos(t);
    const enTexto = s.split(/[^a-z0-9ñ]+/);
    return palabras.reduce((n, w) => {
      if (s.includes(w)) return n + 2;
      const raiz = w.slice(0, Math.max(3, w.length - 2));
      return enTexto.some((x) => x.startsWith(raiz)) ? n + 1 : n;
    }, 0);
  };
  const r: (Resultado & { puntos: number })[] = [];
  for (const e of MANUAL) {
    const pe = puntos(`${e.titulo} ${e.proposito} ${e.pasos.join(" ")}`);
    if (pe > 0) r.push({ entrada: e, problema: null, puntos: pe });
    for (const p of e.problemas) {
      const pp = puntos(`${p.sintoma} ${p.solucion} ${(p.reconoce ?? []).join(" ")}`);
      // Un problema se prefiere a una pantalla con la misma puntuación: es la respuesta concreta.
      if (pp > 0) r.push({ entrada: e, problema: p, puntos: pp + 0.5 });
    }
  }
  // Un mismo problema general aparece en varias pantallas: se queda una vez.
  const vistos = new Set<string>();
  return r
    .sort((a, b) => b.puntos - a.puntos)
    .filter((x) => {
      const clave = x.problema ? x.problema.sintoma : `pantalla:${x.entrada.id}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, 12)
    .map(({ entrada, problema }) => ({ entrada, problema }));
}

/**
 * El problema conocido que reconoce el texto de un aviso de error, con la pantalla donde está. Primero se mira la
 * pantalla en la que se está (el mismo aviso puede querer decir algo distinto en otra), después el resto.
 */
/**
 * El código estable de un problema conocido (T-11): su pantalla y la primera palabra que lo reconoce («caja-sin-tasa»).
 * Agrupa los reportes del mismo error aunque cambie el orden del manual.
 */
export function codigoDelProblema(r: Resultado): string | null {
  const clave = r.problema?.reconoce?.[0];
  if (!clave) return null;
  const codigo = `${r.entrada.id}-${sinAcentos(clave)}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return /^[a-z0-9][a-z0-9-]{1,59}$/.test(codigo) ? codigo : null;
}

export function problemaDe(texto: string, ruta?: string): Resultado | null {
  const t = sinAcentos(texto);
  const aqui = ruta ? entradaDe(ruta) : null;
  for (const e of aqui ? [aqui, ...MANUAL.filter((x) => x !== aqui)] : MANUAL) {
    for (const p of e.problemas) if ((p.reconoce ?? []).some((r) => t.includes(r))) return { entrada: e, problema: p };
  }
  return null;
}
