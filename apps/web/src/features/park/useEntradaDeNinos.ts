"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckInCommandSchema,
  GuardianSchema,
  WristbandCodeSchema,
  type CatalogoDto,
  type FamilyAccountDto,
  type PaymentMode,
  type EstanciaDto,
  type RepresentanteEncontradoDto,
} from "@l2/contracts";
import { sum, zero, type Money } from "@l2/domain-money";
import { computeCapacity, contactKey, documentKey } from "@l2/domain-park";
import { problemaDelDocumento } from "../clientes/escritura.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { productosALaVenta, type ProductoALaVenta } from "../inventario/catalogo.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { buscarRepresentante, consultarPulsera, registrarEntrada } from "./parque.acciones";
import { toMoney } from "./mappers.ts";
import { useSala } from "./SalaProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useTarifario } from "./TarifarioProvider";

/**
 * La lógica de la entrada al parque — F5-02 a F5-04, B4-2, B3-9 (M-31).
 *
 * La usa la entrada en capa (`EntradaEnCapa`), la del parque y la de la caja (B4-12): las pulseras que crean cada
 * fila, el niño sin pulsera, el paquete más común ya elegido, las medias de quien no las trae, el representante
 * buscado por su cédula (T-19) o, si no la tenía, por su teléfono, y el registro en el servidor, que pone el precio del tarifario, comprueba el aforo y las
 * pulseras con lo que hay en sala y abre la cuenta de la familia. Lo que se calcula aquí (total, aforo) es un anticipo
 * para quien atiende; manda el servidor. Cada pantalla pone su forma; la lógica vive una vez.
 */

export type Entrada = {
  uid: string;
  /** La pulsera leída; vacío en un niño sin pulsera (B4-8), cuyo código lo pone el servidor. */
  wristbandCode: string;
  /** Un niño que no tolera la pulsera (B4-8, P-1): entra sin ella y su nombre es obligatorio. */
  sinPulsera: boolean;
  packageId: string;
  /** Opcional (DEC-28): vacío, el niño entra solo con su pulsera. Sin pulsera, obligatorio. */
  nombre: string;
  /**
   * Si compra el par de medias de seguridad (B4-9, P-6; B4-16, M-35): un interruptor, apagado de entrada; encendido, el
   * par va a la cuenta de la familia. Quien lo deja apagado las trae: al registrar se confirma una vez por todos.
   */
  compraMedias: boolean;
};

/** Un nombre como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
const claveDeNombre = (n: string) =>
  n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

const NUEVO_UID = () => globalThis.crypto.randomUUID();

/** Dígitos que hacen falta para buscar a una familia: un teléfono entero, no un pedazo. */
const DIGITOS_PARA_BUSCAR = 7;
/** Y por la cédula: de 6 dígitos en adelante (una a medias no busca a nadie). */
const DIGITOS_DE_CEDULA_PARA_BUSCAR = 6;

export type Registrada = Readonly<{ cuenta: FamilyAccountDto; sessions: readonly EstanciaDto[]; total: Money }>;

export function useEntradaDeNinos({
  catalogo,
  alPrimeraPulsera,
}: {
  /** El catálogo, para las medias de quien no las trae (B4-9). */
  catalogo?: CatalogoDto | undefined;
  /** Tras la primera pulsera, con la cédula vacía: la pantalla pone el foco en ella. */
  alPrimeraPulsera?: () => void;
} = {}) {
  const { sala, adoptar: adoptarEstancias } = useSala();
  const activeSessions = sala?.sessions.length ?? 0;
  /**
   * Códigos con una estancia ya activa. Las pulseras son desechables (§6.6),
   * así que esto no impide «reutilizar» nada: impide escanear dos veces la
   * misma pulsera que ya está puesta a un niño en sala (I-04). El servidor lo vuelve a mirar.
   */
  const occupiedWristbands = useMemo(() => sala?.sessions.map((s) => s.wristbandCode) ?? [], [sala]);
  const { tarifario, publicado } = useTarifario();
  const paquetesActivos = useMemo(() => tarifario.packages.filter((p) => p.active), [tarifario.packages]);
  const defaultPackageId = paquetesActivos.find((p) => p.id === "pkg-60")?.id ?? paquetesActivos[0]?.id ?? "";
  const capacityLimit = tarifario.policy.capacityLimit;
  const { productoMedias } = useSucursal().ajustes;
  /**
   * Las medias de quien no las trae (B4-9, P-6): el producto que eligió la sucursal, con su precio de ahora y cuántas
   * quedan. Sin producto elegido, la entrada no pregunta.
   */
  const ahoraMedias = useAhoraLocal();
  const medias: ProductoALaVenta | null = useMemo(
    () => (productoMedias && catalogo && ahoraMedias > 0 ? (productosALaVenta(catalogo, ahoraMedias).find((p) => p.id === productoMedias) ?? null) : null),
    [productoMedias, catalogo, ahoraMedias],
  );

  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** La clave de este intento: un reintento tras un corte no registra dos veces (I-11). */
  const clave = useRef<string | null>(null);
  const { adoptar: adoptarCuenta } = useCuentas();

  const capacidad = computeCapacity(activeSessions + entradas.length, capacityLimit);

  /* ----------------------------------------------------- representante */

  // T-19: la cédula es lo primero; con ella se reconoce a la familia que vuelve. Si no está (un representante de antes
  // de la cédula), se busca por el teléfono, como en F5-03. Lo busca el servidor con el dato entero: nadie recorre el
  // directorio tecleando pedazos.
  const cedulaKey = documentKey(cedula);
  const cedulaValida = cedula.trim() !== "" && problemaDelDocumento(cedula) === null;
  const llaveCedula = cedulaValida && cedulaKey && cedulaKey.length > DIGITOS_DE_CEDULA_PARA_BUSCAR ? `c:${cedulaKey}` : null;
  const llave = contactKey(telefono);
  const llaveTelefono = llave !== null && llave.length >= DIGITOS_PARA_BUSCAR ? `t:${llave}` : null;
  const [buscadas, setBuscadas] = useState<ReadonlyMap<string, RepresentanteEncontradoDto | null>>(new Map());
  const pendiente = [llaveCedula, llaveTelefono].find((k): k is string => k !== null && !buscadas.has(k)) ?? null;
  useEffect(() => {
    if (!pendiente) return;
    const consulta = pendiente.startsWith("c:") ? { documento: cedula } : { contacto: telefono };
    const id = window.setTimeout(() => {
      void buscarRepresentante(consulta)
        .then((r) => {
          if (r.ok) setBuscadas((m) => new Map(m).set(pendiente, r.valor));
        })
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(id);
  }, [pendiente, cedula, telefono]);
  const porCedula = llaveCedula ? buscadas.get(llaveCedula) : undefined;
  const porTelefono = llaveTelefono ? buscadas.get(llaveTelefono) : undefined;
  /** Un teléfono de otra persona que ya tiene su cédula, y no es esta: no se le pega la entrada (T-19). */
  const telefonoDeOtro = porCedula === null && porTelefono?.tieneCedula === true ? porTelefono : null;
  /** Por la cédula manda; si no está, por el teléfono (una familia de antes, sin cédula). */
  const encontrado = porCedula ?? (llaveCedula === null || porCedula === null ? (telefonoDeOtro ? null : (porTelefono ?? null)) : null);
  /** Encontrada por la cédula: el teléfono ya lo tiene el directorio. */
  const porSuCedula = Boolean(porCedula);
  const esNuevo = !encontrado && !telefonoDeOtro && porCedula === null && porTelefono === null;
  /** A la familia de antes, sin cédula, se le pide y se le anota al registrar. */
  const faltaSuCedula = encontrado !== null && !encontrado.tieneCedula && !cedulaValida;

  /**
   * Su familia en la sala (B4-12, M-34): si el representante encontrado tiene niños dentro, el que llega después se suma
   * a esa cuenta, con su propio tiempo desde que entra, y sale con ella. Se ofrece marcado; se puede desmarcar.
   */
  const { cuentas } = useCuentas();
  const familiaEnSala = useMemo(() => {
    if (!encontrado) return null;
    const suyas = sala?.sessions.filter((s) => s.guardianId === encontrado.id) ?? [];
    const cuenta = cuentas.find((c) => c.kind === "FAMILIA" && suyas.some((s) => s.accountId === c.id));
    if (!cuenta) return null;
    return { accountId: cuenta.id, familia: cuenta.family, mode: cuenta.mode, ninos: suyas.filter((s) => s.accountId === cuenta.id).length };
  }, [encontrado, sala, cuentas]);
  const [sumar, setSumar] = useState(true);
  const sumarA = familiaEnSala && sumar ? familiaEnSala.accountId : null;

  /* ------------------------------------------------------------ escaneo */

  /** Suma la fila de una pulsera leída o tecleada. Devuelve si la sumó (si no, el aviso dice por qué). */
  const agregarPulsera = useCallback(
    (code: string): boolean => {
      const parsed = WristbandCodeSchema.safeParse(code);
      if (!parsed.success) {
        setAviso(`Código no reconocido: ${code}`);
        return false;
      }
      const limpio = parsed.data;

      if (occupiedWristbands.includes(limpio)) {
        // I-04: un código no puede tener dos estancias activas a la vez.
        setAviso(`La pulsera ${limpio} ya está activa en sala`);
        return false;
      }
      if (entradas.some((e) => e.wristbandCode === limpio)) {
        setAviso(`La pulsera ${limpio} ya está en esta lista`);
        return false;
      }
      if (activeSessions + entradas.length >= capacityLimit) {
        // F5-03b: el aforo avisa ANTES de permitir un check-in más.
        setAviso(`Aforo completo (${capacityLimit}). No se puede registrar a nadie más`);
        return false;
      }

      const uid = NUEVO_UID();
      setEntradas((prev) => [...prev, { uid, wristbandCode: limpio, sinPulsera: false, packageId: defaultPackageId, nombre: "", compraMedias: false }]);
      setAviso(null);
      // V-1: el servidor dice ya si la pulsera se usó en otra visita o no es de la serie; la fila
      // se quita en vez de descubrirlo al registrar. Sin respuesta, lo comprueba la entrada.
      void consultarPulsera({ codigo: limpio })
        .then((r) => {
          if (!r.ok || r.valor.estado === "LIBRE") return;
          setEntradas((prev) => prev.filter((x) => x.uid !== uid));
          setAviso(r.valor.mensaje);
        })
        .catch(() => undefined);
      // El foco salta solo a la cédula tras la primera pulsera si está vacía (T-19).
      if (entradas.length === 0 && !cedula) queueMicrotask(() => alPrimeraPulsera?.());
      return true;
    },
    [entradas, occupiedWristbands, activeSessions, capacityLimit, defaultPackageId, cedula, alPrimeraPulsera],
  );

  /**
   * Un niño que no tolera la pulsera (B4-8, P-1): entra sin ella. Se le reconoce por su nombre, que se pide en el
   * acto; el código (SP-…) lo pone el servidor al registrar. Devuelve el `uid` de su fila (para el foco), o `null`.
   */
  function anadirSinPulsera(): string | null {
    if (activeSessions + entradas.length >= capacityLimit) {
      setAviso(`Aforo completo (${capacityLimit}). No se puede registrar a nadie más`);
      return null;
    }
    const uid = NUEVO_UID();
    setEntradas((prev) => [...prev, { uid, wristbandCode: "", sinPulsera: true, packageId: defaultPackageId, nombre: "", compraMedias: false }]);
    setAviso(null);
    // Cuando su fila ya está pintada (en una capa recién abierta, después de que la capa toma el foco).
    window.setTimeout(() => document.getElementById(`nombre-${uid}`)?.focus(), 80);
    return uid;
  }

  const validarPulsera = useCallback((code: string) => WristbandCodeSchema.safeParse(code).success, []);

  const actualizar = (uid: string, patch: Partial<Entrada>) => setEntradas((prev) => prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));

  const quitar = (uid: string) => setEntradas((prev) => prev.filter((e) => e.uid !== uid));

  /* -------------------------------------------------------------- total */

  const total = useMemo(() => {
    const precios = entradas.map((e) => {
      const p = tarifario.packages.find((x) => x.id === e.packageId);
      return p ? toMoney(p.price) : zero("USD");
    });
    // Las medias de quien las compra también se cobran (B4-9, B4-16).
    const deMedias = medias ? entradas.filter((e) => e.compraMedias).map(() => medias.precio) : [];
    return sum([...precios, ...deMedias], "USD");
  }, [entradas, tarifario.packages, medias]);
  /** Cuántos pares se compran. */
  const paresQueFaltan = medias ? entradas.filter((e) => e.compraMedias).length : 0;
  /**
   * B4-16 (M-35): sin medias en existencia, el niño entra y no se cobran. `mediasAgotadas`: no queda otro par que dar
   * (los interruptores apagados ya no se encienden); `sinMedias`: no queda ninguno.
   */
  const mediasAgotadas = medias !== null && medias.existencia !== null && paresQueFaltan >= medias.existencia;
  const sinMedias = medias !== null && medias.existencia !== null && medias.existencia <= 0;
  /** Los que dejan las medias apagadas: al registrar, una confirmación por todos de que las traen. Sin medias, nada. */
  const mediasPorConfirmar = medias && !sinMedias ? entradas.filter((e) => !e.compraMedias).length : 0;

  /* ------------------------------------------------------------- envío */

  const telefonoValido = GuardianSchema.shape.contactReference.safeParse(telefono).success;
  const representanteListo = encontrado ? !faltaSuCedula : esNuevo && cedulaValida && telefonoValido && nombreNuevo.trim().length >= 2;
  const puedeEnviar = entradas.length > 0 && representanteListo && !capacidad.isFull && !enviando;
  /** §8.7: el motivo por el que el botón está deshabilitado se dice, no se deja adivinar. */
  const porQueNo =
    puedeEnviar || enviando || entradas.length === 0
      ? null
      : capacidad.isFull
        ? "Aforo completo"
        : faltaSuCedula
          ? `Falta la cédula de ${encontrado!.fullName}`
          : !cedula.trim()
            ? "Falta la cédula del representante"
            : !cedulaValida
              ? "Escribe la cédula completa"
              : llaveCedula && porCedula === undefined
                ? "Buscando a la familia…"
                : telefonoDeOtro
                  ? `Ese teléfono es de ${telefonoDeOtro.fullName}, con otra cédula`
                  : !telefonoValido
                    ? "Falta el teléfono del representante"
                    : !llaveTelefono
                      ? "Escribe el teléfono completo"
                      : porTelefono === undefined
                        ? "Buscando a la familia…"
                        : "Falta el nombre del representante";

  /**
   * El niño de una fila: uno que la familia ya tiene en el directorio (por su nombre), uno nuevo con
   * el nombre escrito, o ninguno todavía (DEC-28).
   */
  function ninoDe(nombre: string): { id: string } | { name: string } | Record<string, never> {
    const limpio = nombre.trim();
    if (!limpio) return {};
    const conocido = encontrado?.kids.find(
      (k) => claveDeNombre(k.name) === claveDeNombre(limpio) || (k.nickname && claveDeNombre(k.nickname) === claveDeNombre(limpio)),
    );
    return conocido ? { id: conocido.id } : { name: limpio };
  }

  /** Vuelve a empezar: la lista, la familia y el aviso. */
  function limpiar() {
    setEntradas([]);
    setCedula("");
    setTelefono("");
    setNombreNuevo("");
    setSumar(true);
    // Lo buscado se olvida: la familia que acaba de entrar ya no es «nueva» (B4-12).
    setBuscadas(new Map());
    setAviso(null);
  }

  /**
   * Registra la entrada en el servidor. Con éxito, la sala y la caja de este equipo la ven al momento (los demás, por
   * el canal en vivo, B5-1), la lista se limpia y devuelve la cuenta de la familia; si no, el aviso lo dice y devuelve
   * `null`.
   */
  async function registrar(modo: PaymentMode): Promise<Registrada | null> {
    clave.current ??= NUEVO_UID();
    // El mismo contrato que validará el servidor. Si algo no cuadra, se ve
    // aquí y no en un 400 sin explicación (ADR-017).
    const comando = {
      idempotencyKey: clave.current,
      paymentMode: modo,
      entries: entradas.map((e) => ({
        ...(e.sinPulsera ? { sinPulsera: true as const } : { wristbandCode: e.wristbandCode }),
        ...(medias && e.compraMedias ? { sinMedias: true as const } : {}),
        kid: ninoDe(e.nombre),
        packageId: e.packageId,
      })),
      ...(encontrado
        ? { guardianId: encontrado.id }
        : {
            guardian: {
              fullName: nombreNuevo.trim(),
              contactReference: telefono.trim(),
            },
          }),
      // La cédula (T-19): con la familia nueva y con la de antes que no la tenía. Si ya la tiene, va igual: el
      // servidor comprueba que sea la suya.
      ...(cedulaValida ? { guardianDocument: cedula } : {}),
      // Sumar a la familia (B4-12): a su cuenta; cómo paga es el de esa cuenta.
      ...(sumarA ? { sumarA } : {}),
    };

    const resultado = CheckInCommandSchema.safeParse(comando);
    if (!resultado.success) {
      setAviso(resultado.error.issues[0]?.message ?? "Faltan datos por completar");
      return null;
    }

    setEnviando(true);
    const r = await registrarEntrada(resultado.data).catch(() => null);
    setEnviando(false);
    if (!r) {
      // La clave se guarda: al reintentar, si el servidor ya la registró, devuelve la misma.
      setAviso("Sin conexión con el servidor: la entrada no se registró. Vuelve a intentarlo.");
      return null;
    }
    if (!r.ok) {
      clave.current = null;
      setAviso(r.mensaje);
      return null;
    }

    clave.current = null;
    const { account: cuenta, sessions } = r.valor;
    // La sala y la caja lo ven al momento en este equipo; los demás, por el canal en vivo (B5-1).
    adoptarEstancias(sessions);
    adoptarCuenta(cuenta);
    const registrada = { cuenta, sessions, total };
    limpiar();
    return registrada;
  }

  return {
    publicado,
    paquetesActivos,
    capacityLimit,
    capacidad,
    medias,
    entradas,
    setEntradas,
    aviso,
    setAviso,
    cedula,
    setCedula,
    telefono,
    setTelefono,
    nombreNuevo,
    setNombreNuevo,
    encontrado,
    familiaEnSala,
    sumar,
    setSumar,
    sumarA,
    mediasPorConfirmar,
    porSuCedula,
    faltaSuCedula,
    telefonoDeOtro,
    esNuevo,
    enviando,
    setEnviando,
    clave,
    agregarPulsera,
    anadirSinPulsera,
    validarPulsera,
    actualizar,
    quitar,
    total,
    paresQueFaltan,
    mediasAgotadas,
    sinMedias,
    puedeEnviar,
    porQueNo,
    limpiar,
    registrar,
    adoptarEstancias,
    adoptarCuenta,
  };
}

export type EntradaDeNinos = ReturnType<typeof useEntradaDeNinos>;
