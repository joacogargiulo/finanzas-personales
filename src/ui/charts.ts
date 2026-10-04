// Geometría de los gráficos de Estadísticas (ADR 0021). Son funciones puras: calculan
// posiciones y el atributo `d` de los `<path>` de SVG, y los componentes solo los dibujan.
// Los montos llegan en centavos enteros; los números de punto flotante que aparecen acá son
// píxeles y ángulos, nunca plata.

import type { Cents, Currency } from '../domain/model';
import { currencySymbol } from '../domain/money';

// ---------------------------------------------------------------------------------------------
// Escala del eje de las barras

export interface Scale {
  /** Tope del eje: un número "redondo" mayor o igual al valor más alto. */
  max: Cents;
  /** Marcas del eje, de 0 al tope. */
  ticks: Cents[];
}

/** Pasos "redondos" dentro de cada potencia de 10: 1, 2, 2,5 y 5 (y después 10). */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * Elige un paso redondo para el eje: con un máximo de $ 870.000 y 4 marcas, el paso es
 * $ 250.000 y el tope $ 1.000.000. El paso mínimo es $ 1, así siempre son centavos enteros.
 */
export function niceScale(maxValue: Cents, tickCount = 4): Scale {
  const raw = Math.max(maxValue, 100) / tickCount;
  const magnitude = Math.max(100, 10 ** Math.floor(Math.log10(raw)));
  const factor = NICE_STEPS.find((step) => step * magnitude >= raw) ?? 10;
  const step = Math.round(factor * magnitude);
  const count = Math.max(1, Math.ceil(maxValue / step));
  const ticks = Array.from({ length: count + 1 }, (_, i) => i * step);
  return { max: count * step, ticks };
}

const compactNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** Etiqueta corta para el eje: `$ 250 mil`, `US$ 1,5 M`, `$ 800`. Solo para mostrar. */
export function axisLabel(cents: Cents, currency: Currency): string {
  const units = Math.trunc(cents / 100);
  const symbol = currencySymbol(currency);
  if (units >= 1_000_000) return `${symbol} ${compactNumber.format(units / 1_000_000)} M`;
  if (units >= 1_000) return `${symbol} ${compactNumber.format(units / 1_000)} mil`;
  return `${symbol} ${String(units)}`;
}

const wholeNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/**
 * Total del centro de la dona, que tiene poco lugar: sin centavos (`$ 850.000`) y, desde 10
 * millones, abreviado (`$ 12,3 M`). El monto exacto está en el resumen del período.
 */
export function donutLabel(cents: Cents, currency: Currency): string {
  const units = Math.trunc(cents / 100);
  if (units >= 10_000_000) return axisLabel(cents, currency);
  return `${currencySymbol(currency)} ${wholeNumber.format(units)}`;
}

// ---------------------------------------------------------------------------------------------
// Barras agrupadas por mes

export interface BarGroup {
  /** Centro del grupo en el eje horizontal (para la etiqueta del mes). */
  center: number;
  income: Bar;
  expense: Bar;
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ancho máximo de cada barra, para que con pocos meses no queden bloques enormes. */
export const MAX_BAR_WIDTH = 18;
/** Alto mínimo de una barra con valor: un monto chico se tiene que ver igual. */
export const MIN_BAR_HEIGHT = 2;

interface BarArea {
  width: number;
  height: number;
  scaleMax: Cents;
}

/** Alto de una barra en píxeles, proporcional al tope de la escala. */
export function barHeight(value: Cents, scaleMax: Cents, plotHeight: number): number {
  if (value <= 0 || scaleMax <= 0) return 0;
  return Math.max(MIN_BAR_HEIGHT, (value / scaleMax) * plotHeight);
}

/**
 * Reparte el ancho entre los meses: cada mes ocupa una franja igual, con la barra de ingresos
 * a la izquierda del centro y la de gastos a la derecha. El origen (0) está abajo.
 */
export function barLayout(
  months: readonly { income: Cents; expense: Cents }[],
  { width, height, scaleMax }: BarArea,
): BarGroup[] {
  const slot = width / Math.max(1, months.length);
  const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.32);
  const gap = Math.min(4, slot * 0.06);
  const bar = (x: number, value: Cents): Bar => {
    const h = barHeight(value, scaleMax, height);
    return { x, y: height - h, width: barWidth, height: h };
  };
  return months.map((month, i) => {
    const center = slot * i + slot / 2;
    return {
      center,
      income: bar(center - gap / 2 - barWidth, month.income),
      expense: bar(center + gap / 2, month.expense),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Dona

export interface DonutSegment {
  /** Ángulos en grados, desde arriba (las 12) y en el sentido de las agujas del reloj. */
  start: number;
  end: number;
  /** Atributo `d` del `<path>`. Vacío si el segmento es tan chico que no se dibuja. */
  d: string;
}

interface DonutGeometry {
  /** Radio exterior. El centro es (radius, radius), así el SVG mide 2 × radius. */
  radius: number;
  thickness: number;
  /** Espacio entre segmentos, en grados. */
  gap?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function point(center: number, r: number, degrees: number): string {
  // 0° está arriba: se resta 90° porque en trigonometría 0° está a la derecha.
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${String(round(center + r * Math.cos(radians)))} ${String(round(center + r * Math.sin(radians)))}`;
}

/** Un sector de anillo: arco exterior, línea hacia adentro, arco interior de vuelta. */
function ringSector(c: number, outer: number, inner: number, start: number, end: number): string {
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${point(c, outer, start)}`,
    `A ${String(outer)} ${String(outer)} 0 ${String(large)} 1 ${point(c, outer, end)}`,
    `L ${point(c, inner, end)}`,
    `A ${String(inner)} ${String(inner)} 0 ${String(large)} 0 ${point(c, inner, start)}`,
    'Z',
  ].join(' ');
}

/** El anillo completo: un arco no puede ir de un punto a sí mismo, así que son dos mitades. */
function fullRing(c: number, outer: number, inner: number): string {
  return `${ringSector(c, outer, inner, 0, 180)} ${ringSector(c, outer, inner, 180, 360)}`;
}

/**
 * Los segmentos de la dona a partir de la parte de cada categoría (de 0 a 1). Cada segmento
 * resigna `gap` grados para que se vea la separación; si es más chico que eso, no se dibuja
 * (igual aparece en la lista con su porcentaje).
 */
export function donutSegments(
  shares: readonly number[],
  { radius, thickness, gap = 2 }: DonutGeometry,
): DonutSegment[] {
  const inner = radius - thickness;
  const visible = shares.filter((share) => share > 0).length;
  if (visible === 1) {
    return shares.map((share) =>
      share > 0
        ? { start: 0, end: 360, d: fullRing(radius, radius, inner) }
        : { start: 0, end: 0, d: '' },
    );
  }
  let angle = 0;
  return shares.map((share) => {
    const sweep = share * 360;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    angle += sweep;
    if (end <= start) return { start, end: start, d: '' };
    return { start, end, d: ringSector(radius, radius, inner, start, end) };
  });
}

/**
 * Cada cuántos meses se escribe la etiqueta del mes para que no se encimen: con 12 meses en
 * 300 px entra una cada dos. `minLabelWidth` es el espacio que necesita "sept.".
 */
export function labelStep(count: number, width: number, minLabelWidth = 40): number {
  const fit = Math.max(1, Math.floor(width / minLabelWidth));
  return Math.max(1, Math.ceil(count / fit));
}
