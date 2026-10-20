/** Luminância relativa (WCAG) de uma cor `#RRGGBB`; `null` se o formato não bater. */
export function luminance(hex: string | null | undefined): number | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor escura o bastante para texto claro por cima (contraste ≥ 4,5:1 com branco). */
export function isDarkColor(hex: string | null | undefined): boolean {
  const value = luminance(hex);
  return value !== null && 1.05 / (value + 0.05) >= 4.5;
}
