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
      "La cuenta de soporte no está en la lista: entra por «Acceso de soporte», con su usuario y después su PIN.",
    ],
    problemas: GENERALES,
  },
  {
    id: "entrada",
    // B4-12: la entrada vive en «Parque», en una capa: esta entrada del manual se encuentra buscando.
    ruta: "/monitor#entrada",
    titulo: "Parque · la entrada",
    roles: OPERACION_PARQUE,
    proposito: "Registrar la llegada de los niños: su pulsera, su paquete de tiempo y quién los trae y a quién se llama.",
    pasos: [
      "En «Parque», pasa la pulsera nueva por el lector (o la cámara): se abre la entrada con ella. Cada pulsera que pases después suma un niño.",
      "Cada niño en su renglón: el nombre (opcional, se puede poner después), el paquete y «Compra medias», apagado de entrada: enciéndelo para quien no trae sus medias de seguridad (el par va a su cuenta). Al registrar, una sola pregunta confirma que los demás las traen. Si no quedan medias en el inventario, entran sin cobrárselas.",
      "Un niño que no tolera la pulsera entra con «Sin pulsera»: su nombre es obligatorio, porque es como se le reconoce.",
      "Escribe la cédula del representante (lo primero; el foco va a ella tras la primera pulsera): si ya vino, aparece solo, con sus niños, y no hay que escribir nada más. Si es nuevo, su teléfono y su nombre. La letra (V, E, J, G, P) se elige al lado; los puntos los pone el campo. El teléfono se entiende escrito como sea, también con +58.",
      "Un representante de antes, sin cédula, aparece por su teléfono y dice «escribe su cédula»: se le anota al registrar.",
      "Si su familia ya tiene niños en la sala, sale marcado «Sumar a la familia …»: el que llega entra en esa cuenta, con su tiempo desde que entra, y sale con ella. Desmárcalo si va aparte.",
      "Elige cómo paga: ahora (prepago, no se devuelve si sale antes) o todo al salir (cuenta abierta, por lo que usó), y registra.",
      "«Tiempo abierto» (al final de los paquetes): entra sin límite y al salir se cobra lo que vale su tiempo con la tarifa, la combinación más barata de paquetes (1 h 20 = 1 hora + 30 minutos). Va siempre en cuenta abierta.",
    ],
    problemas: [
      {
        sintoma: "«La pulsera ya se usó en otra visita»",
        solucion: "Las pulseras son de un solo uso. Pon una nueva del lote y pásala otra vez.",
        reconoce: ["ya se uso en otra visita", "pulsera usada", "pulsera repetida"],
      },
      {
        sintoma: "«La pulsera ya está activa en sala»",
        solucion: "Ese niño ya está dentro. Cierra la entrada y pasa su pulsera: se abre su ficha; si se fue sin registrar su salida, «Dar salida».",
        reconoce: ["ya esta activa en sala"],
      },
      {
        sintoma: "«No es de la serie del local» o «son de los niños que entran sin pulsera»",
        solucion: "Usa una pulsera del lote del local. La serie (prefijo y largo) está en Ajustes → Sucursal. Los códigos SP- los pone el sistema a los niños sin pulsera.",
        reconoce: ["no es de la serie del local", "son de los ninos que entran sin pulsera"],
      },
      {
        sintoma: "«Esa no es la cédula de …» o «Esa cédula ya es de …»",
        solucion: "La familia encontrada ya tiene otra cédula, o esa cédula es de otra persona del directorio. Revisa la cédula con el representante; si el teléfono es de otra persona, escribe el suyo.",
        reconoce: ["esa no es la cedula de", "esa cedula ya es de", "ese telefono es de"],
      },
      {
        sintoma: "«Falta la cédula del representante»",
        solucion: "Toda entrada lleva la cédula de quien trae a los niños: con ella se le reconoce la próxima vez. Lo cargado desde el formulario de papel no la exige.",
        reconoce: ["falta la cedula", "escribe la cedula del representante"],
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
    recorrido: "parque",
  },
  {
    id: "sala",
    ruta: "/monitor",
    titulo: "Parque",
    roles: OPERACION_PARQUE,
    proposito: "La sala, la entrada y la salida en una pantalla, con un solo lector: ver a cada niño con el tiempo que le queda y atenderlo.",
    pasos: [
      "Un solo lector: pasa cualquier pulsera. Una nueva abre la entrada con ella; la de un niño en la sala abre su ficha. Si el lector no responde, la cámara o «Escribir».",
      "Cada tarjeta dice el tiempo: verde en tiempo, un tinte amarillo por vencer, amarillo sólido en gracia (con lo que le queda de gracia: todavía no se cobra de más) y rojo con el tiempo cumplido (con lo que va de más).",
      "Avisos: cuando un niño entra en «por vencer» y cuando se cumple su tiempo, suena (y en Android vibra) un aviso arriba, aquí y en la caja; tócalo y abre su ficha. La campana tachada lo calla 15 minutos en este equipo; el altavoz de la barra quita o pone el sonido del equipo.",
      "Con el equipo bloqueado, la pantalla del PIN sigue avisando, solo con la pulsera y los minutos (sin nombres): tócalo, pon tu PIN y abre la ficha de ese niño.",
      "Los avisos funcionan con la aplicación abierta: no son notificaciones del teléfono. Si el equipo se apaga o se cierra el navegador, no avisa.",
      "En la ficha: «Más tiempo» (sube a un paquete mayor y paga solo la diferencia: de 30 minutos a 1 hora, lo que falta), pausa por comida (una por visita, hasta 10 minutos), poner su nombre o vincularlo a una mesa. Si ya está en una, «Desvincular de la mesa»: vuelve a su familia o pasa a otra mesa, con lo que se debe de él.",
      "El tiempo de más, pasada la gracia, va en bloques del paquete más chico (30 minutos al precio de 30 minutos), y nunca cuesta más que la combinación de paquetes que cubre lo que estuvo.",
      "«Dar salida» abre su salida aquí mismo; «Toda la familia» trae a todos los niños de su cuenta, marcados: quita de la lista a quien se queda.",
      "«Sin pulsera» abre la entrada de un niño que no la tolera. «Buscar»: por el nombre, la cédula o el teléfono del representante, dice qué niños suyos están en la sala, con su pulsera.",
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
        solucion: "El pase libre y el tiempo abierto no tienen límite: no hay minutos que sumar. El tiempo abierto se cobra al salir, por lo que estuvo.",
        reconoce: ["el tiempo abierto no se recarga"],
      },
      {
        sintoma: "«Sin conexión con el servidor desde las…» en la sala",
        solucion:
          "Los relojes siguen contando y cada niño cambia de color a su hora, pero una entrada o una salida hecha en otro equipo no se ve hasta que vuelva la conexión. La sala se pone al día sola al volver; si se cayó todo, se trabaja en papel.",
        reconoce: ["sin conexion con el servidor desde"],
      },
    ],
    recorrido: "parque",
  },
  {
    id: "salida",
    // B4-12: la salida vive en «Parque», en una capa: esta entrada del manual se encuentra buscando.
    ruta: "/monitor#salida",
    titulo: "Parque · la salida",
    roles: OPERACION_PARQUE,
    proposito: "Cerrar la visita de los niños: lo que usaron, el tiempo de más y dónde se paga.",
    pasos: [
      "En «Parque», pasa la pulsera de quien se va y, en su ficha, «Dar salida»; si se va la familia entera, «Toda la familia» (quita a quien se queda). Dentro de la salida, cada pulsera que pases se suma; un niño que entró sin pulsera se elige en «Sin pulsera».",
      "Revisa el desglose: en cuenta abierta, si salió antes, se cobra la combinación más barata de paquetes que cubre lo que estuvo; el tiempo abierto, lo que vale su tiempo; y el tiempo de más, en bloques del paquete más chico, con tope.",
      "«Lo recoge» viene marcado «su representante»; si es otra persona, tócala y escribe su nombre.",
      "Elige dónde se paga: en caja o cargado a una mesa (la cuenta de su familia en esa mesa), y registra. Una pulsera vinculada a una mesa sale a su mesa sin elegir: lo que debe y su tiempo de más van a esa cuenta.",
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
    recorrido: "parque",
  },
  {
    id: "caja",
    ruta: "/caja",
    titulo: "Cobrar",
    roles: CAJA,
    proposito: "Cobrar lo que se debe: la cola de cuentas por cobrar (parque, mesas, de pie, mostrador) y las ventas directas.",
    pasos: [
      "La cola «Por cobrar» va de la más antigua a la más nueva. Elige una cuenta, o pasa la pulsera de un niño para traer la de su familia.",
      "Una familia que llega directo a la caja: «Entrada» (tecla A), o pasa una pulsera que no está en la sala. En el panel, cada pulsera suma un niño (si no se lee, «Escribir» su número; «Sin pulsera» con su nombre), el paquete y la cédula del representante; «Registrar y cobrar» deja su cuenta lista. Se paga ahora: la cuenta abierta y los invitados de un cumpleaños, en Entrada.",
      "Si dejas una venta del mostrador sin cobrar (eliges otra cuenta, empiezas otra venta o la entrada), la caja pregunta: cobrarla ahora, dejarla pendiente a nombre del cliente (cédula, teléfono y nombre) o descartarla. En la cola, una venta pendiente sin datos dice «Sin datos». La búsqueda de la cola encuentra también por cédula y teléfono.",
      "En una venta de mostrador, añade los productos de la carta (o pasa su código de barras). Para no buscarlos a ojo, escribe en «Buscar producto o código» (tecla /): busca en toda la carta por nombre, SKU o código, e Intro añade el primero. Lo que no se vende ahora (sin contar o agotado) va al final, atenuado.",
      "Elige el medio de pago y escribe el monto; se puede pagar con varios medios (mixto). El vuelto se calcula solo.",
      "Debajo de la cuenta, tres botones que dicen cómo está: «Factura a» (tecla I), «Descuento» y «Dividir» en partes iguales, de 2 a 6. La cuenta que nació con su cliente (una mesa, de pie) ya viene a su nombre. Una venta del mostrador se cobra a alguien: si no tiene cliente, «Factura a» dice «Falta el cliente» y pide su cédula (o el RIF de su empresa) y su nombre.",
      "«Buscar cliente» (tecla C, o el icono de la persona en la cola): por su nombre, su cédula o su teléfono, dice lo que tiene abierto (y lo abre para cobrar), sus niños en la sala y lo que debe. Está también en Mesas y en la sala.",
      "«Cobrar $ …» dice lo que se cobra, el de la parte si está dividida (Ctrl+Intro con el teclado). El recibo sale en la impresora de caja si «Recibo» está encendido; si no, se imprime después desde el turno.",
      "El recibo dice lo que pasó: cada pago en su moneda (el de bolívares, con lo que vale en dólares a la tasa del cobro), lo pagado y el vuelto, también en bolívares. Lo pagado menos el vuelto es el total.",
      "Si el cliente de una mesa o de una venta se fue sin pagar: «Se fue sin pagar» en la cuenta, con el PIN de supervisión. Lo que debe queda a su nombre (Caja → Deudas). Cuando vuelva, al buscarlo en la cola sale «Debe de antes»: tócalo y se cobra como cualquier cuenta.",
      "Una cuenta del salón dice, debajo de su nombre, su mesa (o «De pie»), hace cuánto pidió la cuenta, lo que sigue sin servir y sus niños, con su tiempo si siguen en la sala. Si al cobrarla hay niños suyos en la sala, la caja avisa «Dales salida antes»: pasa su pulsera o dales salida, y su tiempo se suma a la cuenta. «Cobrar igual» sigue sin esperar.",
      "Cobrada la última cuenta de una mesa, la mesa queda por limpiar. La limpia el mesero; si se olvida, la cola dice «Por limpiar» con sus números: un toque la deja limpia y libre.",
      "Una cuenta del salón que pidió y sigue sin cobrar pasados unos minutos (10, de fábrica) sale en un aviso suave, sin sonido, una vez. Los minutos, en Ajustes → Sucursal.",
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
        sintoma: "«Cobro en curso por …»",
        solucion:
          "Otra persona (u otra caja) empezó a cobrar esa cuenta y no terminó: lo que llevaba se guardó solo. «Retomar» sigue con sus pagos y su tasa; «Descartar» los quita (queda dicho quién). Lo que tú llevas escrito también se guarda solo: si cambias de cuenta, recargas o se va la luz, al volver sigue ahí.",
        reconoce: ["cobro en curso"],
      },
      {
        sintoma: "«N sin imprimir» o el recibo no sale",
        solucion: "Revisa que la impresora tenga papel y esté encendida, y que el agente de impresión de la laptop de caja esté en marcha. Luego «Reintentar» en el aviso.",
        reconoce: ["sin imprimir", "la impresora no responde", "no salio", "no imprime", "recibo"],
      },
      {
        sintoma: "Una pulsera abre «Entrada al parque» en vez de una cuenta",
        solucion:
          "Esa pulsera no está en la sala: es un niño que llega. Regístralo ahí mismo, o cierra el panel si buscabas otra cuenta (búscala por la familia o el número de orden).",
      },
      {
        sintoma: "«Aforo completo» o «La pulsera ya se usó en otra visita» en la entrada desde la caja",
        solucion: "Lo mismo que en Entrada: espera a que salga alguien, o pon una pulsera nueva del lote. El niño no queda registrado hasta que el panel lo acepta.",
        reconoce: ["aforo completo", "ya se uso en otra visita"],
      },
      {
        sintoma: "Un producto sale atenuado al final de la carta, en «No se venden ahora»",
        solucion:
          "«Sin contar»: todavía no tiene su inventario inicial (Inventario → Entradas → Inventario inicial). «Agotado»: no queda; se vende de nuevo al cargar la entrada de mercancía.",
        reconoce: ["no se venden ahora", "todavia no tiene inventario inicial", "se agoto"],
      },
      {
        sintoma: "«Dividir» o «Descuento» no se dejan tocar",
        solucion:
          "Con pagos puestos no se divide ni se descuenta: quítalos primero. Una cuenta dividida no lleva descuento, ni una con descuento se divide. Cobrada ya una parte, el reparto se queda como está.",
        reconoce: ["quita primero los pagos", "une la cuenta", "quita el descuento para dividir", "ya se cobro una parte"],
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
    id: "deudas",
    ruta: "/deudas",
    titulo: "Deudas de clientes",
    roles: CAJA,
    proposito: "Lo que dejaron sin pagar quienes se fueron: a nombre de su cliente, con lo que deben, quién los atendió y quién lo autorizó.",
    pasos: [
      "Una deuda nace con «Se fue sin pagar» en la caja, en Mesas («Cerrar la mesa sin cobrar…», de supervisión) o al cerrar el turno, con el PIN de supervisión. La cuenta sale de la cola y del cierre y la mesa queda libre.",
      "Cuando el cliente vuelve: «Cobrar» pasa a la caja una cuenta con lo que consumió, a su nombre, y se cobra con la tasa de hoy. Cobrada entera, la deuda queda cobrada.",
      "Si vino pero no pagó: «Devolver a deudas» saca su cuenta de la caja y la deuda sigue pendiente.",
      "«Dar por perdida» es de administración, con su PIN y un motivo. Nada se borra: queda en «Perdidas».",
      "Busca por nombre, cédula, teléfono o número de orden. Las cobradas y las perdidas de los últimos 90 días están en sus pestañas.",
    ],
    problemas: [
      {
        sintoma: "«La deuda es a nombre de alguien»",
        solucion: "La cuenta no tenía cliente (una venta del mostrador sin datos): escribe su cédula, su teléfono y su nombre en el mismo diálogo.",
        reconoce: ["la deuda es a nombre de alguien"],
      },
      {
        sintoma: "«Esa deuda tiene un cobro abierto en la caja»",
        solucion: "Antes de darla por perdida, cobra esa cuenta o «Devolver a deudas».",
        reconoce: ["tiene un cobro abierto en la caja"],
      },
      {
        sintoma: "«No queda en deuda aquí» en una cuenta del parque",
        solucion: "La cuenta de una familia del parque o de un cumpleaños se marca incobrable desde el cierre del turno.",
        reconoce: ["no queda en deuda aqui"],
      },
    ],
  },
  {
    id: "turno",
    ruta: "/turno",
    titulo: "Turno de caja",
    roles: CAJA,
    proposito: "Abrir y cerrar el turno de la caja: el fondo, los cortes y el arqueo.",
    pasos: [
      "Abre el turno contando el fondo de la gaveta, en dólares y en bolívares. Se abre en el punto de cobro: el equipo de la caja, marcado en Dispositivos.",
      "Si la laptop de caja falla, el turno se abre en otro equipo con el PIN de administración y el motivo: queda en la auditoría e Inicio lo avisa mientras siga abierto.",
      "El corte X enseña lo cobrado sin cerrar nada.",
      "Para cerrar: cuenta lo que hay (arqueo a ciegas) y sella el corte Z. Hasta $ 1,00 de diferencia lo firma la cajera; más, supervisión.",
      "«Cerrar la caja» no pregunta qué cierre es: si queda otra caja abierta, cierras la tuya (tu conteo y tu dinero; lo abierto sigue para la otra); si es la última, es el cierre del día, que no se hace con nada pendiente.",
      "Con la caja cerrada no se cobra, ni se devuelve, ni se anula un cobro; con todas cerradas, tampoco se dan cortesías ni descuentos. Sí se consulta, se registran entradas al parque y se toman pedidos.",
      "La caja de otro equipo (una laptop dañada) la cierran supervisión o administración desde el suyo, con el conteo de su gaveta: queda dicho desde dónde se cerró.",
      "Si un cliente devuelve parte de lo que compró: en Ventas del turno, la venta y «Devolver…» (la de otro día, por su número en «Devolver de otra venta»). Elige cuántas de cada cosa y si vuelven al estante o a merma; el dinero vuelve por su pago, en su moneda (uno electrónico, con la referencia de la devolución), con el descuento y el IVA ya calculados. Lo autoriza supervisión. Sale su comprobante, y el corte lo cuenta.",
    ],
    problemas: [
      {
        sintoma: "«No se devuelve por aquí» o «ya se devolvió»",
        solucion: "Solo se devuelven productos y lo preparado (que va a merma); el tiempo del parque y los servicios, no. Lo ya devuelto no vuelve otra vez. Una venta con devoluciones ya no se anula entera.",
        reconoce: ["no se devuelve por aqui", "ya se devolvio", "ya tiene devoluciones"],
      },
      {
        sintoma: "La jornada no se cierra",
        solucion: "La última caja que se cierra cierra el día, y no se hace con pendientes: cuentas por cobrar o abiertas (incluidas mesas y cuentas de pie), niños en sala o estancias a revisar. El cierre los enumera y se resuelven ahí. Si al abrir el turno dice «La jornada del … sigue abierta», lo pendiente se resuelve al cerrar el turno de hoy.",
        reconoce: ["no se cierra", "pendientes"],
      },
      {
        sintoma: "Hay cargas de papel sin revisar",
        solucion: "Supervisión revisa la carga en Caja → Papel con su PIN (quien la cargó no la revisa). Después se sella el Z.",
        reconoce: ["sin revisar"],
      },
      {
        sintoma: "«Este equipo no es el punto de cobro»",
        solucion:
          "El turno se abre en el equipo de la caja. Si ese equipo falló, pide a administración que ponga su PIN y escribe el motivo («La laptop de caja no enciende»); el turno se abre aquí y queda avisado. Si este equipo pasa a ser la caja, administración lo marca en Ajustes → Personas y equipos → Dispositivos.",
        reconoce: ["no es el punto de cobro", "pin de administracion"],
      },
    ],
  },
  {
    id: "papel",
    ruta: "/papel",
    titulo: "Carga desde papel",
    roles: CAJA,
    proposito:
      "Si caen los dos internet (o la luz sin batería), el local sigue en papel; al volver, lo anotado se carga aquí con su hora real y supervisión lo revisa.",
    pasos: [
      "Antes del día que haga falta: «El procedimiento» se imprime y se pega junto a la caja, y «Imprimir los formularios» deja cinco copias de cada uno en la carpeta.",
      "Sin sistema: se pasa al papel como dice el procedimiento, con la hora del reloj de la pared en cada fila.",
      "Al volver: «Abrir carga» con la hora en que se pasó al papel y la hora en que volvió; se cargan las entradas, las salidas y los cobros, cada uno con su hora.",
      "«Terminar la carga»: supervisión la revisa en «Por revisar», contra las hojas, con su PIN. Sin revisar, no se cierra el turno ni la jornada.",
    ],
    problemas: [
      {
        sintoma: "«Esa hora es anterior (o posterior) al corte que declaraste»",
        solucion: "Cada fila tiene que caer entre la hora en que se pasó al papel y la hora en que volvió. Revisa la hora escrita en la hoja, o abre otra carga con el corte bien.",
        reconoce: ["al corte que declaraste", "todavia no ha pasado"],
      },
      {
        sintoma: "«Quien cargó no revisa su propia carga»",
        solucion: "La revisa otra persona de supervisión o administración, con su propio PIN.",
        reconoce: ["no revisa su propia carga"],
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
      "Toca una mesa libre y «Sentar»: pide la cédula, el teléfono y el nombre del cliente (los tres, obligatorios) y cuántas personas son. Quien consume primero y paga al final deja sus datos: si se va sin pagar, hay a quién cobrarle. Si ya vino antes, al escribir su cédula o su teléfono lo demás se rellena solo. La letra de la cédula se elige al lado y los puntos los pone el campo.",
      "«Buscar cliente»: por su nombre, su cédula o su teléfono, dice dónde está sentado (toca su cuenta para abrir su mesa), sus niños en la sala y si debe algo de antes.",
      "Si otra familia comparte la mesa, «Otra familia»: cada una tiene su cuenta, sus datos, su pedido y su cobro.",
      "Quien pide sin mesa: «De pie», con sus mismos datos.",
      "«Niños vinculados» → «Vincular»: los niños de la familia que juegan en el parque pagan su tiempo con la mesa. Si fue un error o se cambian de mesa, «Desvincular» en el niño: vuelve a la cuenta de su familia o pasa a otra mesa (u otra familia de una mesa compartida), con lo que se debe de él, y su salida del parque va ahí. Lo hace quien vincula, sin PIN; lo ya cobrado no se mueve.",
      "«Tomar pedido», elige de la carta y «Revisar y enviar a cocina»: sale un papel por área, la comanda de cocina y la de barra, con el mismo número y «1 de 2». Lo que se sirve sin papel no sale.",
      "En el pedido se ve cada papel: «Cocina: impresa», «Barra: no salió». Cada uno se vuelve a imprimir por su cuenta.",
      "Al poner una nota a un plato salen «Las más pedidas»: las que más se escribieron para ese plato (o su categoría) en los últimos 60 días. Un toque la añade; lo que escribas se queda. Se aprenden solas de los pedidos.",
      "Cuando un plato llega a la mesa, toca «Servido» en su renglón (o «Servir todo» lo que falte): ahí termina su espera, y el pedido queda servido con su último plato. Si lo marcaste por error, «Deshacer» en los 5 minutos siguientes. En «Atender» salen las mesas que esperan su pedido o no han pedido.",
      "«Pide la cuenta» la manda a caja. Si queda algún plato sin marcar servido, pregunta «¿Ya se sirvió todo?»: «Sí, todo servido» los marca sin hora exacta (no cuentan como espera). Si no consumieron nada, «Liberar».",
      "Supervisión y administración cierran una mesa sin cobrar con «Cerrar la mesa sin cobrar…» y su PIN: «Se fue sin pagar» deja lo que debe a nombre del cliente; «No consumió o fue un error» anula todo lo que pidió (al estante o a merma, con su papel «ANULAR»). La mesa queda libre. Si al sentar a alguien sale «Debe … de antes», avísale: se cobra en la caja.",
      "Cobrada (o cerrada) la última cuenta de una mesa, queda «Por limpiar» en todas las tablets. Al limpiarla, «Mesa limpia: dejarla libre». La caja y supervisión también pueden, por si se olvida.",
      "Los avisos suaves, sin sonido y una vez por mesa: la que lleva sentada sin pedir, la que espera su pedido y la que sigue por limpiar, pasados sus minutos (Ajustes → Sucursal).",
    ],
    problemas: [
      {
        sintoma: "«La mesa cambió: otro equipo le abrió una cuenta»",
        solucion: "Otra tablet sentó a alguien ahí mientras tanto. Mira la mesa: si es otra familia, usa «Otra familia».",
        reconoce: ["otro equipo le abrio una cuenta"],
      },
      {
        sintoma: "«No hay impresora de comandas de cocina (o de barra)»",
        solucion: "El pedido no se envía sin papel para esa área. Administración marca qué imprime cada impresora en Ajustes → Impresoras (con una sola, las tres marcas en ella).",
        reconoce: ["no hay impresora de comandas", "comandas de barra encendida", "comandas de cocina encendida"],
      },
      {
        sintoma: "«Su tiempo ya se cobró en esta mesa» o «La mesa ya cobró una parte de su división»",
        solucion: "Lo cobrado no se mueve: el niño se queda en la mesa. Si la división está a medio cobrar, termina de cobrarla o anula ese cobro, y desvincula después.",
        reconoce: ["su tiempo ya se cobro en esta mesa", "ya cobro una parte de su division"],
      },
      {
        sintoma: "«La cuenta de su familia ya se cerró: pásalo a otra mesa»",
        solucion: "El niño ya salió y su familia no tiene otra cuenta abierta: elige otra mesa, o cobra lo suyo con esta.",
        reconoce: ["la cuenta de su familia ya se cerro"],
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
        solucion: "Otra cuenta de esa mesa (o de pie) ya está a ese nombre. Revisa que no sea la misma familia; si es otra persona, escribe su nombre completo.",
        reconoce: ["usa otro nombre", "ya hay una cuenta de pie a nombre"],
      },
      {
        sintoma: "«Faltan los datos del cliente» o «Documento no válido»",
        solucion: "La cédula va con su letra (V-12345678; un RIF, J-40123456-7) y el teléfono con su código (0414-1234567). Sin los tres datos la cuenta no se abre.",
        reconoce: ["faltan los datos del cliente", "documento no valido", "telefono no valido"],
      },
      {
        sintoma: "«Cobrar» dice «Falta el cliente: Factura a (I)»",
        solucion: "Una venta del mostrador se cobra a alguien: toca «Factura a» (tecla I) y escribe su cédula o el RIF de su empresa y su nombre. Lo cargado desde papel no lo pide.",
        reconoce: ["falta el cliente", "se cobra con la cedula y el nombre del cliente"],
      },
      {
        sintoma: "«Esa mesa no tiene cuenta abierta»",
        solucion: "Un pedido o una pulsera no abren una mesa: primero «Sentar» al cliente con sus datos, y después se pide o se vincula.",
        reconoce: ["no tiene cuenta abierta"],
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
      "Arriba, los avisos que piden acción (tasa, impresión, respaldos, estancias a revisar, un turno abierto fuera del punto de cobro).",
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
      "«Editar» en cada fila abre su ficha: los datos arriba (nombre, categoría, presentación), el precio debajo. La categoría se elige de la lista; «Escribir una nueva…» para la que no está.",
      "Uno creado por error (también en la carga inicial): en su ficha, «Retirar». Sale de la caja, la carta, la tablet y las listas de carga; si le queda existencia, se elige cómo sale. Lo autoriza administración con su PIN. Nada se borra: «Retirados» los muestra y, en su ficha, «Devolver al catálogo».",
      "Productos → En la carta: qué platos ofrece el mesero, su precio con su día (un solo sitio para el precio) y dónde se prepara.",
      "Dónde se prepara cada producto (en su ficha, en «Alta en lote», en la carta o con varios elegidos): Cocina, Barra o Sin papel. Sin elegir, lo preparado va a cocina, lo de nevera a barra y un servicio sin papel.",
      "Entradas de mercancía: una tabla; se puede pegar desde Excel. «Inventario inicial» trae los que faltan por contar (0 si no hay). Cada fila dice la categoría y la presentación del producto, y «Ver o editar su ficha» la abre encima sin perder la lista.",
      "Una entrada mal cargada (una compra, una reposición o el inventario inicial): «Anular», con el motivo y el PIN de administración. Cada línea sale a su costo de esa entrada y el costo promedio se recalcula; queda tachada, con quién y por qué. «Cargarla de nuevo» abre una entrada con sus líneas para corregirlas.",
      "La lista abre con las vigentes de este mes. Arriba, «Vigentes», «Anuladas» o «Todas» (con cuántas hay) y el periodo: hoy, esta semana, este mes, el anterior o entre dos fechas; abajo, las páginas. Las anuladas no se borran: se ocultan, y en «Anuladas» se ven con quién y por qué.",
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
      {
        sintoma: "«Ya salieron N desde esta entrada» al anularla",
        solucion: "De ese producto ya se vendió o se sacó algo después de la entrada: no se sabe qué parte era suya. Corrige la existencia con un conteo en Salidas y conteo.",
        reconoce: ["desde esta entrada", "no se sabe que parte era suya"],
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
      "Sistema → Respaldos: si se hizo el de anoche, si la PC del local ya lo bajó y el ensayo de la semana. «Respaldar ahora» (con tu identidad confirmada) pide uno al momento: el servidor lo hace en el minuto siguiente y ahí mismo dice si se hizo o por qué no. Hecho, quita el aviso de «no se hizo el respaldo de anoche».",
      "Lo que cambia precios o personas pide confirmar tu identidad (vale 15 minutos).",
      "Nada se borra: un precio nuevo rige desde su día; lo que ya no se usa se retira.",
    ],
    problemas: GENERALES,
  },
  {
    id: "impresoras",
    ruta: "/panel/ajustes/impresoras",
    titulo: "Impresoras",
    roles: ["ADMIN"],
    proposito:
      "La impresora térmica del local, el agente de la laptop de caja que imprime en ella (por la red del local o por USB) y lo que se mandó a imprimir.",
    pasos: [
      "Impresoras: cada una marca qué imprime (recibos y cortes, comandas de cocina, comandas de barra), una sola encendida por marca; con una sola impresora, las tres en ella. Se prueba antes de encenderla. Por red, con su IP fija; por USB, se elige el equipo al que está enchufada y su nombre en Windows (el agente de ese equipo la imprime).",
      "En «Editar», «Imprimir la prueba de acentos» saca las tildes con cada página de códigos, numeradas: en «Página de las tildes» se elige la que se leyó bien. «Impresión oscura» pone todo en negrita y con doble pasada, para la que marca pálido.",
      "Agente: se descarga, se vincula con un código de un solo uso y queda instalado en la laptop de caja.",
      "El agente se actualiza solo: cuando el sistema trae otra versión, la baja, comprueba su huella y se cambia con la cola vacía. Aquí se ve su versión y la disponible; «Actualizar ahora» no espera a su próxima revisión.",
      "Cola e historial: lo que salió, lo que espera y lo que falló, con «Reintentar» o «Descartar».",
    ],
    problemas: [
      {
        sintoma: "«La X no arrancó: volvió la anterior»",
        solucion:
          "La versión nueva del agente no quedó en marcha y Windows volvió a poner la que había: la laptop sigue imprimiendo. No se reintenta sola; repórtalo desde la ayuda, y «Actualizar ahora» lo vuelve a intentar.",
        reconoce: ["no arranco", "volvio la anterior"],
      },
      {
        sintoma: "«La X no se instaló: su descarga no tenía la huella publicada»",
        solucion: "Lo descargado no era lo publicado (una descarga cortada o alterada): no se instaló nada. «Actualizar ahora» la descarga otra vez.",
        reconoce: ["huella publicada"],
      },
      {
        sintoma: "Salen símbolos chinos o letras raras en lugar de las tildes",
        solucion:
          "En «Editar» de esa impresora, «Imprimir la prueba de acentos»: sale el mismo texto con cada página, numerado. Elige ahí la que se leyó bien. Si ninguna, la impresora puede tener su propia página fijada: se cambia con su utilidad, el día de la instalación.",
      },
      {
        sintoma: "«El agente de … no imprime por USB: actualízalo»",
        solucion: "Ese agente es de una versión que no imprime por USB: «Actualizar ahora» en la pestaña Agente. Mientras, lo de esa impresora espera en la cola.",
        reconoce: ["no imprime por usb"],
      },
      {
        sintoma: "«Windows no tiene una impresora …» o «… no ve … en Windows»",
        solucion:
          "El nombre no coincide con el de Windows, o la impresora no está enchufada o encendida. Mírala en Configuración de Windows → Impresoras de ese equipo (instalada para todo el equipo, no solo para un usuario) y elígela otra vez en «Editar».",
        reconoce: ["windows no tiene una impresora", "en windows"],
      },
      {
        sintoma: "El agente dice «Versión: la dirá al conectarse» y no se actualiza",
        solucion: "Es un agente instalado antes de que se actualizara solo: se instala una vez la versión de esta pantalla («Descargar el agente») y desde ahí se actualiza solo.",
      },
    ],
  },
  {
    id: "personas",
    ruta: "/panel/ajustes/personas",
    titulo: "Personas y equipos",
    roles: ["ADMIN"],
    proposito:
      "Quién trabaja en el local (usuarios, su rol y su PIN), qué puede hacer cada rol, y los equipos aprobados: el primer factor del acceso. Uno de ellos es el punto de cobro, donde se abre el turno de caja.",
    pasos: [
      "Usuarios y permisos: alta, rol, PIN y credenciales de cada persona; Roles y accesos: lo que puede cada rol.",
      "Dispositivos: un equipo nuevo pide registro desde su pantalla; se aprueba comparando su código.",
      "El equipo de la caja lleva la marca «Punto de cobro» (el botón de la cartera): en él el turno se abre sin pedir nada. En otro, abrirlo pide el PIN de administración y un motivo.",
      "Si la laptop de caja se daña, el turno se abre en otro equipo con tu PIN; si la cambian por otra, marca la nueva y quita la marca a la vieja.",
    ],
    problemas: [
      {
        sintoma: "«Solo un equipo aprobado puede ser punto de cobro»",
        solucion: "Aprueba primero el equipo (compara su código) y después márcalo como punto de cobro.",
        reconoce: ["solo un equipo aprobado puede ser punto de cobro"],
      },
      ...GENERALES,
    ],
  },
  {
    id: "reportes",
    ruta: "/panel/reportes",
    titulo: "Reportes",
    roles: DIRECCION,
    proposito:
      "Lo que pasó en un periodo, de solo lectura y sacado de los asientos: las ventas de un día o de un rango, el inventario al momento, los movimientos de inventario (el kárdex) y las deudas de clientes, cada uno con su PDF.",
    pasos: [
      "Elige el periodo (hoy, ayer, esta semana, este mes o el anterior) o un rango de hasta 93 días y, si quieres, una cajera.",
      "Ventas: arriba, lo vendido, lo cobrado en dólares con la tasa de cada cobro, lo anulado y los cierres Z; debajo, una pestaña por sección. Por turno marca el que se abrió fuera del punto de cobro, con quién lo autorizó.",
      "Inventario al momento: lo que hay a esta hora y lo que vale al costo; las cifras filtran lo agotado, lo bajo mínimo y lo sin contar.",
      "Movimientos: elige un producto o una categoría; cada entrada, venta, salida y conteo sale con quién, el motivo y el saldo que dejó.",
      "Deudas: lo que quedó en deuda, lo recuperado y lo perdido; por mesero (quien sentó al cliente) y por quien autorizó. Toca el número de orden para ver su historia, de la mesa al desenlace; el PDF lleva la de todas, con la cédula y el teléfono del cliente.",
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
      "La espera se mide por plato: termina cuando el mesero lo marca «Servido»; uno sin marcar sigue contando, y la mesa espera mientras le falte uno.",
      "Los minutos a partir de los cuales se avisa se cambian en Ajustes → Sucursal.",
    ],
    problemas: [
      {
        sintoma: "Una mesa sale «Esperando su pedido» y ya comieron",
        solucion: "A su pedido le falta algún plato por marcar «Servido». Pídele al mesero que lo marque desde la mesa (o «Servir todo»): deja de contar.",
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
