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
  /**
   * La ruta de la pantalla; vale también para sus subrutas (la más larga que coincida gana). T-26: puede pedir su pestaña o
   * su vista («/panel/ajustes/sistema?pestana=respaldos», «/deudas?vista=personal»): gana sobre la de la sección.
   */
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
      "Una persona trabaja en un equipo a la vez: si entras en otro, la sesión del anterior se cierra y ese equipo lo dice («Entraste en «Tablet»: aquí se cerró la sesión»). Administración y la cuenta de soporte, no.",
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
      "Cada niño en su renglón: su pulsera, el nombre (opcional, se puede poner después) y «Compra medias», apagado de entrada: enciéndelo para quien no trae sus medias de seguridad (el par va a su cuenta). Debajo, el paquete en tarjetas: un toque. Al registrar, una sola pregunta confirma que los demás las traen. Si no quedan medias en el inventario, entran sin cobrárselas.",
      "Un niño que no tolera la pulsera entra con «Sin pulsera»: su nombre es obligatorio, porque es como se le reconoce.",
      "Escribe la cédula del representante (lo primero; el foco va a ella tras la primera pulsera): si ya vino, aparece solo, con sus niños, y no hay que escribir nada más. Si es nuevo, su teléfono y su nombre. La letra (V, E, J, G, P) se elige al lado; los puntos los pone el campo. El teléfono se entiende escrito como sea, también con +58.",
      "Un solo campo, «Cédula del representante»: al tocarlo enseña «Aquí ahora» (quien salió hoy y vuelve, el cumpleaños de hoy, las mesas abiertas); un toque pone sus datos. Si no recuerda su cédula, «Buscar por nombre o teléfono» debajo: con 3 letras de su nombre propone hasta 6 del directorio, cada uno con la cédula a medias, cuándo vino y cuántos niños. «No es esta persona» lo deshace.",
      "Si la familia debe algo de antes, lo dice en rojo («Debe $ …»): puede entrar igual, se le cobra en la caja.",
      "Reconocida la familia, arriba queda un renglón con su nombre («No es esta persona» vuelve a empezar) y «Sus niños», los de la última vez en botones: toca cada uno y su nombre va al primer niño de la entrada que no lo tiene; otro toque lo quita. Sin teclear.",
      "Con el foco en la cédula se puede pasar la pulsera: el lector no deja nada escrito en el campo. Abajo, fijos sobre el teclado, lo que cuesta, cuántos niños y el aforo, cómo paga y «Registrar».",
      "Un representante de antes, sin cédula, aparece por su teléfono y dice «escribe su cédula»: se le anota al registrar.",
      "Si su familia ya tiene niños en la sala, sale marcado «Sumar a la familia …»: el que llega entra en esa cuenta, con su tiempo desde que entra, y sale con ella. Desmárcalo si va aparte.",
      "Elige cómo paga: ahora (prepago, no se devuelve si sale antes) o todo al salir (cuenta abierta, por lo que usó), y registra.",
      "«Tiempo abierto» (al final de los paquetes): entra sin límite y al salir se cobra lo que vale su tiempo con la tarifa, la combinación más barata de paquetes (1 h 20 = 1 hora + 30 minutos). Va siempre en cuenta abierta.",
      "Los cumpleaños guardan su lugar: desde 30 minutos antes de uno con el anticipo cobrado y hasta su fin, los invitados que no han llegado tienen el suyo, y la entrada lo dice al pie («Quedan 18 lugares: 15 guardados para el cumpleaños de Sofía»). Una visita normal entra en lo que queda; cada invitado que llega deja de guardarse.",
      "Con un cumpleaños exclusivo en curso no entran visitas normales: el pie lo dice y el botón no registra. Sus invitados entran por su botón de «Entran a».",
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
        sintoma: "«Quedan N lugares: … guardados para el cumpleaños de …»",
        solucion: "Esos lugares son de los invitados que no han llegado. Entra la visita si cabe en lo que queda; si no, espera a que salga alguien o a que lleguen los invitados.",
        reconoce: ["guardados para el cumpleanos", "guardado para el cumpleanos"],
      },
      {
        sintoma: "«Ahora es el cumpleaños exclusivo de …: no entran visitas normales»",
        solucion: "Mientras dura un cumpleaños exclusivo el parque es solo suyo. Al terminar se puede entrar otra vez.",
        reconoce: ["cumpleanos exclusivo"],
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
      "Avisos: cuando un niño entra en «por vencer» y cuando se cumple su tiempo, suena (y en Android vibra) un aviso arriba, aquí y en la caja; tócalo y abre su ficha. Dice lo que cuesta quedarse («Si se queda: a 1 hora, $ 2 más. Si se pasa sin subir: $ 3 cada 30 min») para ofrecérselo a la familia, y «Más tiempo» abre su ficha en ese paso. La campana tachada lo calla 15 minutos en este equipo; el altavoz de la barra quita o pone el sonido del equipo.",
      "Con el equipo bloqueado, la pantalla del PIN sigue avisando, solo con la pulsera y los minutos (sin nombres): tócalo, pon tu PIN y abre la ficha de ese niño.",
      "Los avisos funcionan con la aplicación abierta: no son notificaciones del teléfono. Si el equipo se apaga o se cierra el navegador, no avisa.",
      "«Pagar ahora» en la ficha: si la familia pide pagar en la puerta, elige el paquete de cada niño de tiempo abierto (se sugiere el que cubre lo que lleva) y «Mandar a la caja»: la cuenta aparece en la cola. Al salir dentro de su tiempo se van sin pasar por la caja («Todo pagado»); si se pasan, el tiempo de más va a la caja; si salen antes, no se devuelve.",
      "En la ficha: «Más tiempo» (sube a un paquete mayor y paga solo la diferencia: de 30 minutos a 1 hora, lo que falta; se da hasta que termina su gracia, y por vencer o en gracia la ficha dice lo que cuesta quedarse), pausa por comida (una por visita, hasta 10 minutos), poner su nombre o vincularlo a una mesa. Si ya está en una, «Desvincular de la mesa»: vuelve a su familia o pasa a otra mesa, con lo que se debe de él.",
      "El tiempo de más, pasada la gracia, va en bloques del paquete más chico, cada uno a su precio y sin tope: 30 minutos que se queda una hora paga $ 3 más ($ 6 en total), y así cada media hora. La gracia vuelve a contar en cada bloque. Quien entró antes con la regla con tope paga como entró.",
      "«Dar salida» abre su salida aquí mismo; «Toda la familia» trae a todos los niños de su cuenta, marcados: quita de la lista a quien se queda.",
      "«Sin pulsera» abre la entrada de un niño que no la tolera. «Buscar»: por el nombre, la cédula o el teléfono del representante, dice qué niños suyos están en la sala, con su pulsera.",
      "Junto a las cifras, el cumpleaños de hoy: su hora, cuántos de sus invitados entraron y su mesa (en verde si ya empezó, en amarillo si empieza pronto o le falta el anticipo). 30 minutos antes avisa una vez: desde ahí la entrada guarda el lugar de sus invitados. Tócalo para ver los de hoy y los de la semana, con «Empezar en una mesa».",
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
        sintoma: "«Ya pasó su tiempo y su gracia» al dar «Más tiempo»",
        solucion:
          "Desde que termina la gracia ya es tiempo de más: se cobra por bloques al salir, y «Más tiempo» ya no se da (subir pagando la diferencia sería cobrar menos). Ofrécelo cuando avisa «por vencer» o mientras está en gracia.",
        reconoce: ["paso su tiempo y su gracia"],
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
    id: "cierre-del-parque",
    ruta: "/monitor/cierre",
    titulo: "Cierre del parque",
    roles: OPERACION_PARQUE,
    proposito: "La jornada de la monitora, como el corte de la caja y sin montos: cada familia que pasó hoy por el parque, y lo que se cuadra al cerrar.",
    pasos: [
      "Se abre desde la sala («Cierre», junto a «Buscar») o desde el menú Parque. Se ve en cualquier momento: es un corte del momento, y se pone al día solo con cada entrada y salida.",
      "Arriba, los niños que entraron hoy, las familias, el máximo a la vez (con su hora), la estancia promedio y cuántos siguen en la sala: para cerrar, cero.",
      "«Pide atención»: los que recogió otra persona, los que entraron sin pulsera, las entradas anuladas (con quién y por qué), cada «Más tiempo» y las estancias de otro día que quedaron sin salida.",
      "Por familia: el representante (el teléfono a medias; completo, en Clientes) y cada niño con su pulsera, su entrada y su salida, su paquete, el tiempo que estuvo, el tiempo de más, quién lo recogió y su mesa.",
      "Al final, lo que se cuadra con lo físico: las pulseras usadas (de cuál a cuál) y los pares de medias (y cuántos quedan), y los cumpleaños de hoy con sus invitados reservados y los que entraron.",
      "«Guardar PDF del cierre» sale con la sala en cero: abre la hoja A4, y el navegador la imprime o la guarda como PDF.",
    ],
    problemas: [
      {
        sintoma: "«Guardar PDF del cierre» está apagado",
        solucion: "Queda algún niño en la sala: el cierre sale cuando salgan todos. Lo que se ve mientras tanto es un corte del momento. Las estancias de otro día sin salida no cuentan: las cierra la dirección en «estancias a revisar».",
      },
    ],
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
      "Revisa el desglose: en cuenta abierta, si salió antes, se cobra la combinación más barata de paquetes que cubre lo que estuvo; el tiempo abierto, lo que vale su tiempo; y el tiempo de más, en bloques del paquete más chico con la regla con que entró (por bloques, sin tope; o con tope, si entró antes).",
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
      "Pasada la hora de cierre del local, arriba sale «La caja sigue abierta: ciérrala antes de irte», con lo que falta; «Cerrar la caja» lleva a su cierre.",
      "Con teclado, «?» (o el botón del teclado, arriba de la cola) abre la lista de atajos: N venta directa, A entrada, / o C buscar, R el último recibo, M mover efectivo, las letras de cada medio, Ctrl+Intro cobrar…",
      "Varias cuentas del mismo cliente (la de su familia, que salió sin vincular la pulsera, y la de su mesa): «Juntar» arriba de la cola, toca cada cuenta (Mayús+clic, un rango) y «Cobrar juntas». Eliges cuál queda; lo que deben las otras pasa a ella, cada cosa dice de qué cuenta vino, y se cobra una vez con un solo recibo. Las otras salen de la cola juntadas en ella. No se juntan un cumpleaños, una con partes cobradas, una con descuento ni la que otra persona está cobrando.",
      "Una familia que llega directo a la caja: «Entrada» (tecla A), o pasa una pulsera que no está en la sala. En el panel, cada pulsera suma un niño (si no se lee, «Escribir» su número; «Sin pulsera» con su nombre), el paquete y la cédula del representante; «Registrar y cobrar» deja su cuenta lista. Se paga ahora: la cuenta abierta y los invitados de un cumpleaños, en Entrada.",
      "Si dejas una venta del mostrador sin cobrar (eliges otra cuenta, empiezas otra venta o la entrada), la caja pregunta: cobrarla ahora, dejarla pendiente a nombre del cliente (cédula, teléfono y nombre) o descartarla. En la cola, una venta pendiente sin datos dice «Sin datos». La búsqueda de la cola encuentra también por cédula y teléfono.",
      "En una venta de mostrador, añade los productos de la carta (o pasa su código de barras). Para no buscarlos a ojo, escribe en «Buscar producto o código» (tecla /): busca en toda la carta por nombre, SKU o código, e Intro añade el primero. Lo que no se vende ahora (sin contar o agotado) va al final, atenuado.",
      "Lo que se prepara (cocina o barra) sale en su comanda, un papel por área, al cobrar la venta o al dejarla pendiente: «CAJA» en grande y a quién va. Toca el producto en el ticket y «Nota» para lo que la cocina debe saber (con las más pedidas). Lo que ya salió dice «Salió en su comanda» y no se quita: se anula.",
      "Anular lo que salió en su comanda (de la caja o de una mesa): tócalo en el ticket y «Anular», con el motivo y si la cocina ya lo preparó (vuelve al estante o sale como merma); de una fila de varias, cuántas. Si lo pediste tú hace menos de 2 minutos, va sin PIN y a tu nombre; si no, con el PIN de supervisión. A la cocina o la barra le sale su papel «ANULAR». Lo que no salió en una comanda se quita con «−».",
      "Elige el medio de pago y escribe el monto; se puede pagar con varios medios (mixto). El vuelto se calcula solo.",
      "«Cambiar de mesa» (en una cuenta de mesa): si la familia se cambió y nadie lo hizo en la tablet, la cuenta pasa entera a la mesa nueva, con su papel para la cocina.",
      "«En el parque» (al pie de la cola): las familias con niños en la sala que pueden pagar ya. «Pagar ahora» (o pasar la pulsera de uno de sus niños): el de tiempo abierto elige su paquete y la cuenta se abre para cobrarla con lo demás. Al salir dentro de su tiempo se van sin pasar por la caja; si se pasan, el tiempo de más llega a la cola.",
      "«Abiertas en el salón» (al pie de la cola): las mesas y las cuentas de pie que no han pedido la cuenta y tienen algo que cobrar, con quién las abrió y cuánto llevan. «Lleva rato» si pasaron los minutos de Ajustes → Sucursal desde su último pedido (la caja y el mesero reciben un aviso). Tócala y «Traer a la caja y cobrar»: pasa a la cola como si hubiera pedido la cuenta, sin esperar al mesero. Si piden algo más, vuelve a la mesa. En el cierre, las que no pidieron la cuenta salen primero.",
      "«Cobrar lo que va»: desde «Abiertas en el salón» (o porque el mesero la mandó: dice «Lo que va» en la cola). Se cobra todo lo pedido hasta ahora, también lo que falta servir (arriba dice qué), y la mesa sigue abierta; lo que pidan después se cobra al final, cada cosa una vez. Si cobran en la mesa con el punto de venta, se registra aquí igual. Se cobra entera o en partes iguales: no se junta con otras ni se divide por ítems. Anular ese cobro no le cierra la mesa, y «Cobrarla de nuevo» la devuelve a pagar lo que va.",
      "Si una mesa vuelve a pedir mientras la cobras, sale de la cola y la caja lo dice («Mesa 4 volvió a pedir: salió de la cola»): lo tecleado sin cobrar se descarta, y vuelve cuando pida la cuenta otra vez.",
      "Si sobra, «Vuelto» (o «Propina», o «A caja» si es poco). El vuelto va en efectivo $; para darlo de otra forma, toca «Vuelto» otra vez: efectivo Bs, Pago Móvil (con el banco del cliente y la referencia del envío) o «Repartido», que propone los dólares enteros en billetes y los centavos en bolívares, a la tasa del cobro. Avisa si en la gaveta no alcanza esa moneda. Cada parte sale de su moneda y el recibo dice cómo se dio.",
      "Arriba de la cuenta, «Añadir ítems» y «Más»: Cambiar de mesa y Se fue sin pagar (cada uno si aplica), con su texto.",
      "Dos medios: con el primer pago puesto (un billete, o un monto y «Añadir»), debajo dice «El resto, $ …, en» con cada medio electrónico y lo que falta en él (en bolívares, a la tasa del cobro): un toque lo añade, con sus datos si los pide. En efectivo no: se cuenta.",
      "Si el mesero pide algo mientras cobras (con algo ya tecleado), la cuenta se queda en la cola: lo nuevo sale marcado «Nuevo», un aviso lo dice y lo tecleado sigue. Si no habías tecleado nada, vuelve a la mesa como siempre.",
      "Debajo de la cuenta, tres botones que dicen cómo está: «Factura a» (tecla I), «Descuento» y «Dividir» en partes iguales, de 2 a 6. La cuenta que nació con su cliente (una mesa, de pie) ya viene a su nombre. Una venta del mostrador se cobra a alguien: si no tiene cliente, «Factura a» dice «Falta el cliente» y pide su cédula (o el RIF de su empresa) y su nombre. Una cuenta sentada «Más rápido» que llega sin la cédula dice «Falta la cédula» (también en la cola): tócalo (tecla I), escríbela en el mismo campo «Cédula o RIF» y la factura sale a su nombre. Sin ella no se cobra.",
      "Lo que consume alguien del equipo: «Personal» (debajo de la cuenta, junto a «Dividir»). Elige quién consumió y que esa persona escriba su PIN: se cobra a precio normal, en dólares, sale del inventario y no entra dinero (no cuenta en la gaveta). Sale su vale para que lo firme, y el vale se queda en la caja. Es el único pago de esa cuenta: sin otros pagos, sin descuento y sin dividir.",
      "«Dividir» → «Por ítems», cuando cada uno paga lo suyo: elige «Persona 1, 2, +» y toca los ítems de esa persona (lo que no toques es de la persona 1). «Partir» reparte un ítem compartido en partes iguales entre las personas que marques, cada parte con su IVA. «Separar y cobrar» deja lo de cada persona en su cuenta (en la cola, «De #0041») y abre la elegida: se cobra con el cobro de siempre, sin pedir sus datos. «Dividir» → «Por ítems» en la cuenta original dice sus personas y «Unir de nuevo» devuelve lo que no se cobró.",
      "Un solo campo para buscar, arriba de la cola (tecla / o C): por nombre, cédula, teléfono o #orden. Arriba quedan las cuentas de la cola que coinciden; debajo, «En el directorio», las personas que coinciden: tocar una abre su ficha con lo que tiene abierto (y lo abre para cobrar), sus niños en la sala y lo que debe. El lector de pulseras sigue sin tocar el campo.",
      "«Factura a»: un solo campo, «Cédula o RIF». Con una cédula del directorio pone su nombre; al tocarlo propone «Aquí ahora» (las cuentas abiertas primero); quien no la recuerda, «Buscar por nombre o teléfono». Con el RIF de una empresa (J- o G-) completo, propone la razón social y la dirección de la última factura a ese RIF: cámbialas si no son.",
      "Al pedir los datos de un pago (Pago Móvil, transferencia), «Paga …» ofrece el teléfono y la cédula del cliente de la cuenta: «Usar» los pone. Si pagó otra persona, escribe los suyos.",
      "«Cobrar $ …» dice lo que se cobra, el de la parte si está dividida (Ctrl+Intro con el teclado). El recibo sale en la impresora de caja si «Recibo» está encendido; si no, se imprime después desde el turno.",
      "El recibo dice lo que pasó: cada pago en su moneda (el de bolívares, con lo que vale en dólares a la tasa del cobro), lo pagado y el vuelto, también en bolívares. Lo pagado menos el vuelto es el total.",
      "Si el cliente de una mesa o de una venta se fue sin pagar: «Se fue sin pagar» en la cuenta, con el PIN de supervisión. Lo que debe queda a su nombre (Caja → Deudas). Cuando vuelva, al buscarlo en la cola sale «Debe de antes»: tócalo y se cobra como cualquier cuenta.",
      "Una cuenta del salón dice, debajo de su nombre, su mesa (o «De pie»), hace cuánto pidió la cuenta, lo que sigue sin servir y sus niños, con su tiempo si siguen en la sala. Si al cobrarla hay niños suyos en la sala, la caja avisa «Dales salida antes»: pasa su pulsera o dales salida, y su tiempo se suma a la cuenta. «Cobrar igual» sigue sin esperar.",
      "Cobrada la última cuenta de una mesa, la mesa queda por limpiar. La limpia el mesero; si se olvida, la cola dice «Por limpiar» con sus números: un toque la deja limpia y libre.",
      "Una cuenta del salón que pidió y sigue sin cobrar pasados unos minutos (10, de fábrica) sale en un aviso suave, sin sonido, una vez. Los minutos, en Ajustes → Sucursal.",
      "Las pestañas de la caja: en la laptop y la tablet, «Cobrar» y «Turno», y «Más» con Papel, Deudas y Personal; en una pantalla de 1440 px o más, las cinco con su número y, a la izquierda, el riel del panel (Inicio, Parque, Restaurante, Inventario, Reportes y Ajustes) a un clic. Alt+1 a Alt+5 abren cada una. El aviso de impresión dice su número (lo que no salió, al tocarlo) y, por debajo de 1440 px, el turno es solo su reloj.",
      "Arriba, la barra dice cómo está la impresora: «Impresora sin papel» o «Impresora no responde» en rojo (con sonido), «Imprime por …» en ámbar cuando sale por su respaldo. Pon el rollo y, en «N sin imprimir», «Reintentar».",
      "Si la caja quedó abierta de un día que ya terminó (pasadas las 4:00 am de fábrica), dice «Esta caja es del …: ciérrala antes de cobrar» con lo pendiente de ese día. Lo de ese día se cobra ahí; lo de hoy, no. «Cerrar la caja» lleva al cierre; después se abre la de hoy.",
      "El cumpleaños de hoy va arriba de la cola: su hora, sus invitados y su mesa. Tócalo para ver los de hoy y los de la semana (con el anticipo cobrado o por cobrar) y «Empezar en una mesa». La cuenta del cumpleaños espera en la cola desde que empieza y se cobra de una vez: el saldo, lo que pidió su mesa y lo incluido, a $ 0.",
    ],
    problemas: [
      {
        sintoma: "Una venta dice «Anulación pedida» o «Aprobada: hazla»",
        solucion:
          "Se pidió a administración anular ese cobro (no estaba en el local): espera su respuesta, que llega sola. Aprobada, en la venta, «Hacer la anulación aprobada», sin PIN. Rechazada, dice por qué; se puede pedir otra vez.",
        reconoce: ["anulacion pedida", "aprobada: hazla"],
      },
      {
        sintoma: "«La caja sigue abierta: ciérrala antes de irte» arriba",
        solucion: "Pasó la hora de cierre del local: cuando termines lo que falta, «Cerrar la caja». La hora se cambia en Ajustes → Sucursal.",
        reconoce: ["la caja sigue abierta"],
      },
      {
        sintoma: "«Cobrar» dice «Falta la cédula: Factura a (I)» o «Antes de cobrar, la cédula de …»",
        solucion: "La cuenta se sentó «Más rápido», solo con el nombre. Toca «Factura a» (tecla I): pide su cédula en el mismo campo, sin PIN. Anotada, se cobra a su nombre.",
        reconoce: ["falta la cedula", "antes de cobrar, la cedula"],
      },
      {
        sintoma: "«Cobrar lo que va es de una mesa o una cuenta de pie abierta…» o «Paga lo que va y sigue en su mesa»",
        solucion: "Lo que va se cobra de una mesa o una cuenta de pie que sigue sentada y tiene algo que cobrar; la que ya pidió la cuenta se cobra entera. Mientras paga lo que va, no se junta con otras ni se divide por ítems: cóbrala sola (o en partes iguales).",
        reconoce: ["cobrar lo que va es de una mesa", "paga lo que va y sigue en su mesa"],
      },
      {
        sintoma: "«Este turno tiene una anulación pedida sin resolver»",
        solucion: "Administración la aprueba o la rechaza en «Por aprobar» (Inicio, también en su teléfono). Aprobada, se hace desde la venta, en Turno, con «Hacer la anulación aprobada». Después, el corte Z.",
        reconoce: ["anulacion pedida sin resolver", "anulaciones pedidas sin resolver", "todavia no la aprobo"],
      },
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
    id: "personal",
    ruta: "/deudas?vista=personal",
    titulo: "Deudas del personal",
    roles: CAJA,
    proposito: "Caja → Deudas → «Personal»: los vales de lo que consumió el equipo y sus adelantos, por quincena. El descuento del sueldo se hace fuera del sistema; administración lo marca «Descontado en la quincena».",
    pasos: [
      "El consumo se cobra en la caja con «Personal»: quien consumió escribe su PIN y sale su vale para que lo firme. El vale se queda en la caja.",
      "Supervisión y administración ven aquí los vales de todos: lo de cada persona en la quincena y cada vale, con lo consumido, quién lo cobró y si se anuló o se devolvió algo.",
      "Cada persona del equipo ve los suyos: «¿Quién eres?», su PIN y «Ver mis vales». Al terminar, «Listo» los quita de la pantalla.",
      "«Esta quincena» va del 1 al 15 o del 16 al último día del mes; «Quincena anterior», la de antes.",
      "«Reimprimir vale» saca una copia en la impresora de recibos (dice «COPIA»).",
      "«Descontado en la quincena» (administración, con su PIN): cuando se le descontó del sueldo, se marca por persona y quincena; deja de estar pendiente y Reportes → Personal dice cuándo y quién. No toca la gaveta.",
      "«Anular vale» (administración, con su PIN), de cualquier día: no se le descuenta, y cada cosa vuelve al estante o sale como merma.",
      "Un vale anulado no cuenta; lo devuelto se resta. Anular o devolver un consumo pide el PIN de administración, como cualquier venta, y vuelve a su vale: no sale dinero.",
      "Los adelantos en efectivo (Turno → «Mover efectivo» → Salida → Adelanto al personal, con el PIN de la persona) salen en su quincena, junto a sus vales: en «Por persona» y en «Adelantos», con su comprobante, para qué fue y quién lo entregó.",
    ],
    problemas: [
      {
        sintoma: "«PIN incorrecto» al cobrar el consumo o al ver los vales",
        solucion: "Es el PIN de la persona que consumió, no el de quien cobra. Tras varios intentos se bloquea un rato, como al entrar.",
        reconoce: ["pin incorrecto"],
      },
      {
        sintoma: "«Personal» no se deja tocar en la caja",
        solucion: "El consumo del personal es el único pago de la cuenta: quita los pagos, el descuento o las partes. Si no aparece, está apagado en Ajustes → Medios de pago.",
        reconoce: ["el unico pago de su cobro", "va a precio normal", "una cuenta en partes no se cobra"],
      },
      {
        sintoma: "«El vale no se imprimió»",
        solucion: "El consumo sí quedó cobrado. Revisa la impresora de recibos y reimprímelo aquí.",
        reconoce: ["el vale no se imprimio"],
      },
    ],
  },
  {
    id: "deudas",
    ruta: "/deudas",
    titulo: "Deudas: clientes y personal",
    roles: CAJA,
    proposito: "Lo que dejaron sin pagar quienes se fueron: a nombre de su cliente, con lo que deben, quién los atendió y quién lo autorizó.",
    pasos: [
      "Arriba, «Clientes» o «Personal»: lo que dejaron los clientes, y los vales y adelantos del equipo en su quincena.",
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
      "Si la caja tiene fondo fijo (Ajustes → Dispositivos), el fondo se cuenta por billete. Si no es lo que quedó en el último cierre, lo dice («Falta $ 5.00 de lo que quedó»): vuelve a contar, o «Abrir así» y la diferencia queda a tu nombre, en el turno («Abrió con diferencia») y en su corte. Al cerrar, se propone dejar el fondo fijo y retirar el resto.",
      "Si la laptop de caja falla, el turno se abre en otro equipo con el PIN de administración y el motivo: queda en la auditoría e Inicio lo avisa mientras siga abierto.",
      "El corte X enseña lo cobrado sin cerrar nada.",
      "«Mover efectivo» (en «La gaveta», o la tecla M en Cobrar): lo que entra o sale de la gaveta sin ser venta. Entrada: sencillo para la caja. Salida: compras para el local (el hielo), pago a proveedor o adelanto al personal. Retiro: a resguardo (la caja fuerte). En $ o en Bs, con para qué es. Sale su comprobante; el del adelanto lo firma la persona, el del retiro quien lo recibe. El arqueo lo cuenta: pagar el hielo de la gaveta ya no deja diferencia.",
      "Hasta el tope de Ajustes → Sucursal («Mover», $ 20 de fábrica) la caja lo hace sola; por encima, y todo retiro, con el PIN de supervisión. Lo de bolívares se mide en dólares a la tasa de hoy. El adelanto lo firma la persona con su PIN y sale en su quincena (Reportes → Personal). Tocar un movimiento en «La gaveta» reimprime su comprobante (como copia).",
      "Para cerrar: cuenta lo que hay (arqueo a ciegas) y sella el corte Z. Hasta $ 1,00 de diferencia lo firma la cajera; más, supervisión.",
      "«Cerrar la caja» no pregunta qué cierre es: si queda otra caja abierta, cierras la tuya (tu conteo y tu dinero; lo abierto sigue para la otra); si es la última, es el cierre del día, que no se hace con nada pendiente.",
      "Con la caja cerrada no se cobra, ni se devuelve, ni se anula un cobro; con todas cerradas, tampoco se dan cortesías ni descuentos. Sí se consulta, se registran entradas al parque y se toman pedidos.",
      "La caja de otro equipo (una laptop dañada) la cierran supervisión o administración desde el suyo, con el conteo de su gaveta: queda dicho desde dónde se cerró.",
      "El día de negocio termina a la hora de Ajustes → Sucursal («El día termina», 4:00 am de fábrica): lo cobrado pasada la medianoche sigue siendo del día. Desde esa hora, una caja que siga abierta es de un día anterior: cobra lo de su día (las cuentas abiertas antes), no lo de hoy, y pide cerrarse. Su cierre pide solo lo de su día; lo de hoy pasa a la caja de hoy.",
      "Desde la hora de cierre del local (la del horario de ese día o, si no la dice, «Hora de cierre del local» en Ajustes → Sucursal, 10:00 pm de fábrica) y hasta que el día termina, Inicio y la caja avisan «La caja sigue abierta: ciérrala antes de irte», con la hora y lo que falta (las cuentas por cobrar, las del salón sin pedir la cuenta y los niños en la sala). «Cerrar la caja» lleva aquí, a su cierre.",
      "Al abrir y al cerrar el turno, administración y supervisión ven si la PC del local no baja los respaldos (cuál y desde cuándo), con «Cómo se arregla»: encender esa PC y ejecutar su tarea «L2 Control - Respaldos» en el Programador de tareas, o prepararla otra vez en Ajustes → Sistema → Respaldos. Se quita solo cuando la PC baja el de anoche.",
      "Ventas del turno: búscalas por familia o número de orden; los medios de pago van en chips con su cuenta. Tres vistas (Tarjetas, Lista y Compacta): la Lista es la tabla; en Tarjetas o Compacta, por hora. Cada persona elige la suya y se recuerda.",
      "Si un cliente devuelve parte de lo que compró: en Ventas del turno, la venta y «Devolver…» (la de otro día, por su número en «Devolver de otra venta»). Elige cuántas de cada cosa y si vuelven al estante o a merma; el dinero vuelve por su pago, en su moneda (uno electrónico, con la referencia de la devolución), con el descuento y el IVA ya calculados. Lo autoriza administración con su PIN. Sale su comprobante, y el corte lo cuenta.",
      "Un niño que pagó por adelantado y salió antes: en su venta, «Devolver…» y en su paquete «Lo que no usó» (lo pagado menos lo que vale el tiempo que estuvo, calculado solo) o «Entero» si fue un problema del local. La salida del parque ya dice cuánto es. Con el PIN de administración.",
      "«Anular» un cobro (con el PIN de administración y su motivo): «Cobrarla de nuevo» la devuelve a la cola para corregir el medio o el monto; «Anular la venta entera» devuelve el dinero por sus medios, cierra la cuenta con su motivo y lo que tiene inventario vuelve al estante (o a merma, si se elige). Antes del corte Z de su turno.",
      "Sin administración en el local: «Anular cobro…», el motivo y qué se hace con la cuenta, y «Pedir a administración». La venta queda «Anulación pedida» y la caja sigue. Administración la aprueba (con su PIN) o la rechaza en «Por aprobar», en Inicio, también desde su teléfono. Aprobada, la venta dice «Aprobada: hazla»: «Hacer la anulación aprobada», sin PIN, y devuelve el dinero como diga. Rechazada, dice por qué; se puede pedir otra vez. El corte Z no se hace con una pedida sin resolver.",
    ],
    problemas: [
      {
        sintoma: "«No se devuelve por aquí» o «ya se devolvió»",
        solucion: "Se devuelven productos, lo preparado (que va a merma) y el paquete de un niño que ya salió (entero o lo que no usó); el tiempo de más y los servicios, no. Lo ya devuelto no vuelve otra vez. Una venta con devoluciones ya no se anula entera.",
        reconoce: ["no se devuelve por aqui", "ya se devolvio", "ya tiene devoluciones"],
      },
      {
        sintoma: "«No hay dólares (o bolívares) suficientes para sacarlo» al mover efectivo",
        solucion: "Lo que sale de la gaveta no puede ser más de lo que el libro dice que hay en esa moneda. Revisa el monto o la moneda: si el dinero está, quizás entró sin anotarse (anota primero la entrada).",
        reconoce: ["no hay dolares suficientes para sacarlo", "no hay bolivares suficientes para sacarlo"],
      },
      {
        sintoma: "«Mover efectivo» pide la autorización de un supervisor",
        solucion: "Pasa del tope de Ajustes → Sucursal («Mover»), o es un retiro a resguardo: lo autoriza supervisión o administración con su PIN, en el mismo diálogo.",
        reconoce: ["esto necesita la autorizacion de un supervisor"],
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
        sintoma: "En el cierre, una cuenta dice «No pidió la cuenta»",
        solucion:
          "Es una mesa o una cuenta de pie que nunca pasó a la caja: el mesero no tocó «Pide la cuenta». La fila dice quién la abrió y a qué hora. «Traer a la caja y cobrar» la pasa a la cola y la abre para cobrarla; si se fueron sin pagar, «Se fue sin pagar» la deja como deuda a su nombre. Sin nada que cobrar, se libera en Mesas.",
        reconoce: ["no pidio la cuenta", "no ha pedido la cuenta"],
      },
      {
        sintoma: "«… lleva 45 min sin pedir la cuenta»",
        solucion:
          "Una mesa o una cuenta de pie no ha pedido la cuenta desde su último pedido (los minutos, en Ajustes → Sucursal). Mírala en «Abiertas en el salón»: si ya se van, «Traer a la caja y cobrar»; si siguen, no hace falta nada.",
        reconoce: ["sin pedir la cuenta", "abiertas en el salon"],
      },
      {
        sintoma: "«Esta caja es del … : ciérrala antes de cobrar»",
        solucion:
          "La caja quedó abierta de un día que ya terminó. La caja enseña lo pendiente de ese día: cóbralo ahí (o «Se fue sin pagar» o incobrable), registra la salida de sus niños y «Cerrar la caja» lleva al conteo y al corte Z. Lo de hoy se cobra después, en la caja de hoy. Si el equipo de esa caja no está, supervisión la cierra desde Inicio.",
        reconoce: ["esta caja es del", "cierrala antes", "abierta la caja del"],
      },
      {
        sintoma: "«Falta … de lo que quedó en la gaveta» al abrir el turno",
        solucion: "Lo contado no es lo que dejó el último cierre de esta caja (con fondo fijo). Vuelve a contar billete por billete; si de verdad falta o sobra, «Abrir así»: queda anotado a tu nombre y supervisión lo ve en el corte.",
        reconoce: ["de lo que quedo en la gaveta", "cuentalo por billete", "el fondo no es lo que suman los billetes"],
      },
      {
        sintoma: "«Este equipo no es el punto de cobro»",
        solucion:
          "El turno se abre en el equipo de la caja. Si ese equipo falló, pide a administración que ponga su PIN y escribe el motivo («La laptop de caja no enciende»); el turno se abre aquí y queda avisado. Si este equipo pasa a ser la caja, administración lo marca en Ajustes → Personas y equipos → Dispositivos.",
        reconoce: ["no es el punto de cobro", "pin de administracion"],
      },
      {
        sintoma: "«La PC … no baja los respaldos desde el …» al abrir o cerrar el turno",
        solucion:
          "Solo lo ven administración y supervisión. Sigue «Cómo se arregla»: encender esa PC y ejecutar su tarea «L2 Control - Respaldos», o prepararla otra vez en Ajustes → Sistema → Respaldos. Se quita solo cuando baja el de anoche.",
        reconoce: ["no baja los respaldos"],
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
      "En cada entrada, la familia por su cédula primero (o su nombre, si en la hoja no se anotó): al elegirla pone su cédula y su teléfono.",
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
      "Si arriba dice «Las comandas no están saliendo» (en rojo, con sonido), la impresora está sin papel o no responde: avisa a la caja. Lo que no salió queda en «N sin imprimir» y sale con «Reintentar» cuando vuelva.",
      "La píldora roja «N no salieron» (junto a las cifras de arriba) abre la lista de las comandas que no salieron en papel, cada una con «Reimprimir»: la cocina no sabe de ellas hasta que salgan.",
      "En la tablet en vertical, la mesa que tocas sube en un cajón, con sus botones abajo; tocar fuera lo baja y deja el plano a la vista. Los tiempos se leen: «42 min», «1 h 15 min» y, lo que viene de otro día, «desde ayer 7:29 pm».",
      "Toca una mesa libre y «Sentar»: pide los datos del cliente y cuántas personas son. Qué datos lo elige administración en Ajustes → Sucursal: con «Más seguro» (de fábrica), la cédula y el nombre antes del primer pedido; con «Más rápido», el nombre (la cédula, si la da). El teléfono, siempre o solo si queda una deuda. Quien consume primero y paga al final deja sus datos: si se va sin pagar, hay a quién cobrarle. Si ya vino antes, al escribir su cédula o su teléfono lo demás se rellena solo. La letra de la cédula se elige al lado y los puntos los pone el campo.",
      "Con «Más rápido», la cuenta sentada sin cédula dice «Falta la cédula»: el primer pedido sale igual, y al tocar «Tomar pedido» otra vez la tablet la pide en el mismo campo «Cédula o RIF» («Anotar y tomar el pedido»). Sin ella, el segundo pedido no sale. Tocar «Falta la cédula» la pide cuando quieras; se anota sin PIN.",
      "En «Sentar», un solo campo: «Cédula o RIF». Al tocarlo propone «Aquí ahora»: primero las familias con niños en el parque y el cumpleaños de hoy, después las cuentas abiertas y quien vino hoy; un toque rellena sus datos. Quien no recuerda su cédula: «Buscar por nombre o teléfono». Si tiene niños en el parque, «Llevar el tiempo de sus N niños a esta mesa» viene marcado: su cuenta nace con ellos vinculados. Desmárcalo si van aparte.",
      "«Buscar cliente»: por su nombre, su cédula o su teléfono, dice dónde está sentado (toca su cuenta para abrir su mesa), sus niños en la sala y si debe algo de antes.",
      "Si otra familia comparte la mesa, «Otra familia»: cada una tiene su cuenta, sus datos, su pedido y su cobro.",
      "Quien pide sin mesa: «De pie», con sus mismos datos.",
      "Al vincular, pasar la pulsera de un niño marca también a sus hermanos que están en la sala (desmarca al que se siente en otra mesa); «Toda la familia» los marca a todos. Va todo lo de cada niño: su paquete, sus medias y su «Más tiempo». Si el niño es de otra familia que la de la mesa, pregunta «¿vincular igual?», y queda anotado.",
      "«Niños vinculados» → «Vincular»: los niños de la familia que juegan en el parque pagan su tiempo con la mesa. Si fue un error o se cambian de mesa, «Desvincular» en el niño: vuelve a la cuenta de su familia o pasa a otra mesa (u otra familia de una mesa compartida), con lo que se debe de él, y su salida del parque va ahí. Lo hace quien vincula, sin PIN; lo ya cobrado no se mueve.",
      "«Tomar pedido», elige de la carta y «Revisar y enviar a cocina»: sale un papel por área, la comanda de cocina y la de barra, con el mismo número y «1 de 2». Lo que se sirve sin papel no sale.",
      "Si la misma cuenta pidió lo mismo hace menos de 2 minutos (un toque doble, u otra tablet o la caja), pregunta «¿Pedirlo otra vez?» con quién y desde dónde: «Sí, otra vez» lo envía; si no, no sale nada.",
      "«Anular» un pedido enviado: si lo pediste tú hace menos de 2 minutos, sin PIN y a tu nombre; después, o si lo pidió otra persona, con el PIN de supervisión. Dice el motivo y si la cocina ya lo preparó, y a la cocina le sale su papel «ANULAR».",
      "En la mesa, «Tomar pedido» arriba y grande; debajo, una fila: «Pagar lo que va», «Cambiar de mesa» y «Más» (Pide la cuenta para irse, Liberar la mesa y, para supervisión, Cerrar la mesa sin cobrar).",
      "La carta abre en «Lo más pedido hoy»: los 8 platos más pedidos del día (temprano, los de la semana). Tomar uno de ellos: el plato, «Revisar y enviar a cocina» y «Enviar». La caja lo tiene igual en la venta directa.",
      "En la carta, «Buscar en la carta» encuentra un plato en todas las categorías; las categorías van en una tira que se desliza, y lo agotado o sin contar, al final. En vertical, el pedido va en la barra de abajo («3 platos · $ …»): tócala para ver el ticket, sus cantidades y sus notas; «Enviar» lo manda.",
      "En el pedido se ve cada papel: «Cocina: impresa», «Barra: no salió». Cada uno se vuelve a imprimir por su cuenta.",
      "Al poner una nota a un plato salen «Las más pedidas»: las que más se escribieron para ese plato (o su categoría) en los últimos 60 días. Un toque la añade; lo que escribas se queda. Se aprenden solas de los pedidos.",
      "Cuando un plato llega a la mesa, toca «Servido» en su renglón (o «Servir todo» lo que falte): ahí termina su espera, y el pedido queda servido con su último plato. Si lo marcaste por error, «Deshacer» en los 5 minutos siguientes. En «Atender» salen las mesas que esperan su pedido o no han pedido.",
      "Cada cuenta de pie es un icono en el plano, con su nombre: arrástralo a donde está la gente y ponle el candado para que no se mueva sin querer (quítalo para moverlo). Las otras tablets lo ven donde lo dejaste; moverlo no toca la cuenta, así que la caja la cobra igual. Al cobrarla o liberarla, desaparece.",
      "Si se cambian de mesa, «Cambiar de mesa» y elige la nueva: la cuenta pasa entera, con sus pedidos y sus niños. Lo que falta servir sale en un papel «CAMBIO DE MESA · 3 → 7» en la cocina y en la barra, y lo que se pida después ya dice la mesa nueva. La vieja queda por limpiar. Si la nueva tiene gente, queda como mesa compartida. Sin PIN.",
      "Si piden algo más con la cuenta ya en la caja, «Seguir con el pedido» y envíalo: la cuenta vuelve a la mesa (sale de la cola) y la caja lo ve. Cuando terminen, «Pide la cuenta» otra vez. Si la caja ya la está cobrando (tiene algo tecleado), se queda en su cola y lo nuevo se suma a ese cobro. Si la caja ya cobró una parte de un pago en partes iguales, el aviso trae «Abrir otra cuenta en esta mesa»: un toque la abre con el mismo cliente y el pedido sale en ella.",
      "Si la mesa se quedó sin cuenta mientras pedías (otro equipo la cobró o la liberó), el aviso trae «Sentar»: siéntala otra vez y el pedido sale solo en su cuenta nueva.",
      "«Más» → «Pide la cuenta para irse» la manda a caja. Si queda algún plato de hace más de 10 minutos sin marcar servido (los minutos, en Ajustes → Sucursal), pregunta «¿Ya se sirvió todo?»: «Sí, todo servido» los marca sin hora exacta (no cuentan como espera). Si no consumieron nada, «Más» → «Liberar la mesa».",
      "«Pagar lo que va»: pagan lo consumido hasta ahora y se quedan (o se van unos y siguen otros). La cuenta va a la caja sin cerrar la mesa; se cobra todo lo pedido, también lo que falta servir. Cobrada, la mesa sigue abierta y sus pedidos dicen «Pagado»; lo que pidan después se cobra al final con «Pide la cuenta». Si piden algo antes de que la caja cobre, el pedido la trae de vuelta. Pagado todo y sin nada más, «Liberar mesa» la cierra cobrada.",
      "Supervisión y administración cierran una mesa sin cobrar con «Cerrar la mesa sin cobrar…» y su PIN: «Se fue sin pagar» deja lo que debe a nombre del cliente; «No consumió o fue un error» anula todo lo que pidió (al estante o a merma, con su papel «ANULAR»). La mesa queda libre. Si al sentar a alguien sale «Debe … de antes», avísale: se cobra en la caja.",
      "Cobrada (o cerrada) la última cuenta de una mesa, queda «Por limpiar» en todas las tablets. Al limpiarla, «Mesa limpia: dejarla libre». La caja y supervisión también pueden, por si se olvida.",
      "Los avisos suaves, sin sonido y una vez por mesa: la que lleva sentada sin pedir, la que espera su pedido, la que lleva rato sin pedir la cuenta desde su último pedido (también le avisa a la caja) y la que sigue por limpiar, pasados sus minutos (Ajustes → Sucursal). Si ya terminaron, «Pide la cuenta».",
      "Un cumpleaños tiene su mesa: al empezarlo se elige una libre, o aquí, en una mesa libre, «Sentar el cumpleaños de …». Lo que pidan va a su cuenta (no se abre otra), que sigue en la cola de la caja con el saldo: el representante paga una sola vez. Se cambia de mesa como cualquier cuenta.",
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
        solucion: "La cédula va con su letra (V-12345678; un RIF, J-40123456-7) y el teléfono con su código (0414-1234567). Sin los datos que pide la sucursal (Ajustes → Sucursal, «Al sentar a un cliente») la cuenta no se abre.",
        reconoce: ["faltan los datos del cliente", "documento no valido", "telefono no valido", "falta la cedula de", "falta el telefono de"],
      },
      {
        sintoma: "«Antes del segundo pedido, la cédula de …»",
        solucion: "La cuenta se sentó «Más rápido», con el nombre: el primer pedido salió y el segundo espera a la cédula. Escríbela en «Falta la cédula» (o al tocar «Tomar pedido») y vuelve a enviar: el pedido sigue en el borrador.",
        reconoce: ["antes del segundo pedido"],
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
      {
        sintoma: "«Esa cuenta ya no está abierta en esta mesa» al enviar un pedido",
        solucion: "Otro equipo la cobró o la liberó mientras pedías. El aviso trae «Sentar»: siéntala otra vez y el pedido sale solo en su cuenta nueva.",
        reconoce: ["ya no esta abierta", "vuelve a mirar la mesa"],
      },
      {
        sintoma: "«La caja está cobrando esta cuenta en partes»",
        solucion: "Ya se cobró una de las partes iguales: lo nuevo no entra en esa cuenta. El aviso trae «Abrir otra cuenta en esta mesa»: la abre con el mismo cliente y el pedido sale en ella.",
        reconoce: ["cobrando esta cuenta en partes"],
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
      "Los puestos (Caja, Parque y Mesas) se ocupan por uso: quien trabajó en uno hace poco, sea del rol que sea (también supervisión o administración). Si no, «sin actividad desde 2:10 pm», en gris; debajo, a qué hora llegó la primera persona del día. Con la caja abierta, un puesto vigilado que pasa de los minutos sin nadie avisa una vez, y no vuelve a avisar hasta que alguien vuelva. Qué puestos se vigilan y los minutos (15, de fábrica), en Ajustes → Sucursal.",
      "La Puesta a punto dice qué falta configurar; se tacha sola.",
      "De noche, «La caja sigue abierta: ciérrala antes de irte» (desde la hora de cierre del local), con lo que falta; tócalo para cerrarla. «Respaldo sin bajar»: la PC del local no baja los respaldos (en Ajustes → Sistema → Respaldos, cómo se arregla).",
      "«Por aprobar» (solo administración): lo que la caja pidió anular sin administración en el local, con la venta, quién la cobró, quién la pide, el motivo y qué se hará. «Aprobar» con tu PIN (es la autorización: la caja la hace después, sin PIN) o «Rechazar» con tu motivo. En vivo, también en tu teléfono.",
    ],
    problemas: [
      {
        sintoma: "«La caja sigue abierta: ciérrala antes de irte»",
        solucion: "Pasó la hora de cierre del local y queda una caja abierta: ciérrala con su corte Z antes de irte. La hora se cambia en Ajustes → Sucursal.",
        reconoce: ["la caja sigue abierta", "cajas siguen abiertas"],
      },
      ...GENERALES,
    ],
  },
  {
    id: "clientes",
    ruta: "/panel/clientes/directorio",
    titulo: "Clientes",
    roles: OPERACION_PARQUE,
    proposito:
      "Las familias del parque y los clientes de mesa en un solo lugar (antes, «Representantes y niños»): lo que hizo cada uno en el local, y sus datos y sus niños, corregidos aquí. La entrada, la mesa y la caja los encuentran por lo mismo.",
    pasos: [
      "Busca por el nombre, la cédula, el teléfono (desde 3 cifras) o el nombre de un niño. Los chips filtran, con cuántos hay: Todos, Familias, De mesa, Con deuda y VIP. Salen primero los que vinieron más recientemente; «Cargar más» trae los siguientes.",
      "Cada renglón: su nombre, su cédula a medias, dónde vino la última vez y cuándo, y si debe, es VIP o le falta la cédula.",
      "Tócalo para ver su ficha (en la tablet en vertical, en una hoja): sus visitas, lo gastado, lo que debe y su descuento VIP; sus niños; y «Lo que hizo en el local»: sus entradas al parque, sus mesas, sus cumpleaños y sus deudas, con lo que se cobró.",
      "«Editar datos»: el nombre, la cédula y el teléfono, con los mismos campos que la mesa y la caja. Queda en la auditoría. La cédula se anota o se corrige; no se quita. Si es la de otro cliente, lo dice: si es la misma persona, se juntan.",
      "Sus niños: «Agregar», «Corregir» (el nombre y el apodo) y retirar (el botón de la persona con el signo menos): un error, o ya no viene. Sus visitas siguen en su historia y la entrada deja de ofrecerlo; si vuelve a entrar con su nombre, vuelve a la familia. Uno que está en la sala no se retira.",
      "«Parece la misma persona»: otro cliente con el mismo nombre. «Ver» abre su ficha; «Juntar» (supervisión y administración) deja este y pasa aquí los niños, la historia y lo que debe del otro, y su cédula si este no la tiene. Buscarlo por su teléfono lleva aquí. No se deshace; con dos cédulas distintas no se juntan.",
      "El descuento VIP lo pone administración aquí mismo, con su identidad confirmada (las reglas, en Ajustes → Descuentos).",
    ],
    problemas: [
      {
        sintoma: "«Esa cédula ya es de …» al editar los datos",
        solucion: "Esa cédula es de otro cliente del directorio. Si es la misma persona que quedó dos veces, ábrelo y júntalos; si no, revisa qué cédula está mal escrita.",
      },
      {
        sintoma: "«… está en la sala ahora: retíralo cuando salga»",
        solucion: "Su salida del parque lo nombra: espera a que salga y retíralo después.",
      },
      {
        sintoma: "«Tienen cédulas distintas: no son la misma persona» al juntar",
        solucion: "Dos cédulas son dos personas, aunque se llamen igual: no se juntan. Si una cédula está mal escrita, corrígela primero en su ficha.",
      },
    ],
  },
  {
    id: "eventos",
    ruta: "/panel/parque/eventos",
    titulo: "Cumpleaños",
    roles: CAJA,
    proposito: "La agenda de los cumpleaños de los próximos tres meses: reservar, cobrar el anticipo en la caja, cambiarles la fecha y empezarlos el día del evento.",
    pasos: [
      "«Nueva reserva»: el día, el horario, el paquete, los invitados, quién cumple y su familia. El anticipo queda en la cola de la caja; el saldo se cobra el día del evento.",
      "Tres vistas: «Próximas» (la lista por día, con lo que falta por cobrar), «Mes» (el calendario: cada día con la hora y quién cumple; las flechas pasan de mes) y «Canceladas». La que elijas se recuerda en este equipo.",
      "«Cambiar fecha» (en la fila, o tocando el cumpleaños en el mes): el día y el horario nuevos con su motivo. Vale con el anticipo cobrado, hasta que empiece; el aforo del nuevo horario se comprueba como al reservar. La fila dice de qué fecha venía, el motivo y quién lo cambió.",
      "Un paquete «Exclusivo» (Ajustes → Cumpleaños) tiene el parque para él solo en su horario: no se reserva otro cumpleaños encima y la entrada no admite visitas normales mientras dura. Los demás comparten el parque: desde 30 minutos antes la entrada guarda el lugar de sus invitados.",
      "Con el anticipo por cobrar, «Cancelar» la quita de la agenda. Con el anticipo cobrado no se cancela aquí: devolverlo es anular su cobro en la caja.",
      "«Empezar el cumpleaños» elige su mesa libre del plano: su cuenta del día (el saldo y lo incluido) es la de esa mesa, y el mesero pide a ella. «Empezar sin mesa» la deja para después («Darle mesa» en el detalle del cumpleaños, en la caja o en el parque).",
    ],
    problemas: [
      {
        sintoma: "«Con los otros cumpleaños de ese horario se pasa del aforo» al cambiar la fecha",
        solucion: "El nuevo horario se cruza con otros cumpleaños y juntos pasan del aforo del parque. Elige otra hora u otro día; el calendario del mes dice qué hay cada día.",
        reconoce: ["se pasa del aforo"],
      },
      {
        sintoma: "«Un cumpleaños exclusivo no comparte el parque»",
        solucion: "Ese horario se cruza con un cumpleaños exclusivo, o el que reservas es exclusivo y ya hay otro. Elige otra hora u otro día.",
        reconoce: ["exclusivo no comparte el parque"],
      },
      {
        sintoma: "«La mesa N está ocupada: el cumpleaños toma una libre»",
        solucion: "El cumpleaños tiene su propia mesa y su cuenta. Elige una libre del plano, o empiézalo sin mesa y dale una cuando se libere.",
        reconoce: ["el cumpleanos toma una libre"],
      },
      ...GENERALES,
    ],
  },
  {
    id: "inventario",
    ruta: "/panel/inventario",
    titulo: "Inventario",
    roles: DIRECCION,
    proposito: "Los productos con su existencia, las entradas de mercancía, las salidas y el conteo: cada uno en su sección.",
    pasos: [
      "Productos: el catálogo, su existencia y la carta del mesero. Entradas de mercancía: lo que llega. Salidas y conteo: lo que sale sin venderse y el conteo físico.",
      "Nada se borra: un producto creado por error se retira (y se devuelve al catálogo); una entrada mal cargada se anula con su motivo.",
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
    id: "productos",
    ruta: "/panel/inventario/productos",
    titulo: "Productos",
    roles: DIRECCION,
    proposito: "Lo que la caja vende en el mostrador o añade a una cuenta: categoría, IVA y precio con su día, su existencia, su mínimo y su costo promedio.",
    pasos: [
      "La existencia de cada uno, su mínimo y su costo promedio. «Alta en lote» carga el catálogo en una hoja, sin cantidades.",
      "«Nuevo producto» pregunta «¿Cuántos hay?» (opcional): con un número, también 0, nace contado y se vende al momento; en blanco nace «Sin contar» y se cuenta con una entrada o un conteo. Lo da de alta administración o supervisión; cambiar el precio de uno ya creado es de administración.",
      "Tres vistas a la derecha (Tarjetas, Lista y Compacta): la Lista es la tabla, donde se eligen productos para editarlos en lote; cada persona elige la suya y se recuerda en este equipo. El estado del stock va en chips con su cuenta (Agotados, Bajo mínimo…), y sin una categoría elegida, las tarjetas y la compacta se agrupan por categoría con su nombre arriba.",
      "«Editar» en cada fila abre su ficha: los datos arriba (nombre, categoría, presentación), el precio debajo. La categoría se elige de la lista; «Escribir una nueva…» para la que no está.",
      "Uno creado por error (también en la carga inicial): en su ficha, «Retirar». Sale de la caja, la carta, la tablet y las listas de carga; si le queda existencia, se elige cómo sale. Lo autoriza administración con su PIN. Nada se borra: «Retirados» los muestra y, en su ficha, «Devolver al catálogo».",
      "Dónde se prepara cada producto (en su ficha, en «Alta en lote», en la carta o con varios elegidos): Cocina, Barra o Sin papel. Sin elegir, lo preparado va a cocina, lo de nevera a barra y un servicio sin papel.",
      "La pestaña «En la carta»: qué platos ofrece el mesero.",
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
    id: "carta",
    ruta: "/panel/inventario/productos?pestana=carta",
    titulo: "En la carta",
    roles: ["ADMIN"],
    proposito: "Qué platos ofrece el mesero en la tablet, su precio con su día (un solo sitio para el precio) y dónde se prepara.",
    pasos: [
      "Cada plato de la carta con su precio y su categoría; lo que no está en la carta no lo ve el mesero (la caja lo sigue vendiendo).",
      "Dónde se prepara: Cocina, Barra o Sin papel. La comanda de cada área sale en su impresora.",
      "Un precio nuevo rige desde su día: lo ya vendido no cambia.",
      "En la tablet, la carta abre en «Lo más pedido hoy»: los 8 platos más pedidos del día (temprano, los de la semana), solos.",
    ],
    problemas: [],
  },
  {
    id: "entradas",
    ruta: "/panel/inventario/entradas",
    titulo: "Entradas de mercancía",
    roles: DIRECCION,
    proposito: "Lo que llega, por compra o reposición: bultos de tantas unidades a tanto el bulto. Sube la existencia y da el costo promedio de cada producto.",
    pasos: [
      "Una tabla; se puede pegar desde Excel. «Inventario inicial» trae los que faltan por contar (0 si no hay). Cada fila dice la categoría y la presentación del producto, y «Ver o editar su ficha» la abre encima sin perder la lista.",
      "Una entrada mal cargada (una compra, una reposición o el inventario inicial): «Anular», con el motivo y el PIN de administración. Cada línea sale a su costo de esa entrada y el costo promedio se recalcula; queda tachada, con quién y por qué. «Cargarla de nuevo» abre una entrada con sus líneas para corregirlas.",
      "La lista abre con las vigentes de este mes. Arriba, «Vigentes», «Anuladas» o «Todas» (con cuántas hay) y el periodo: hoy, esta semana, este mes, el anterior o entre dos fechas; abajo, las páginas. Las anuladas no se borran: se ocultan, y en «Anuladas» se ven con quién y por qué.",
    ],
    problemas: [
      {
        sintoma: "«Ya salieron N desde esta entrada» al anularla",
        solucion: "De ese producto ya se vendió o se sacó algo después de la entrada: no se sabe qué parte era suya. Corrige la existencia con un conteo en Salidas y conteo.",
        reconoce: ["desde esta entrada", "no se sabe que parte era suya"],
      },
    ],
  },
  {
    id: "salidas",
    ruta: "/panel/inventario/salidas",
    titulo: "Salidas y conteo",
    roles: DIRECCION,
    proposito: "Lo que sale sin venderse (merma, consumo interno, regalo o devolución al proveedor), con su motivo y su autorización, y el conteo físico.",
    pasos: [
      "Una salida lleva su motivo; según lo que sale, la autorización de supervisión o administración.",
      "El conteo deja la existencia igual a lo contado: la hoja de conteo se imprime para contar a mano, y el informe de diferencias dice lo que no cuadró.",
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
      "Tarifas y plano se editan en borrador: nada cambia hasta «Publicar», y entonces cambia en todas las pantallas a la vez.",
      "Nada se borra: un precio nuevo rige desde su día; lo que ya no se usa se retira.",
    ],
    problemas: GENERALES,
  },
  {
    id: "tarifas",
    ruta: "/panel/ajustes/tarifas",
    titulo: "Tarifas y paquetes",
    roles: ["ADMIN"],
    proposito: "Los paquetes por tiempo del parque (nombre, duración y precio), los minutos de gracia, el aviso antes de vencer y el aforo.",
    pasos: [
      "Cada paquete: su nombre, su tipo de tiempo y su precio en dólares. El pase libre y el tiempo abierto no tienen minutos que sumar.",
      "El precio que se cobra al salir es la combinación más barata de los paquetes que cubre el tiempo real menos la gracia; el tiempo de más va en bloques del paquete más chico.",
      "«El tiempo de más» (en Reglas): «Por bloques», de fábrica, cobra cada bloque iniciado a su precio y sin tope; «Con tope», nunca más que los paquetes que cubren lo que estuvo. Cada tarjeta trae su ejemplo. Quien ya está en la sala sigue con la regla con que entró.",
      "Lo que cambies es un borrador (con «Deshacer» y «Rehacer»): la entrada lo usa cuando publiques. Quien ya está dentro sigue con el paquete con que entró.",
      "Un paquete que ya no se vende se retira; «Retirados» los muestra. Cada publicación queda como versión.",
    ],
    problemas: [],
  },
  {
    id: "cumpleanos",
    ruta: "/panel/ajustes/cumpleanos",
    titulo: "Paquetes de cumpleaños",
    roles: ["ADMIN"],
    proposito: "Los paquetes de cumpleaños (precio, invitados y lo que incluyen) y el anticipo que se cobra al reservar.",
    pasos: [
      "Cada paquete: su nombre, su precio, el mínimo y el máximo de invitados (nunca por encima del aforo) y lo que incluye (productos del catálogo: la torta, las bebidas…).",
      "«Exclusivo»: el parque es solo para ese cumpleaños en su horario.",
      "«Anticipo al reservar»: el porcentaje del paquete que se cobra en la caja al reservar (50 % de fábrica); el saldo queda para el día.",
      "Un paquete que ya no se ofrece se retira; las reservas hechas con él siguen igual.",
    ],
    problemas: [],
  },
  {
    id: "plano",
    ruta: "/panel/ajustes/plano",
    titulo: "Plano del local",
    roles: ["ADMIN"],
    proposito: "Dónde está cada mesa, su número, su zona y sus sillas, y lo que hay en el salón. El mesero lo ve al publicar.",
    pasos: [
      "Cada mesa con su número, su zona, sus sillas, su forma y su tamaño y su posición (en centímetros); las medidas del local, y la estructura (paredes, la barra) si ayuda a ubicarse.",
      "Lo que cambies es un borrador (con «Deshacer» y «Rehacer»): el salón lo ve cuando publiques.",
      "Una mesa que ya no está se retira; las cuentas de antes la siguen nombrando.",
    ],
    problemas: [],
  },
  {
    id: "medios",
    ruta: "/panel/ajustes/medios",
    titulo: "Medios de pago",
    roles: ["ADMIN"],
    proposito: "Qué se puede cobrar y con qué datos: los medios encendidos, las terminales del punto de venta, y el banco, el teléfono y el correo que la caja le enseña al cliente.",
    pasos: [
      "Cada medio se enciende o se apaga; uno no se borra (los cobros ya hechos lo citan).",
      "Pago Móvil: el banco, el teléfono y la cédula o RIF que la caja le enseña al cliente; Zelle: su titular y su correo; USDT: lo que se anota (el TxID). Sin sus datos, la caja no ofrece ese medio.",
      "«Añadir terminal»: cada punto de venta, para anotar con qué terminal se cobró y su referencia.",
    ],
    problemas: [],
  },
  {
    id: "descuentos",
    ruta: "/panel/ajustes/descuentos",
    titulo: "Descuentos",
    roles: ["ADMIN"],
    proposito: "Los descuentos que la caja puede aplicar (por medio de pago, VIP y manuales), con su alcance y su vigencia, y el tope de supervisión.",
    pasos: [
      "«Nuevo descuento»: su tipo, cuánto (porcentaje o monto), sobre qué (toda la cuenta o unas categorías) y desde y hasta cuándo. Los vigentes, los programados y los vencidos, aparte.",
      "VIP: el descuento de una familia; se le pone en Clientes, en su ficha. «Familias VIP» dice cuántas lo tienen.",
      "«Tope de supervisión» (20 % de la cuenta, de fábrica): hasta ahí lo autoriza supervisión; más, administración.",
    ],
    problemas: [],
  },
  {
    id: "tasas",
    ruta: "/panel/ajustes/tasas",
    titulo: "Tasas de cambio",
    roles: ["ADMIN"],
    proposito: "La tasa del BCV se aplica sola: aquí se ve su historial (USD/VES y USDT/VES), se confirma la que quedó retenida y se carga a mano si la fuente falla.",
    pasos: [
      "Arriba, la de hoy de cada par y la próxima. «Por confirmar»: la que se capturó pero quedó retenida (un salto fuera de lo normal): se confirma, con quién autoriza.",
      "Si la fuente falla, se carga a mano, con quién la autoriza. Sin tasa vigente, la caja no cobra en bolívares.",
      "La pestaña «Feriados bancarios»: los días sin tasa nueva del BCV.",
    ],
    problemas: [],
  },
  {
    id: "feriados",
    ruta: "/panel/ajustes/tasas?pestana=feriados",
    titulo: "Feriados bancarios",
    roles: ["ADMIN"],
    proposito: "Los feriados bancarios de cada año: en esos días rige la tasa del día hábil anterior.",
    pasos: ["«Registrar un feriado»: su nombre y su fecha. Un feriado que no aplica se retira."],
    problemas: [],
  },
  {
    id: "impuestos",
    ruta: "/panel/ajustes/impuestos",
    titulo: "Impuestos",
    roles: ["ADMIN"],
    proposito: "Los tipos de IVA con su vigencia y el porcentaje de IGTF. Se versionan por fecha: un cambio no reescribe el pasado.",
    pasos: [
      "«Lo que rige ahora» y el calendario: cada alícuota con desde cuándo.",
      "«Programar un cambio»: la alícuota nueva y su fecha; rige sola desde ese día. Pide confirmar tu identidad: mueve lo que cobra el negocio.",
    ],
    problemas: [],
  },
  {
    id: "sucursal",
    ruta: "/panel/ajustes/sucursal",
    titulo: "Sucursal",
    roles: ["ADMIN"],
    proposito: "Los datos del local, su horario y cómo opera: el formato de hora, el día de negocio, cómo se sienta a un cliente, los avisos del salón y la caja.",
    pasos: [
      "Los datos fiscales, la dirección, el teléfono y el horario de cada día (pueden faltar: no bloquean nada). Al publicar, todas las pantallas cambian a la vez.",
      "«Al sentar a un cliente en una mesa»: «Más seguro» (de fábrica: nombre y cédula antes del primer pedido) o «Más rápido» (el nombre; la cédula antes del segundo pedido y antes de cobrar; si se van después del primer pedido, la deuda queda con el nombre). El teléfono: «Siempre» o «Solo si queda una deuda» (al sentar es opcional; una venta que queda pendiente lo pide). En los dos, el que ya vino se llena solo.",
      "«Hora de cierre del local» (10:00 pm de fábrica): desde ahí y hasta que el día termina, Inicio y la caja avisan si la caja sigue abierta. Si el horario declara el cierre de un día, manda el horario.",
      "«El día termina» (4:00 am de fábrica, de las 12:00 am a las 10:00 am): lo cobrado antes sigue siendo del día que se trabaja; desde esa hora, la caja que siga abierta pide cerrarse. Como la zona horaria, se cambia sin turnos abiertos.",
      "Los avisos del salón: los minutos sin pedir, esperando el pedido, pidiendo la cuenta, por limpiar y sin pedir la cuenta, y «¿Ya se sirvió todo? (min)»: al pedir la cuenta, pregunta solo por los platos de más de esos minutos.",
      "La caja: lo que puede quedarse de vuelto, el tope de «Mover efectivo» sin supervisión, si los precios llevan el IVA dentro y con qué arranca «Imprimir recibo». El parque: la serie de las pulseras y el producto de medias.",
    ],
    problemas: [],
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
      "Principal y respaldo: una impresora puede ser «Respaldo de otra» (la misma por red y por USB, o una segunda). Lo de la principal sale por el respaldo cuando no responde, una vez, y se avisa; sin papel no cambia de camino (el rollo es el mismo): queda «no salió» y «Reintentar» lo saca una vez cuando vuelva. L2 sugiere la de red como principal, porque pregunta por el papel antes de mandar. «Hacer principal», en el respaldo, las cambia de una vez: lo siguiente sale por ella.",
      "El estado de cada una (lista, poco papel, sin papel, no responde) lo dice el agente cada 30 s: por red, preguntándole; por USB, a Windows, y si un trabajo se queda más de 15 s en la cola de Windows se saca de ahí para que no salga dos veces. La barra de la caja dice «Impresora sin papel» con sonido, y la tablet, «Las comandas no están saliendo».",
      "Agente: se descarga, se vincula con un código de un solo uso y queda instalado en la laptop de caja.",
      "El agente se actualiza solo: cuando el sistema trae otra versión, la baja, comprueba su huella y se cambia con la cola vacía. Aquí se ve su versión y la disponible; «Actualizar ahora» no espera a su próxima revisión.",
      "Cola e historial: lo que salió, lo que espera y lo que falló, con «Reintentar» o «Descartar». Se ven los 50 más recientes; «Cargar más · 50 de N» trae los siguientes y dice cuántos faltan. En Tarjetas o Compacta, por día.",
    ],
    problemas: [
      {
        sintoma: "El agente de impresión sigue en una versión vieja",
        solucion:
          "Revisa la versión cada 30 minutos y se cambia solo con la cola vacía. Si una descarga falló por la red, lo vuelve a intentar en la siguiente revisión. Para no esperar, «Actualizar ahora» en su tarjeta; la laptop tiene que estar encendida y en la red.",
        reconoce: ["no se pudo descargar"],
      },
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
      "«Fondo fijo» (el botón de las monedas, en un punto de cobro): apagado de fábrica. Encendido, con su monto en $ y en Bs, el cierre propone dejar ese fondo y retirar el resto, y la apertura se cuenta por billete: si falta o sobra de lo que quedó, lo dice y queda a nombre de quien abre. Apagado, como siempre.",
    ],
    problemas: [
      {
        sintoma: "«El fondo fijo es de un punto de cobro»",
        solucion: "Marca primero el equipo como punto de cobro (el botón de la cartera) y después ponle su fondo fijo.",
        reconoce: ["el fondo fijo es de un punto de cobro"],
      },
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
      "Lo que pasó en un periodo, de solo lectura y sacado de los asientos: las ventas, el inventario al momento, los movimientos (y el kárdex), las deudas de clientes, el parque y el consumo del personal, cada uno con su PDF.",
    pasos: [
      "Elige el periodo (hoy, ayer, esta semana, este mes o el anterior) o un rango de hasta 93 días.",
      "«PDF» abre la hoja para imprimir: en el diálogo del navegador, elige la impresora o «Guardar como PDF».",
    ],
    problemas: [
      {
        sintoma: "«Hasta 93 días: parte el periodo»",
        solucion: "Un informe cabe en un trimestre. Pide el periodo en dos o más partes.",
        reconoce: ["93 dias", "parte el periodo"],
      },
    ],
  },
  {
    id: "reporte-ventas",
    ruta: "/panel/reportes/ventas",
    titulo: "Reportes · Ventas",
    roles: DIRECCION,
    proposito: "Lo vendido y lo cobrado de un día o de un rango: por medio de pago y moneda, por origen y por cajera y turno, con lo anulado aparte. Cuadra con los cierres Z.",
    pasos: [
      "Elige el periodo y, si quieres, una cajera. Arriba, lo vendido, lo cobrado en dólares con la tasa de cada cobro, lo anulado y los cierres Z; debajo, una pestaña por sección.",
      "Por turno marca el que se abrió fuera del punto de cobro, con quién lo autorizó.",
    ],
    problemas: [
      {
        sintoma: "Un turno sale «No cuadra con su Z»",
        solucion:
          "Lo que hoy dicen los asientos de ese turno no es lo que dejó escrito su cierre Z; debajo dice qué no cuadra. Repórtalo desde la ayuda con el día y el punto.",
        reconoce: ["no cuadra"],
      },
    ],
  },
  {
    id: "reporte-inventario",
    ruta: "/panel/reportes/inventario",
    titulo: "Reportes · Inventario al momento",
    roles: DIRECCION,
    proposito: "Lo que hay a esta hora y lo que vale al costo, por categoría y producto.",
    pasos: ["Las cifras de arriba filtran lo agotado, lo bajo mínimo y lo sin contar."],
    problemas: [],
  },
  {
    id: "reporte-movimientos",
    ruta: "/panel/reportes/movimientos",
    titulo: "Reportes · Movimientos",
    roles: DIRECCION,
    proposito: "Todo lo que pasó en el periodo (caja, parque, mesas, inventario y personal), con su búsqueda y el detalle de cada fila; y el kárdex de un producto o una categoría.",
    pasos: [
      "Cobros, devoluciones, anulaciones y turnos; entradas, salidas y recargas del parque; sentar, pedidos y cierres de mesas; inventario y personal: con quién y cuándo, los más nuevos primero.",
      "Busca por orden, cliente, cédula, pulsera, persona o monto, o elige una parte del local; toca lo que pasó para ver su detalle (una venta, entera: sus líneas, sus pagos, la tasa y quién cobró). Se ven los 50 más nuevos y «Cargar más» trae los siguientes; en Tarjetas o Compacta, agrupados por día.",
      "«Kárdex de inventario»: elige un producto o una categoría; cada entrada, venta, salida y conteo sale con su saldo.",
    ],
    problemas: [],
  },
  {
    id: "reporte-deudas",
    ruta: "/panel/reportes/deudas",
    titulo: "Reportes · Deudas",
    roles: DIRECCION,
    proposito: "Quien se fue sin pagar: lo que quedó en deuda, lo recuperado y lo perdido, por mesero (quien sentó al cliente) y por quien autorizó.",
    pasos: ["Toca el número de orden para ver su historia, de la mesa al desenlace; el PDF lleva la de todas, con la cédula y el teléfono del cliente."],
    problemas: [],
  },
  {
    id: "reporte-parque",
    ruta: "/panel/reportes/parque",
    titulo: "Reportes · Parque",
    roles: DIRECCION,
    proposito: "El parque de un periodo, de un vistazo: cuándo viene la gente, qué se vende, de dónde sale el dinero y qué cambió contra el periodo anterior.",
    pasos: [
      "Abre en «De un vistazo»: arriba los niños, el dinero del parque, el promedio por niño, la estancia y el pico, cada uno con su diferencia contra el periodo anterior (hasta una semana, la semana anterior; un mes, el mes anterior; lo dice el renglón del periodo).",
      "Debajo, cuándo viene la gente (por hora, y un mapa de día de la semana por hora: más intenso, más niños), de dónde sale el dinero (en una barra; lo pagado en mesas y lo regalado, aparte), qué se vende (cada paquete con su parte) y cuántas excepciones hay, con «Ver el detalle».",
      "En las pestañas, el detalle: los niños por día y por hora de entrada con el aforo pico; el dinero del tiempo (paquetes, recargas y tiempo de más, y cuánto de eso se pagó en mesas, con lo regalado aparte); las estancias (tiempo promedio sin las pausas por comida, salidas antes de tiempo, cobradas por uso) y las excepciones (sin pulsera, a revisar, recogidos por otra persona, medias).",
      "El PDF lleva lo mismo. El cierre del día de la monitora, sin montos, es otro: Parque → Cierre del parque.",
    ],
    problemas: [],
  },
  {
    id: "reporte-personal",
    ruta: "/panel/reportes/personal",
    titulo: "Reportes · Personal",
    roles: DIRECCION,
    proposito: "Lo que consumió cada persona del equipo en la quincena, vale por vale, y sus adelantos en efectivo.",
    pasos: [
      "La quincena: esta o la anterior. Cada persona con lo que consumió y cada vale, sin lo anulado ni lo devuelto, y si ya se marcó «Descontado» (cuándo y quién).",
      "Es para descontarlo del sueldo, fuera del sistema.",
    ],
    problemas: [],
  },
  {
    id: "sistema",
    ruta: "/panel/ajustes/sistema",
    titulo: "Versión y actualizaciones",
    roles: ["ADMIN"],
    proposito: "La versión en marcha y las nuevas: ponerla ahora o al cierre, con sus novedades.",
    pasos: [
      "«En marcha»: la versión de ahora. «Disponible»: la nueva, con sus novedades. Se pide ponerla ahora o al cierre del día; «Actualización pedida» dice la que espera.",
      "Mientras se actualiza, la app se corta un minuto; lo que se estaba haciendo se vuelve a intentar.",
    ],
    problemas: [],
  },
  {
    id: "respaldos",
    ruta: "/panel/ajustes/sistema?pestana=respaldos",
    titulo: "Respaldos",
    roles: ["ADMIN"],
    proposito: "El respaldo de cada noche, si la PC del local ya lo bajó y el ensayo de restauración de la semana.",
    pasos: [
      "«Último respaldo»: si se hizo el de anoche; «Fuera del servidor»: si la PC del local ya lo bajó y su huella cuadró. La PC se prepara (o se cambia, «Cambiar de PC») desde aquí: da una orden para pegar en PowerShell de esa PC y una credencial.",
      "«Respaldar ahora» (con tu identidad confirmada) pide uno al momento: el servidor lo hace en el minuto siguiente y ahí mismo dice si se hizo o por qué no. Hecho, quita el aviso de «no se hizo el respaldo de anoche».",
      "«Fijar este respaldo»: con su nombre, nada lo borra (los demás se van retirando solos). «Ensayo de restauración»: cada semana el servidor restaura uno en una base de usar y tirar y dice si salió íntegro.",
      "Si la PC no baja los respaldos, Inicio y el turno (al abrirlo y al cerrarlo) lo avisan a administración y supervisión, con cómo se arregla.",
    ],
    problemas: [
      {
        sintoma: "«La PC … no baja los respaldos desde el …»",
        solucion:
          "Enciende esa PC y entra con el usuario de Windows que la preparó; en el menú Inicio, «Programador de tareas», busca «L2 Control - Respaldos», botón derecho y «Ejecutar». Si falla, prepárala otra vez aquí, «Cambiar de PC». El aviso se quita solo cuando baja el de anoche.",
        reconoce: ["no baja los respaldos", "respaldo sin bajar"],
      },
    ],
  },
  {
    id: "semilla",
    ruta: "/panel/ajustes/sistema?pestana=semilla",
    titulo: "Semilla del local",
    roles: ["ADMIN"],
    proposito: "Llevar la configuración de un local a otro en un archivo: los ajustes de la sucursal, los impuestos, los medios, las tarifas, las categorías, la carta y los productos, los descuentos, el plano, los cumpleaños y las impresoras. Sin ventas ni clientes.",
    pasos: [
      "«Descargar la de este local»: marca lo que lleva y «Descargar lo marcado».",
      "«Cargar una semilla»: elige el archivo; dice qué trae y qué ya está, y «Cargar lo marcado» suma lo elegido.",
    ],
    problemas: [],
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

/**
 * La entrada del manual de una ruta (con su búsqueda, «?pestana=…», si la tiene): la de ruta más larga que la contenga. Una
 * entrada que pide una pestaña o una vista vale solo con ella (T-26); la de la sección vale para su primera pestaña.
 */
export function entradaDe(ruta: string): EntradaDelManual | null {
  const [camino = "", busqueda = ""] = ruta.split("?");
  const params = new URLSearchParams(busqueda);
  let mejor: EntradaDelManual | null = null;
  for (const e of MANUAL) {
    const [suCamino = "", suBusqueda] = e.ruta.split("?");
    const enCamino = camino === suCamino || camino.startsWith(`${suCamino}/`);
    const enVista = !suBusqueda || [...new URLSearchParams(suBusqueda)].every(([k, v]) => params.get(k) === v);
    if (enCamino && enVista && (!mejor || e.ruta.length > mejor.ruta.length)) mejor = e;
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
