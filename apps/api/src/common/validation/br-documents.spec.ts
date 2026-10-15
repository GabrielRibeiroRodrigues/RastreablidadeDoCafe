import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, isValidCpfOrCnpj, onlyDigits } from './br-documents.js';

describe('Brazilian documents', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('accepts valid CPF %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['529.982.247-26', '111.111.111-11', '1234567890', ''])(
    'rejects invalid CPF %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it.each(['11.222.333/0001-81', '11222333000181', '45.723.174/0001-10'])(
    'accepts valid CNPJ %s',
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(true);
    },
  );

  it.each(['11.222.333/0001-82', '00.000.000/0000-00', '1122233300018'])(
    'rejects invalid CNPJ %s',
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(false);
    },
  );

  it('accepts either kind', () => {
    expect(isValidCpfOrCnpj('52998224725')).toBe(true);
    expect(isValidCpfOrCnpj('11222333000181')).toBe(true);
    expect(isValidCpfOrCnpj('123')).toBe(false);
  });

  it('strips punctuation', () => {
    expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181');
  });
});
