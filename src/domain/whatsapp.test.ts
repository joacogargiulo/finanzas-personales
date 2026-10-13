import { describe, expect, it } from 'vitest';
import {
  formatLinkCode,
  isLinkCode,
  isWhatsAppNumber,
  linkMessageUrl,
  maskPhone,
  parseLinkCommand,
} from './whatsapp';

// El mensaje que manda la persona para vincular su número (ADR 0033): se escribe a mano, así
// que se aceptan las variantes razonables y se rechaza todo lo demás.
describe('parseLinkCommand', () => {
  it.each([
    ['vincular 123456', '123456'],
    ['Vincular 123456', '123456'],
    ['VINCULAR   123456  ', '123456'],
    ['vincular: 123456', '123456'],
    ['vincular 123 456', '123456'],
    ['vincular 012345.', '012345'],
    ['vinculár 123456', '123456'],
  ])('"%s" → %s', (text, code) => {
    expect(parseLinkCommand(text)).toBe(code);
  });

  it.each([
    'vincular',
    'vincular 12345',
    'vincular 1234567',
    'vincular abcdef',
    '123456',
    'gasté 123456 en el súper',
    'por favor vincular 123456',
  ])('"%s" no es un pedido de vinculación', (text) => {
    expect(parseLinkCommand(text)).toBeNull();
  });
});

// El código siempre tiene 6 cifras, aunque el número sorteado sea chico.
describe('códigos', () => {
  it('completa con ceros adelante', () => {
    expect(formatLinkCode(42)).toBe('000042');
    expect(formatLinkCode(999_999)).toBe('999999');
  });

  it('rechaza números fuera de rango', () => {
    expect(() => formatLinkCode(1_000_000)).toThrow(RangeError);
    expect(() => formatLinkCode(-1)).toThrow(RangeError);
    expect(() => formatLinkCode(1.5)).toThrow(RangeError);
  });

  it('reconoce un código válido', () => {
    expect(isLinkCode('000042')).toBe(true);
    expect(isLinkCode('42')).toBe(false);
    expect(isLinkCode('12345a')).toBe(false);
  });
});

// Cómo se ve y se usa el número.
describe('números', () => {
  it('reconoce el formato de WhatsApp: solo cifras, con código de país', () => {
    expect(isWhatsAppNumber('5491123456789')).toBe(true);
    expect(isWhatsAppNumber('+5491123456789')).toBe(false);
    expect(isWhatsAppNumber('1234')).toBe(false);
  });

  it('oculta el medio del número', () => {
    expect(maskPhone('5491123456789')).toBe('+54 ••• 6789');
  });

  it('arma el enlace a WhatsApp con el mensaje ya escrito', () => {
    expect(linkMessageUrl('+1 555 010 0000', '123456')).toBe(
      'https://wa.me/15550100000?text=vincular%20123456',
    );
  });
});
