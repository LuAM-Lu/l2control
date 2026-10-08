/**
 * La escala de iconos (T-16, M-27, P-16) en números, para el `size` de los iconos: lo mismo que `--icono-*` en
 * `packages/config/tokens.css`. El icono crece con el objetivo táctil de su superficie (§8.4), no por gusto.
 */
export const TAMANO_ICONO = {
  /** Botón de caja (56 px). */
  pos: 20,
  /** Tablet del mesero y teléfono de la monitora (48 px). */
  tablet: 18,
  /** Panel con ratón (32 px). */
  admin: 16,
  /** Dentro de una frase o de un dato. */
  texto: 14,
  /** En una etiqueta o una insignia. */
  etiqueta: 12,
} as const;
