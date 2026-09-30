/**
 * Leer un código de barras o QR de un fotograma de vídeo — B4-5, V-2.
 *
 * Primero el lector del propio navegador (`BarcodeDetector`: Chrome en Android, el teléfono del
 * local); si no lo trae (Chrome de escritorio, Safari viejo), el de @zxing, que es JavaScript puro:
 * no descarga nada de fuera ni necesita wasm, y solo se carga si hace falta.
 *
 * Solo lee: lo leído se entrega al bus del lector (`leerCodigo`), que lo valida como cualquier
 * lectura de teclado. Este módulo no sabe qué es una pulsera.
 */

/** Los formatos que puede traer una pulsera preimpresa: QR o código de barras (D-PUL). */
const FORMATOS_NATIVOS = ["qr_code", "code_128", "code_39", "ean_13", "itf", "data_matrix"] as const;

/** Lo mínimo de la API del navegador que se usa (no está en las definiciones de TypeScript). */
interface DetectorNativo {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface ConstructorNativo {
  new (opciones: { formats: string[] }): DetectorNativo;
  getSupportedFormats(): Promise<string[]>;
}

export interface Decodificador {
  /** Qué lector se usa, para decirlo en pantalla y en las pruebas. */
  readonly tipo: "NATIVO" | "RESPALDO";
  /** El código del fotograma actual, o `null` si no hay ninguno legible. */
  leer(video: HTMLVideoElement): Promise<string | null>;
}

async function nativo(): Promise<Decodificador | null> {
  const Ctor = (globalThis as { BarcodeDetector?: ConstructorNativo }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const soportados = await Ctor.getSupportedFormats();
    const formatos = FORMATOS_NATIVOS.filter((f) => soportados.includes(f));
    if (formatos.length === 0) return null;
    const detector = new Ctor({ formats: [...formatos] });
    return {
      tipo: "NATIVO",
      async leer(video) {
        const r = await detector.detect(video);
        return r[0]?.rawValue ?? null;
      },
    };
  } catch {
    return null;
  }
}

/** Lado mayor del fotograma que se decodifica: más, y el teléfono se calienta sin leer mejor. */
const LADO_MAXIMO = 720;

async function respaldo(): Promise<Decodificador> {
  const zx = await import("@zxing/library");
  const lector = new zx.MultiFormatReader();
  const pistas = new Map<number, unknown>();
  pistas.set(zx.DecodeHintType.POSSIBLE_FORMATS, [
    zx.BarcodeFormat.QR_CODE,
    zx.BarcodeFormat.CODE_128,
    zx.BarcodeFormat.CODE_39,
    zx.BarcodeFormat.EAN_13,
    zx.BarcodeFormat.ITF,
    zx.BarcodeFormat.DATA_MATRIX,
  ]);
  pistas.set(zx.DecodeHintType.TRY_HARDER, true);
  lector.setHints(pistas);
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  return {
    tipo: "RESPALDO",
    async leer(video) {
      if (!ctx || video.videoWidth === 0) return null;
      const escala = Math.min(1, LADO_MAXIMO / Math.max(video.videoWidth, video.videoHeight));
      const ancho = Math.round(video.videoWidth * escala);
      const alto = Math.round(video.videoHeight * escala);
      lienzo.width = ancho;
      lienzo.height = alto;
      ctx.drawImage(video, 0, 0, ancho, alto);
      const { data } = ctx.getImageData(0, 0, ancho, alto);
      // Luminancia (Rec. 601) de cada píxel: lo único que necesita el decodificador.
      const luz = new Uint8ClampedArray(ancho * alto);
      for (let i = 0, j = 0; j < luz.length; i += 4, j++) luz[j] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
      try {
        const bitmap = new zx.BinaryBitmap(new zx.HybridBinarizer(new zx.RGBLuminanceSource(luz, ancho, alto)));
        return lector.decodeWithState(bitmap).getText();
      } catch {
        // Ningún código en este fotograma: lo normal mientras se apunta.
        return null;
      } finally {
        lector.reset();
      }
    },
  };
}

/** El mejor decodificador disponible en este navegador. */
export async function crearDecodificador(): Promise<Decodificador> {
  return (await nativo()) ?? (await respaldo());
}
