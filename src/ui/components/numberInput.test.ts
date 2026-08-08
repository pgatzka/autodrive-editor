import { describe, expect, it } from "vitest";
import { commitNumber, formatNumber, isPartialNumber } from "./numberInput";
import { wrapOffset } from "../../model/grid";

describe("isPartialNumber", () => {
  it("accepts the states a number passes through while being typed", () => {
    // this is what stops "1." collapsing to "1" on the way to "1.7"
    for (const text of ["", "-", "1", "1.", "1.7", "0.5", "-0.", ",5"]) {
      expect(isPartialNumber(text)).toBe(true);
    }
  });

  it("rejects text that can never become a number", () => {
    for (const text of ["abc", "1.2.3", "1e5", "--1", "1m"]) {
      expect(isPartialNumber(text)).toBe(false);
    }
  });
});

describe("commitNumber", () => {
  it("keeps one decimal place by default", () => {
    expect(commitNumber("2.5")).toBe(2.5);
    expect(commitNumber("3.14")).toBe(3.1);
    expect(commitNumber("0.05")).toBe(0.1);
    expect(commitNumber("7")).toBe(7);
  });

  it("honours a different precision", () => {
    expect(commitNumber("6.7", { decimals: 0 })).toBe(7);
    expect(commitNumber("1.234", { decimals: 2 })).toBe(1.23);
  });

  it("accepts a comma as the decimal separator", () => {
    expect(commitNumber("2,5")).toBe(2.5);
  });

  it("clamps to the allowed range", () => {
    expect(commitNumber("0", { min: 0.1 })).toBe(0.1);
    expect(commitNumber("900", { max: 500 })).toBe(500);
    expect(commitNumber("1", { min: 2, max: 64, decimals: 0 })).toBe(2);
  });

  it("applies the transform last, so offsets wrap after rounding", () => {
    const rules = { decimals: 1, transform: (value: number) => wrapOffset(value, 2.5) };
    expect(commitNumber("3.14", rules)).toBe(0.6);
    expect(commitNumber("2.5", rules)).toBe(0);
  });

  it("returns null for input that is not a number yet", () => {
    for (const text of ["", "   ", "-", ".", "abc"]) {
      expect(commitNumber(text)).toBeNull();
    }
  });
});

describe("formatNumber", () => {
  it("shows no trailing zeros", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(1.75)).toBe("1.8");
    expect(formatNumber(0)).toBe("0");
  });
});
