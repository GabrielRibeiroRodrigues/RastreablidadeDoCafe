import { describe, expect, it } from 'vitest';
import { CsvNumber, escapeCell, toCsv } from './csv.js';

describe('escapeCell', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+5511999990000', "'+5511999990000"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
  ])('neutralizes formula prefix in %j', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });

  it('quotes separators, quotes and line breaks', () => {
    expect(escapeCell('Fazenda; Sul')).toBe('"Fazenda; Sul"');
    expect(escapeCell('Café "especial"')).toBe('"Café ""especial"""');
    expect(escapeCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
  });

  it('combines both protections', () => {
    expect(escapeCell('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
  });

  it('writes numbers in pt-BR and keeps pre-formatted numbers as they are', () => {
    expect(escapeCell(12.5)).toBe('12,5');
    expect(escapeCell(new CsvNumber('-1,500'))).toBe('-1,500');
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('adds a BOM, uses ";" and CRLF', () => {
    expect(toCsv(['a', 'b'], [['1', '=2']])).toBe("﻿a;b\r\n1;'=2\r\n");
  });
});
