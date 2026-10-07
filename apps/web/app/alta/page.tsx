import type { Metadata } from "next";
import { AltaScreen } from "../../src/features/identity/AltaScreen";

/**
 * El alta de credenciales de administración con un enlace (ADR-020, punto 4). Se abre desde el
 * equipo o el teléfono de la persona, que puede no estar aprobado ni tener sesión: por eso vive
 * fuera de las cáscaras. El enlace va en el fragmento de la dirección y esta página no lo recibe.
 */
export const metadata: Metadata = { title: "Credenciales de administración · L2 Control", referrer: "no-referrer" };

export default function AltaPage() {
  // Sin cáscara, la pantalla de acceso no tendría altura de la que estirarse: la marca se quedaría corta.
  return (
    <div className="flex min-h-dvh flex-col">
      <AltaScreen />
    </div>
  );
}
