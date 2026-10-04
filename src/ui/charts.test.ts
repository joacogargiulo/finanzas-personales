import { describe, expect, it } from 'vitest';
import {
  axisLabel,
  barHeight,
  barLayout,
  donutLabel,
  donutSegments,
  labelStep,
  MAX_BAR_WIDTH,
  niceScale,
} from './charts';

// La escala elige un tope "redondo" para que las marcas del eje se lean fácil.
describe('niceScale', () => {
  it.each([
    // máximo (centavos), tope esperado, paso esperado
    [870_000_00, 1_000_000_00, 250_000_00],
    [1_000_000_00, 1_000_000_00, 250_000_00],
    [120_000_00, 150_000_00, 50_000_00],
    [9_99, 10_00, 2_50],
  ])('máximo %i → tope %i con paso %i', (max, top, step) => {
    const scale = niceScale(max);
    expect(scale.max).toBe(top);
    expect(scale.ticks[1]).toBe(step);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks.at(-1)).toBe(top);
  });

  // Sin datos (todo en 0) igual hay un eje, y las marcas son centavos enteros.
  it('con máximo 0 y valores chicos usa pasos de al menos $ 1', () => {
    const scale = niceScale(0);
    expect(scale.max).toBeGreaterThan(0);
    for (const tick of [...scale.ticks, ...niceScale(37).ticks]) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });
});

describe('axisLabel', () => {
  it.each([
    [250_000_00, 'ARS', '$ 250 mil'],
    [1_500_000_00, 'ARS', '$ 1,5 M'],
    [800_00, 'USD', 'US$ 800'],
    [0, 'ARS', '$ 0'],
  ] as const)('%i %s → %s', (cents, currency, label) => {
    expect(axisLabel(cents, currency)).toBe(label);
  });
});

// El centro de la dona tiene poco lugar: sin centavos, y abreviado si es enorme.
describe('donutLabel', () => {
  it.each([
    [850_000_99, 'ARS', '$ 850.000'],
    [9_999_999_00, 'USD', 'US$ 9.999.999'],
    [12_300_000_00, 'ARS', '$ 12,3 M'],
  ] as const)('%i %s → %s', (cents, currency, label) => {
    expect(donutLabel(cents, currency)).toBe(label);
  });
});

// Las barras: proporcionales al tope, con un mínimo visible y ancho acotado.
describe('barLayout', () => {
  it('alto proporcional, mínimo visible y 0 sin valor', () => {
    expect(barHeight(50_00, 100_00, 200)).toBe(100);
    expect(barHeight(1, 100_000_00, 200)).toBe(2);
    expect(barHeight(0, 100_00, 200)).toBe(0);
  });

  it('un grupo por mes, ingreso a la izquierda y gasto a la derecha del centro', () => {
    const groups = barLayout(
      [
        { income: 100_00, expense: 50_00 },
        { income: 0, expense: 100_00 },
      ],
      { width: 200, height: 100, scaleMax: 100_00 },
    );
    expect(groups.map((g) => g.center)).toEqual([50, 150]);
    const [first] = groups;
    expect(first?.income.x).toBeLessThan(50);
    expect(first?.expense.x).toBeGreaterThan(50);
    // El origen está abajo: una barra de altura completa empieza en y = 0.
    expect(first?.income).toMatchObject({ y: 0, height: 100 });
    expect(first?.expense).toMatchObject({ y: 50, height: 50 });
    expect(groups[1]?.income.height).toBe(0);
  });

  it('con pocos meses el ancho no pasa del máximo', () => {
    const [group] = barLayout([{ income: 1, expense: 1 }], {
      width: 1000,
      height: 100,
      scaleMax: 100,
    });
    expect(group?.income.width).toBe(MAX_BAR_WIDTH);
  });
});

// La dona: los segmentos cubren la vuelta completa, descontando los espacios entre ellos.
describe('donutSegments', () => {
  const geometry = { radius: 50, thickness: 12, gap: 2 };

  it('los ángulos más los espacios suman 360°', () => {
    const segments = donutSegments([0.5, 0.3, 0.2], geometry);
    const drawn = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
    expect(drawn + 3 * 2).toBeCloseTo(360);
    expect(segments[0]).toMatchObject({ start: 1, end: 179 });
    expect(segments.every((s) => s.d.startsWith('M '))).toBe(true);
  });

  it('un segmento de más de media vuelta usa el arco largo', () => {
    const [big] = donutSegments([0.75, 0.25], geometry);
    expect(big?.d).toContain('A 50 50 0 1 1');
  });

  // Una sola categoría: anillo completo, sin espacio.
  it('una sola categoría es un anillo completo', () => {
    const [ring] = donutSegments([1], geometry);
    expect(ring).toMatchObject({ start: 0, end: 360 });
    expect(ring?.d.match(/M /g)).toHaveLength(2);
  });

  // Un segmento más chico que el espacio no se dibuja (sigue en la lista).
  it('un segmento mínimo queda sin dibujar', () => {
    const segments = donutSegments([0.999, 0.001], geometry);
    expect(segments[1]?.d).toBe('');
  });
});

// Etiquetas de los meses: si no entran todas, se escribe una cada tanto.
describe('labelStep', () => {
  it.each([
    [6, 320, 1],
    [12, 300, 2],
    [24, 300, 4],
    [3, 0, 3],
  ])('%i meses en %i px → una cada %i', (count, width, step) => {
    expect(labelStep(count, width)).toBe(step);
  });
});
