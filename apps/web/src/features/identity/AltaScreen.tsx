"use client";

import { useEffect, useState } from "react";
import { Check, Fingerprint, KeyRound, ShieldAlert } from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@l2/domain-identity";
import type { EnlaceAbiertoDto } from "@l2/contracts";
import { Badge, Button, Input } from "@l2/ui";
import { PantallaAcceso } from "./AccesoScreen";
import { abrirEnlace, completarAlta, prepararAlta } from "./alta.acciones";
import { CodigosDeRecuperacion } from "./CodigosDeRecuperacion";
import { etiquetaSugerida, registrarLlave } from "./llave.cliente";

/**
 * El alta de credenciales con un enlace (ADR-020, punto 4). La persona abre en SU equipo o en SU
 * teléfono el enlace que le generó administración: pone su contraseña, registra su llave de
 * acceso y recibe sus códigos de recuperación. No hay sesión ni equipo aprobado: lo único que
 * autoriza es el enlace, que vive en el fragmento de la dirección (el navegador no lo envía al
 * pedir la página, así que no llega a ningún registro) y viaja en el cuerpo de cada acción.
 */

type Estado =
  | Readonly<{ paso: "ABRIENDO" }>
  | Readonly<{ paso: "NO_VALE" }>
  | Readonly<{ paso: "DATOS"; enlace: EnlaceAbiertoDto }>
  | Readonly<{ paso: "CODIGOS"; nombre: string; codigos: readonly string[] }>
  | Readonly<{ paso: "LISTO"; nombre: string; conCodigos: boolean }>;

const estadoDelPanel = (
  <Badge tone="brand" icon={<KeyRound size={13} aria-hidden="true" />}>
    Credenciales de administración
  </Badge>
);

export function AltaScreen() {
  const [secreto, setSecreto] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ paso: "ABRIENDO" });

  // El enlace se lee del fragmento y se quita de la barra: no queda en el historial ni a la vista.
  useEffect(() => {
    const leido = window.location.hash.slice(1);
    if (!leido) return setEstado({ paso: "NO_VALE" });
    window.history.replaceState(null, "", window.location.pathname);
    setSecreto(leido);
    abrirEnlace(leido)
      .then((e) => setEstado(e ? { paso: "DATOS", enlace: e } : { paso: "NO_VALE" }))
      .catch(() => setEstado({ paso: "NO_VALE" }));
  }, []);

  if (estado.paso === "ABRIENDO") {
    return (
      <PantallaAcceso estado={estadoDelPanel}>
        <p role="status" className="mx-auto w-full max-w-md text-[14.5px] text-ink-2">
          Comprobando el enlace…
        </p>
      </PantallaAcceso>
    );
  }

  if (estado.paso === "NO_VALE") {
    return (
      <PantallaAcceso estado={estadoDelPanel}>
        <div className="mx-auto w-full max-w-md rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-6">
          <ShieldAlert size={28} className="text-state-crit" aria-hidden="true" />
          <h1 className="font-display mt-3 text-2xl font-bold text-ink">Este enlace ya no vale</h1>
          <p className="mt-2 text-sm text-ink-2">
            Se usó, caducó (dura 24 horas) o se generó otro después. Pide uno nuevo a administración: lo genera en Panel →
            Ajustes → Usuarios.
          </p>
        </div>
      </PantallaAcceso>
    );
  }

  if (estado.paso === "CODIGOS") {
    return (
      <PantallaAcceso estado={estadoDelPanel}>
        <CodigosDeRecuperacion
          nombre={estado.nombre}
          codigos={estado.codigos}
          continuar="Terminar"
          onContinuar={() => setEstado({ paso: "LISTO", nombre: estado.nombre, conCodigos: true })}
        />
      </PantallaAcceso>
    );
  }

  if (estado.paso === "LISTO") {
    return (
      <PantallaAcceso estado={estadoDelPanel}>
        <div className="mx-auto w-full max-w-md rounded-[var(--radius-card)] border border-state-ok/40 bg-state-ok-bg/40 p-6">
          <Check size={28} className="text-state-ok" aria-hidden="true" />
          <h1 className="font-display mt-3 text-2xl font-bold text-ink">Listo, {estado.nombre.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-ink-2">
            {estado.conCodigos
              ? "Ya tienes contraseña, llave de acceso y códigos de recuperación. Cuando el sistema te pida confirmar que eres tú, usa tu contraseña y esta llave."
              : "Tu llave nueva ya está registrada. Vale igual que la anterior para confirmar que eres tú."}
          </p>
          <p className="mt-3 text-[12.5px] text-ink-3">Puedes cerrar esta página. Al sistema se entra, como siempre, con tu PIN desde un equipo del local.</p>
        </div>
      </PantallaAcceso>
    );
  }

  return (
    <PantallaAcceso estado={estadoDelPanel}>
      <Formulario
        enlace={estado.enlace}
        secreto={secreto}
        onHecho={(nombre, codigos) => setEstado(codigos ? { paso: "CODIGOS", nombre, codigos } : { paso: "LISTO", nombre, conCodigos: false })}
        onNoVale={() => setEstado({ paso: "NO_VALE" })}
      />
    </PantallaAcceso>
  );
}

function Formulario({
  enlace,
  secreto,
  onHecho,
  onNoVale,
}: {
  enlace: EnlaceAbiertoDto;
  secreto: string | null;
  onHecho: (nombre: string, codigos: readonly string[] | null) => void;
  onNoVale: () => void;
}) {
  const alta = enlace.kind === "ALTA";
  const [contrasena, setContrasena] = useState("");
  const [repetida, setRepetida] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDeLlave, setErrorDeLlave] = useState<string | null>(null);

  // El nombre sugerido depende del navegador: se pone al montar, no al pintar en el servidor.
  useEffect(() => setEtiqueta(etiquetaSugerida()), []);

  const noCoinciden = alta && repetida.length > 0 && repetida !== contrasena;
  const listo = contrasena.length > 0 && (!alta || repetida === contrasena) && etiqueta.trim().length >= 2;

  async function enviar() {
    setEnviando(true);
    setError(null);
    setErrorDeLlave(null);
    const preparado = await prepararAlta(secreto, { contrasena }).catch(() => null);
    if (!preparado || !preparado.ok) {
      setEnviando(false);
      // Un enlace deja de valer también aquí (caducó, o van cinco contraseñas erradas): se vuelve a
      // preguntar al servidor en vez de adivinarlo por el texto del rechazo.
      if (preparado?.motivo === "NO_PERMITIDO" && (await abrirEnlace(secreto).catch(() => enlace)) === null) return onNoVale();
      return setError(!preparado ? "El servidor no respondió. Inténtalo de nuevo." : (preparado.problemas?.[0]?.message ?? preparado.mensaje));
    }
    const llave = await registrarLlave(preparado.valor);
    if (!llave.ok) {
      setEnviando(false);
      return setErrorDeLlave(llave.mensaje);
    }
    const hecho = await completarAlta(secreto, { desafioId: llave.desafioId, respuesta: llave.respuesta, etiqueta }).catch(() => null);
    setEnviando(false);
    if (!hecho || !hecho.ok) {
      return setErrorDeLlave(!hecho ? "El servidor no respondió. Inténtalo de nuevo." : (hecho.problemas?.[0]?.message ?? hecho.mensaje));
    }
    onHecho(hecho.valor.nombre, hecho.valor.codigos);
  }

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo && !enviando) void enviar();
      }}
    >
      <h1 className="font-display text-3xl font-bold text-ink">{alta ? "Tus credenciales de administración" : "Añadir otra llave de acceso"}</h1>
      <p className="text-[14.5px] text-ink-2">
        {alta
          ? `${enlace.nombre}: elige tu contraseña y registra tu llave de acceso en este equipo. Las dos juntas confirman que eres tú para configuración, precios y personas.`
          : `${enlace.nombre}: escribe tu contraseña y registra una llave más en este equipo. Conviene tener dos, en equipos distintos.`}
      </p>

      <Input
        label={alta ? "Contraseña nueva" : "Tu contraseña"}
        surface="tablet"
        type="password"
        autoComplete={alta ? "new-password" : "current-password"}
        hint={alta ? `Al menos ${PASSWORD_MIN_LENGTH} caracteres. Una frase de varias palabras se recuerda mejor.` : undefined}
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
        error={error ?? undefined}
      />
      {alta && (
        <Input
          label="Repite la contraseña"
          surface="tablet"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          error={noCoinciden ? "Las dos contraseñas no coinciden." : undefined}
        />
      )}
      <Input
        label="Nombre de esta llave"
        surface="tablet"
        maxLength={60}
        hint="Para reconocerla en la lista: «Laptop de la oficina», «Mi teléfono»."
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        error={errorDeLlave ?? undefined}
      />

      <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
        <Fingerprint size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Al continuar, este equipo te pedirá crear la llave: con la huella, la cara o el PIN del equipo.
        {alta && " Si ya tenías credenciales, las anteriores dejan de valer."}
      </p>

      <Button type="submit" surface="tablet" variant="primary" disabled={!listo || enviando}>
        {enviando ? "Registrando…" : "Continuar y registrar la llave"}
      </Button>
    </form>
  );
}
