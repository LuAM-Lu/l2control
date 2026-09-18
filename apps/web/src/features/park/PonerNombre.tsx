"use client";

import { useState } from "react";
import { NombrarEstanciaCommandSchema, type NombrarEstanciaCommand } from "@l2/contracts";
import { Button, Input } from "@l2/ui";

export function PonerNombre({
  sessionId,
  nombreActual,
  apodoActual,
  onGuardar,
  onCancelar,
}: {
  sessionId: string;
  nombreActual?: string | null;
  apodoActual?: string | null;
  onGuardar: (cmd: NombrarEstanciaCommand) => void;
  onCancelar: () => void;
}) {
  const [name, setName] = useState(nombreActual ?? "");
  const [nickname, setNickname] = useState(apodoActual ?? "");
  const [errorName, setErrorName] = useState<string | null>(null);

  const guardar = () => {
    const res = NombrarEstanciaCommandSchema.safeParse({
      sessionId,
      name,
      nickname: nickname || undefined,
    });
    if (!res.success) {
      const e = res.error.flatten().fieldErrors;
      if (e.name) setErrorName(e.name[0] ?? null);
      return;
    }
    setErrorName(null);
    onGuardar(res.data);
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      <Input
        label="Nombre"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (errorName) setErrorName(null);
        }}
        error={errorName ?? undefined}
        surface="tablet"
        autoFocus
      />
      <Input
        label="Apodo (opcional)"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        hint="Si lo llenas, es lo que saldrá en la pantalla"
        surface="tablet"
      />
      <div className="mt-2 flex gap-3">
        <Button variant="ghost" onClick={onCancelar} surface="tablet" className="flex-1">
          Cancelar
        </Button>
        <Button variant="primary" onClick={guardar} surface="tablet" className="flex-1">
          Guardar
        </Button>
      </div>
    </div>
  );
}
