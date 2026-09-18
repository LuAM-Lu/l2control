/**
 * Datos inventados de tasas de cambio hasta F0-04.
 * El historial vendrá del servidor (F3-03) y la sincronización del BCV con él (F3-04).
 */
import { HistorialTasasSchema, type HistorialTasasDto } from "@l2/contracts";

export const HISTORIAL_DEMO: HistorialTasasDto = HistorialTasasSchema.parse({
  umbralVariacionBasisPoints: 1000,
  tasas: [
    {
      id: "demo-tasa-1",
      pair: "USD/VES",
      value: "227.15",
      source: "BCV",
      capturedAt: "2026-09-12T12:00:00.000Z",
      capturedBy: "Sincronización BCV",
      confirmed: true,
      confirmedBy: "Abigail Karam",
      confirmedAt: "2026-09-12T12:15:00.000Z",
    },
    {
      id: "demo-tasa-2",
      pair: "USD/VES",
      value: "227.80",
      source: "BCV",
      capturedAt: "2026-09-13T12:00:00.000Z",
      capturedBy: "Sincronización BCV",
      confirmed: true,
      confirmedBy: "Abigail Karam",
      confirmedAt: "2026-09-13T12:05:00.000Z",
    },
    {
      id: "demo-tasa-3",
      pair: "USD/VES",
      value: "228.10",
      source: "BCV",
      capturedAt: "2026-09-14T12:00:00.000Z",
      capturedBy: "Sincronización BCV",
      confirmed: true,
      confirmedBy: "Luis Guerrero",
      confirmedAt: "2026-09-14T12:30:00.000Z",
    },
    {
      id: "demo-tasa-4",
      pair: "USD/VES",
      value: "228.35",
      source: "MANUAL",
      capturedAt: "2026-09-15T16:00:00.000Z",
      capturedBy: "Luis Guerrero",
      confirmed: true,
      confirmedBy: "Luis Guerrero",
      confirmedAt: "2026-09-15T16:05:00.000Z",
    },
    {
      id: "demo-tasa-5",
      pair: "USD/VES",
      value: "228.41",
      source: "BCV",
      capturedAt: "2026-09-16T12:00:00.000Z",
      capturedBy: "Sincronización BCV",
      confirmed: true,
      confirmedBy: "Abigail Karam",
      confirmedAt: "2026-09-16T12:10:00.000Z",
    },
    {
      id: "demo-tasa-6",
      pair: "USD/VES",
      value: "228.55",
      source: "BCV",
      capturedAt: "2026-09-17T12:00:00.000Z",
      capturedBy: "Sincronización BCV",
      confirmed: false,
    },
  ],
});
