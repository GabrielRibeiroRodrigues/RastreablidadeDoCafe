import { describe, expect, it } from 'vitest';
import { isDarkColor, luminance } from './color';

describe('color', () => {
  it('computes WCAG relative luminance', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    expect(luminance('red')).toBeNull();
  });

  it('only treats colors with 4.5:1 contrast against white as dark', () => {
    expect(isDarkColor('#5b3a29')).toBe(true);
    expect(isDarkColor('#2b211b')).toBe(true);
    expect(isDarkColor('#f5d76e')).toBe(false);
    expect(isDarkColor('#c08040')).toBe(false);
    expect(isDarkColor(null)).toBe(false);
  });
});
