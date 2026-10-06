"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Fingerprint, HardDriveDownload, Lock } from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@l2/domain-identity";
import { Badge, Button, Input } from "@l2/ui";
import { PantallaAcceso } from "./AccesoScreen";
import { CodigosDeRecuperacion } from "./CodigosDeRecuperacion";
import { completarInstalacion, prepararInstalacion } from "./instalacion.acciones";
import { etiquetaSugerida, registrarLlave } from "./llave.cliente";

/**
 * «Instalar L2 Control» (ADR-020, M-12, JORNADA §2 P1 a P4). Con la base vacía, el acceso enseña
 * esto en lugar de «Registrar este equipo»: el código que el servidor escribió en su registro, el
 * local, y la primera persona de administración con su contraseña, su PIN y su llave de acceso.
 * Al terminar, este equipo queda aprobado y la persona, dentro. Después esta pantalla no vuelve a
 * existir: el servidor la niega para siempre.
 *
 * Nada se crea hasta el final: los dos primeros pasos solo recogen datos, y el servidor lo hace
 * todo en una transacción cuando ya tiene la llave.
 *
 * Es la puerta de TODO el acceso, también con el local instalado (entonces solo deja pasar a
 * `children`): al completar la instalación el servidor repinta la página como instalada, y si
 * este componente se desmontara ahí se llevaría los códigos de recuperación, que se enseñan una
 * sola vez. Así se quedan en pantalla hasta que la persona dice que los guardó.
 */

// Cuatro pasos cortos y no tres largos: cada uno cabe entero, con su botón, a 1366×768 y en el
// teléfono. La estación no desplaza la página, así que lo que no cabe no se alcanza.
type Paso = "CODIGO" | "LOCAL" | "PERSONA" | "LLAVE";
const PASOS: readonly Paso[] = ["CODIGO", "LOCAL", "PERSONA", "LLAVE"];
const TITULO: Record<Paso, string> = {
  CODIGO: "Instalar L2 Control",
  LOCAL: "El local",
  PERSONA: "La primera administración",
  LLAVE: "Tu contraseña y tu llave",
};

const estadoDelPanel = (
  <Badge tone="warn" icon={<HardDriveDownload size={13} aria-hidden="true" />}>
    Local sin instalar
  </Badge>
);

export function PuertaDeInstalacion({
  instalado,
  children,
}: {
  /** Del servidor: con la base vacía es `false` y esto es «Instalar L2 Control». */
  instalado: boolean;
  /** El acceso de siempre, que solo se pinta con el local instalado. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("CODIGO");
  const [codigo, setCodigo] = useState("");
  const [local, setLocal] = useState("");
  const [sucursal, setSucursal] = useState("Principal");
  const [equipo, setEquipo] = useState("");
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repetida, setRepetida] = useState("");
  const [pin, setPin] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Lo que respondió el servidor, junto al campo al que se refiere (o al pie si no es de ninguno). */
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<{ nombre: string; codigos: readonly string[] } | null>(null);

  useEffect(() => setEtiqueta(etiquetaSugerida()), []);

  const codigoListo = codigo.replace(/[\s-]/g, "").length === 10;
  const localListo = local.trim().length >= 2 && sucursal.trim().length >= 2 && equipo.trim().length >= 2;
  const noCoinciden = repetida.length > 0 && repetida !== contrasena;
  const personaLista = nombre.trim().length >= 2 && /^\d{4}$/.test(pin);
  const llaveLista = contrasena.length > 0 && repetida === contrasena && etiqueta.trim().length >= 2;

  /** Lleva cada problema a su campo y vuelve al paso donde está el primero. */
  function mostrarRechazo(r: { mensaje: string; motivo: string; problemas?: readonly { path: readonly PropertyKey[]; message: string }[] | undefined }) {
    const porCampo: Record<string, string> = {};
    for (const p of r.problemas ?? []) {
      const campo = String(p.path[0] ?? "");
      if (campo && !(campo in porCampo)) porCampo[campo] = p.message;
    }
    // Sin campo, un rechazo por permiso es del código: es lo único que autoriza a instalar.
    if (Object.keys(porCampo).length === 0) porCampo[r.motivo === "NO_PERMITIDO" ? "codigo" : "general"] = r.mensaje;
    setErrores(porCampo);
    if ("codigo" in porCampo) setPaso("CODIGO");
    else if ("local" in porCampo || "sucursal" in porCampo || "equipo" in porCampo) setPaso("LOCAL");
    else if ("nombre" in porCampo || "pin" in porCampo) setPaso("PERSONA");
  }

  async function instalar() {
    setEnviando(true);
    setErrores({});
    const preparado = await prepararInstalacion({ codigo, local, sucursal, nombre, contrasena, pin }).catch(() => null);
    if (!preparado || !preparado.ok) {
      setEnviando(false);
      return preparado ? mostrarRechazo(preparado) : setErrores({ general: "El servidor no respondió. Inténtalo de nuevo." });
    }
    const llave = await registrarLlave(preparado.valor);
    if (!llave.ok) {
      setEnviando(false);
      return setErrores({ etiqueta: llave.mensaje });
    }
    const r = await completarInstalacion({ codigo, desafioId: llave.desafioId, respuesta: llave.respuesta, etiqueta, equipo }, pin).catch(() => null);
    setEnviando(false);
    if (!r || !r.ok) return r ? mostrarRechazo(r) : setErrores({ general: "El servidor no respondió. Inténtalo de nuevo." });
    setHecho(r.valor);
  }

  if (hecho) {
    return (
      <PantallaAcceso estado={estadoDelPanel}>
        <CodigosDeRecuperacion
          nombre={hecho.nombre}
          codigos={hecho.codigos}
          continuar="Entrar al panel"
          // La sesión ya está abierta: Inicio enseña la Puesta a punto con lo que falta para abrir.
          onContinuar={() => router.push("/panel")}
        />
      </PantallaAcceso>
    );
  }

  if (instalado) return children;

  const indice = PASOS.indexOf(paso);
  const siguiente = () => {
    setErrores({});
    setPaso(PASOS[indice + 1] ?? "LLAVE");
  };

  return (
    <PantallaAcceso estado={estadoDelPanel}>
      <form
        className="mx-auto flex w-full max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (enviando) return;
          if (paso === "CODIGO" && codigoListo) siguiente();
          else if (paso === "LOCAL" && localListo) siguiente();
          else if (paso === "PERSONA" && personaLista) siguiente();
          else if (paso === "LLAVE" && llaveLista) void instalar();
        }}
      >
        <p className="tnum text-[12px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
          Paso {indice + 1} de {PASOS.length}
        </p>
        <h1 className="font-display text-3xl font-bold text-ink">{TITULO[paso]}</h1>

        {paso === "CODIGO" && (
          <>
            <p className="text-[14.5px] text-ink-2">
              Este servidor está recién puesto y todavía no tiene local ni personas. Para instalarlo hace falta el código que
              el servidor escribió en su registro al arrancar: lo tiene quien lo desplegó.
            </p>
            <Input
              label="Código de instalación"
              surface="tablet"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={14}
              placeholder="XXXXX-XXXXX"
              className="tnum font-mono tracking-[0.12em] uppercase"
              hint="Diez caracteres. Vale una sola vez y cambia cada vez que el servidor arranca."
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              error={errores.codigo}
            />
            <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
              <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              El código se comprueba al final, con todo lo demás. Cada código errado cuenta para un bloqueo.
            </p>
          </>
        )}

        {paso === "LOCAL" && (
          <>
            <p className="text-[14.5px] text-ink-2">Cómo se llama el negocio y este equipo, que queda aprobado como el primero del local.</p>
            <Input label="Nombre del local" surface="tablet" maxLength={80} value={local} onChange={(e) => setLocal(e.target.value)} error={errores.local} />
            <Input
              label="Sucursal"
              surface="tablet"
              maxLength={80}
              hint="Con una sola sede, déjala como «Principal»."
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              error={errores.sucursal}
            />
            <Input
              label="Nombre de este equipo"
              surface="tablet"
              maxLength={40}
              placeholder="PC de la oficina"
              hint="Que diga dónde está: así se reconoce en la lista de equipos."
              value={equipo}
              onChange={(e) => setEquipo(e.target.value)}
              error={errores.equipo}
            />
          </>
        )}

        {paso === "PERSONA" && (
          <>
            <p className="text-[14.5px] text-ink-2">Quien administra el local. Después dará de alta al resto desde Ajustes → Usuarios.</p>
            <Input label="Tu nombre completo" surface="tablet" autoComplete="name" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
            <Input
              label="PIN de cuatro dígitos"
              surface="tablet"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="tnum tracking-[0.3em]"
              hint="Con él entras cada día desde un equipo del local."
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              error={errores.pin}
            />
          </>
        )}

        {paso === "LLAVE" && (
          <>
            <p className="text-[14.5px] text-ink-2">Las dos juntas confirman que eres tú para configuración, precios y personas.</p>
            <Input
              label="Contraseña"
              surface="tablet"
              type="password"
              autoComplete="new-password"
              hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres. Una frase de varias palabras se recuerda mejor.`}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              error={errores.contrasena}
            />
            <Input
              label="Repite la contraseña"
              surface="tablet"
              type="password"
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              error={noCoinciden ? "Las dos contraseñas no coinciden." : undefined}
            />
            <Input
              label="Nombre de tu llave de acceso"
              surface="tablet"
              maxLength={60}
              hint="Se crea en este equipo, con su huella, su cara o su PIN."
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              error={errores.etiqueta}
            />
            <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
              <Fingerprint size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              Al instalar, este equipo te pedirá crear tu llave de acceso.
            </p>
          </>
        )}

        {errores.general && (
          <p role="alert" className="text-[13px] text-state-crit">
            {errores.general}
          </p>
        )}

        <div className="mt-1 flex gap-2">
          {indice > 0 && (
            <Button type="button" surface="tablet" variant="ghost" disabled={enviando} onClick={() => setPaso(PASOS[indice - 1] ?? "CODIGO")}>
              <ArrowLeft size={16} aria-hidden="true" />
              Atrás
            </Button>
          )}
          <Button
            type="submit"
            surface="tablet"
            variant="primary"
            className="flex-1"
            disabled={enviando || (paso === "CODIGO" ? !codigoListo : paso === "LOCAL" ? !localListo : paso === "PERSONA" ? !personaLista : !llaveLista)}
          >
            {paso !== "LLAVE" ? "Continuar" : enviando ? "Instalando…" : "Instalar y crear mi llave"}
          </Button>
        </div>
      </form>
    </PantallaAcceso>
  );
}
