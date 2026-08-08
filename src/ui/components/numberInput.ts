/**
 * Parsing rules for the editable numeric fields.
 *
 * A controlled number input cannot re-parse on every keystroke: typing "1."
 * on the way to "1.7" would collapse to "1" and eat the decimal point. The
 * field therefore keeps what was typed until it is committed, and this module
 * decides what a committed string means.
 */

export interface NumberRules {
  min?: number;
  max?: number;
  /** decimal places kept on commit */
  decimals?: number;
  /** applied after rounding and clamping — used to wrap grid offsets */
  transform?: (value: number) => number;
}

/** The committed value of a typed string, or null when it is not a number. */
export function commitNumber(text: string, rules: NumberRules = {}): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;

  const rounded = roundTo(parsed, rules.decimals ?? 1);
  const clamped = clamp(rounded, rules.min, rules.max);
  return rules.transform ? rules.transform(clamped) : clamped;
}

/** Display text for a stored value: no trailing zeros, so "2" not "2.0". */
export function formatNumber(value: number, decimals = 1): string {
  return String(roundTo(value, decimals));
}

/** Accepts the intermediate states of typing a number, so keystrokes are not rejected. */
export function isPartialNumber(text: string): boolean {
  return /^-?\d*[.,]?\d*$/.test(text.trim());
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}
