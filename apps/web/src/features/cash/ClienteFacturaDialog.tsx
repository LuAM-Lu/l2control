"use client";

import { useEffect, useId, useState } from "react";
import { Building2 } from "lucide-react";
import { ClienteFacturaSchema, CONSUMIDOR_FINAL, type ClienteFacturaDto } from "@l2/contracts";
import { documentKey } from "@l2/domain-park";
import { Button, Dialog, Input } from "@l2/ui";
import { CampoCedula } from "../clientes/CamposDelCliente.tsx";
import { CampoDelCliente, type ClienteElegido } from "../clientes/CampoDelCliente.tsx";
import { empresaDeFactura } from "../clientes/clientes.acciones";

/**
 * A nombre de quién sale la factura — DEC-23, T-19 (M-34).
 *
 * La cuenta que nació con su cliente ya viene a su nombre; la venta del mostrador sin cliente lo pide (`exigido`): se
 * cobra a alguien, y «Consumidor final» no se ofrece. El nombre viene propuesto con el del representante, que casi
 * siempre es quien la pide: se corrige si es otra persona o una empresa.
 *
 * ⚠ §7.6: la cédula y el RIF son datos personales. No se escriben en ningún
 * log y en la caja se muestran enmascarados.
 *
 * T-23 (M-38): con el RIF de una empresa (J- o G-) completo, propone su razón social y su dirección fiscal de la última
 * factura a ese RIF: lo propuesto se cambia, y lo que se escribió no se pisa.
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
  const [recordada, setRecordada] = useState(false);
  // T-23: el cliente del directorio pone su cédula y su nombre (lo propuesto se cambia; lo escrito, no).
  const [elegido, setElegido] = useState<{ cliente: ClienteElegido; antes: { document: string; name: string } } | null>(null);
  // T-23: la empresa de la última factura a ese RIF.
  const rif = documentKey(campos.document);
  const deEmpresa = rif !== null && /^[JG]\d{8,9}$/.test(rif) ? rif : null;
  useEffect(() => {
    setRecordada(false);
    if (!abierto || !deEmpresa) return;
    let vivo = true;
    empresaDeFactura({ documento: campos.document })
      .then((r) => {
        if (!vivo || !r.ok || !r.valor) return;
        const e = r.valor;
        setCampos((c) => ({
          ...c,
          // Lo propuesto (el nombre del representante) se cambia por la razón social; lo escrito, no.
          name: c.name.trim() === "" || c.name === nombrePropuesto ? e.nombre : c.name,
          fiscalAddress: c.fiscalAddress.trim() === "" ? (e.direccion ?? "") : c.fiscalAddress,
        }));
        setRecordada(true);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, deEmpresa]);

  // Al abrirse, arranca con lo que ya tenía la factura o con el nombre propuesto.
  if (abierto !== estabaAbierto) {
    setEstabaAbierto(abierto);
    if (abierto) {
      setErrores({});
      setElegido(null);
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
        {/* T-24: un solo campo, «Cédula o RIF»: el del directorio pone su nombre; un RIF de empresa, su razón social. */}
        <CampoDelCliente
          surface="pos"
          para="CAJA"
          autoFocus={campos.document === "" || !exigido}
          cedula={{ valor: campos.document, onCambio: (v) => poner("document", v), required: true, error: errores.document }}
          elegido={elegido?.cliente ?? null}
          onElegir={(c) => {
            setElegido({ cliente: c, antes: { document: campos.document, name: campos.name } });
            setCampos((v) => ({
              ...v,
              document: c.cedula && (v.document.trim() === "" || v.document === documentoPropuesto) ? c.cedula : v.document,
              name: v.name.trim() === "" || v.name === nombrePropuesto ? c.nombre : v.name,
            }));
            setErrores({});
          }}
          onDeshacer={() => {
            // Vuelve lo que había antes de elegir, si no se cambió después.
            if (elegido) {
              const { cliente: c, antes } = elegido;
              setCampos((v) => ({
                ...v,
                document: c.cedula && v.document === c.cedula ? antes.document : v.document,
                name: v.name === c.nombre ? antes.name : v.name,
              }));
            }
            setElegido(null);
          }}
        />
        {elegido && !elegido.cliente.cedula && (
          <CampoCedula label="Cédula o RIF" surface="pos" valor={campos.document} onCambio={(v) => poner("document", v)} error={errores.document} />
        )}
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
        {recordada && (
          <p role="status" className="flex items-center gap-1.5 text-detalle text-ink-2">
            <Building2 className="size-(--icono-texto) shrink-0 text-brand" aria-hidden="true" />
            La razón social y la dirección de la última factura a este RIF: cámbialas si no son.
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** «V-18···432»: el documento enmascarado para la pantalla (§7.6). */
export function documentoEnmascarado(documento: string): string {
  const limpio = documento.replace(/\s/g, "");
  return limpio.length <= 6 ? limpio : `${limpio.slice(0, 4)}···${limpio.slice(-3)}`;
}
