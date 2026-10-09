"use client";

import { useId, useState } from "react";
import { ClienteFacturaSchema, CONSUMIDOR_FINAL, type ClienteFacturaDto } from "@l2/contracts";
import { Button, Dialog, Input } from "@l2/ui";
import { CampoCedula } from "../clientes/CamposDelCliente.tsx";

/**
 * A nombre de quién sale la factura — DEC-23, T-19 (M-34).
 *
 * La cuenta que nació con su cliente ya viene a su nombre; la venta del mostrador sin cliente lo pide (`exigido`): se
 * cobra a alguien, y «Consumidor final» no se ofrece. El nombre viene propuesto con el del representante, que casi
 * siempre es quien la pide: se corrige si es otra persona o una empresa.
 *
 * ⚠ §7.6: la cédula y el RIF son datos personales. No se escriben en ningún
 * log y en la caja se muestran enmascarados.
 */
export function ClienteFacturaDialog({
  abierto,
  actual,
  nombrePropuesto,
  documentoPropuesto = "",
  exigido = false,
  onConfirmar,
  onCerrar,
}: {
  /** La venta del mostrador sin cliente (T-19): sin «Consumidor final». */
  exigido?: boolean;
  abierto: boolean;
  actual: ClienteFacturaDto;
  /** Nombre que se ofrece de entrada: el del representante de la cuenta. */
  nombrePropuesto: string;
  /** La cédula que se ofrece de entrada: la del cliente de la cuenta (B6-9), si la dio al sentarse. */
  documentoPropuesto?: string;
  onConfirmar: (cliente: ClienteFacturaDto) => void;
  onCerrar: () => void;
}) {
  const formId = useId();
  const [campos, setCampos] = useState({ document: "", name: "", fiscalAddress: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [estabaAbierto, setEstabaAbierto] = useState(false);

  // Al abrirse, arranca con lo que ya tenía la factura o con el nombre propuesto.
  if (abierto !== estabaAbierto) {
    setEstabaAbierto(abierto);
    if (abierto) {
      setErrores({});
      setCampos(
        actual.kind === "IDENTIFICADO"
          ? { document: actual.document, name: actual.name, fiscalAddress: actual.fiscalAddress ?? "" }
          : { document: documentoPropuesto, name: nombrePropuesto, fiscalAddress: "" },
      );
    }
  }

  const poner = (k: keyof typeof campos, v: string) => {
    setCampos((c) => ({ ...c, [k]: v }));
    setErrores((e) => {
      if (!e[k]) return e;
      const { [k]: _, ...resto } = e;
      return resto;
    });
  };

  function confirmar() {
    const r = ClienteFacturaSchema.safeParse({
      kind: "IDENTIFICADO",
      document: campos.document.trim().toUpperCase(),
      name: campos.name,
      ...(campos.fiscalAddress.trim() ? { fiscalAddress: campos.fiscalAddress } : {}),
    });
    if (!r.success) {
      const porCampo: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const k = String(issue.path[0] ?? "document");
        porCampo[k] ??= issue.message.startsWith("Invalid") ? "Falta este dato" : issue.message;
      }
      setErrores(porCampo);
      return;
    }
    onConfirmar(r.data);
  }

  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Factura a nombre de…"
      descripcion={exigido ? "La venta del mostrador se cobra a alguien: su cédula (o el RIF de su empresa) y su nombre." : "Su cédula o el RIF de su empresa."}
      pie={
        <div className={exigido ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
          {!exigido && (
            <Button surface="pos" variant="neutral" onClick={() => onConfirmar(CONSUMIDOR_FINAL)}>
              Consumidor final
            </Button>
          )}
          <Button surface="pos" variant="primary" type="submit" form={formId}>
            Usar estos datos
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
        className="flex flex-col gap-3"
      >
        <CampoCedula label="Cédula o RIF" surface="pos" autoFocus valor={campos.document} onCambio={(v) => poner("document", v)} error={errores.document} />
        <Input
          label="Nombre o razón social"
          surface="pos"
          autoComplete="off"
          value={campos.name}
          onChange={(e) => poner("name", e.target.value)}
          error={errores.name}
        />
        <Input
          label="Dirección fiscal (opcional)"
          surface="tablet"
          autoComplete="off"
          value={campos.fiscalAddress}
          onChange={(e) => poner("fiscalAddress", e.target.value)}
          error={errores.fiscalAddress}
          hint="Si la empresa la pide en la factura"
        />
      </form>
    </Dialog>
  );
}

/** «V-18···432»: el documento enmascarado para la pantalla (§7.6). */
export function documentoEnmascarado(documento: string): string {
  const limpio = documento.replace(/\s/g, "");
  return limpio.length <= 6 ? limpio : `${limpio.slice(0, 4)}···${limpio.slice(-3)}`;
}
