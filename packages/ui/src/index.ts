/**
 * @l2/ui — API pública de la biblioteca de componentes.
 *
 * §9.3: lo que NO se exporta aquí no es importable desde fuera, ni siquiera
 * conociendo la ruta. La superficie pública de un módulo es una decisión, no
 * un accidente de dónde quedó el archivo.
 */

export { cn } from "./cn";
export { useServerClock } from "./useServerClock";

// Nivel 1 — primitivos: no conocen el dominio
export { Button, type ButtonProps, type Surface } from "./primitives/Button";
export { Badge, type Tone } from "./primitives/Badge";
export { Input } from "./primitives/Input";
export { Stepper } from "./primitives/Stepper";

// Nivel 2 — patrones: componen primitivos, siguen sin conocer el dominio
export { Container } from "./patterns/Container";
export { StatusCard } from "./patterns/StatusCard";
export { CountdownDisplay } from "./patterns/CountdownDisplay";
export { TimeBar } from "./patterns/TimeBar";
export { StatTile } from "./patterns/StatTile";
export { PageHeader, type Miga } from "./patterns/PageHeader";
export { NumericKeypad } from "./patterns/NumericKeypad";
export { Initial } from "./patterns/Initial";
export { MoneyDisplay } from "./patterns/MoneyDisplay";
export { ScannerField } from "./patterns/ScannerField";
export { ConnectionBadge, type DegradationLevel } from "./patterns/ConnectionBadge";
export { EmptyState } from "./patterns/EmptyState";
export { ScanPrompt } from "./patterns/ScanPrompt";
export { Sheet, Dialog } from "./patterns/Capa";
