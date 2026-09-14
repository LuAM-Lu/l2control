import { DEFAULT_STATION_IDLE } from "@l2/domain-identity";
import { Avisos } from "@l2/ui";
import { CuentasProvider } from "../../src/features/cuentas/CuentasProvider";
import { VentasProvider } from "../../src/features/cash/VentasProvider";
import { DEMO_ACTIVA } from "../../src/demo/modo";
import { DEMO_CUENTAS } from "../../src/demo/cuentas";
import { DEMO_VENTAS } from "../../src/demo/ventas";
import { GuardiaEstacion } from "../../src/features/shell/GuardiaEstacion";
import { IdleGuard } from "../../src/features/shell/IdleGuard";
import { PageTransition } from "../../src/features/shell/PageTransition";
import { StationBar } from "../../src/features/shell/StationBar";

/**
 * Cáscara de las estaciones de operación — §9.10.2.
 *
 * A pantalla completa y **sin navegación**. El monitor de parque es una
 * pantalla de pared que nadie toca, el KDS se opera con guantes a dos metros
 * y la caja se usa con cola delante: una barra lateral les roba espacio y les
 * añade objetivos táctiles que nadie quiere pulsar.
 *
 * Lo único que aporta esta cáscara es la barra permanente de §8.5, con lo que
 * el operador no debe tener que buscar: turno, tasa vigente, conexión y quién
 * es. Antes cada pantalla lo repetía a su manera.
 */
export default function EstacionLayout({ children }: { children: React.ReactNode }) {
  // TODO(F2-12/backend): el contexto vendrá de la sesión del dispositivo
  // compartido. La forma ya es la definitiva, así que ese cambio no toca las
  // pantallas (§11.4).
  return (
    // Desde 1024 px la estación mide la ventana y NO desplaza la página: la
    // barra queda quieta y cada pantalla reparte su alto por dentro (patrón
    // de estructura fija). En móvil vuelve el flujo normal, donde el scroll es
    // lo esperado.
    // Las cuentas de las familias (DEC-21) viven por encima de las pantallas:
    // entrada, salida y caja trabajan sobre las mismas.
    // Con la demo apagada, las estaciones arrancan sin cuentas ni ventas.
    <CuentasProvider inicial={DEMO_ACTIVA ? DEMO_CUENTAS : []}>
    <VentasProvider inicial={DEMO_ACTIVA ? DEMO_VENTAS : []}>
    <div className="flex min-h-dvh flex-col bg-base lg:h-dvh lg:overflow-hidden">
      <StationBar
        contexto={{
          turnoAbierto: "2:00 pm",
          tasa: "228,41",
          tasaHora: "8:00 am",
          conexion: "N0",
        }}
      />
      {/* V2: la dirección no es una puerta. Cada pantalla pide el rol de su
          superficie; sin sesión, a identificarse. */}
      <PageTransition>
        <GuardiaEstacion>{children}</GuardiaEstacion>
      </PageTransition>
      {/* Toasts arriba al centro, bajo la barra de 64 px: lejos de la acción
          principal, que en las estaciones vive abajo a la derecha (UX-MEJORAS §4.2). */}
      <Avisos posicion="top-center" desdeArriba={76} />
      {/* F2-12: la sesión no se queda abierta en un puesto desatendido.
          TODO(backend): la política vendrá de la configuración de la
          sucursal; la forma ya es la definitiva. */}
      <IdleGuard politica={DEFAULT_STATION_IDLE} />
    </div>
    </VentasProvider>
    </CuentasProvider>
  );
}
