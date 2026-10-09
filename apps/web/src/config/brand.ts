/**
 * Identidad del producto y titularidad de los derechos.
 * El aviso de copyright se muestra en todas las pantallas (ver CopyrightNotice).
 */
export const BRAND = {
  name: 'Inventario Pro',
  tagline: 'Inventario, ventas y finanzas para negocios con una o muchas sedes',
  owner: 'JuanPH-M',
  ownerUrl: 'https://github.com/JuanPH-M',
  since: 2026,
} as const;

export function copyrightText(year = new Date().getFullYear()): string {
  const range = year > BRAND.since ? `${BRAND.since}–${year}` : String(BRAND.since);
  return `© ${range} ${BRAND.owner}. Todos los derechos reservados.`;
}
