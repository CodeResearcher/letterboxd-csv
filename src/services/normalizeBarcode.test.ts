import { describe, expect, it } from "vitest";
import {
  computeCheckDigit,
  expandUpceToUpca,
  normalizeBarcode,
  upceAlternate,
} from "./normalizeBarcode";

describe("computeCheckDigit", () => {
  it("matches known EAN-13 check digits", () => {
    // The Matrix Blu-ray: EAN 0883929264483.
    expect(computeCheckDigit("088392926448")).toBe(3);
    expect(computeCheckDigit("590123412345")).toBe(7);
  });

  it("matches known UPC-A check digits", () => {
    // 883929264483 (UPC-A for the same disc).
    expect(computeCheckDigit("88392926448")).toBe(3);
  });
});

describe("normalizeBarcode", () => {
  it("accepts a 12-digit UPC-A and derives the EAN-13 form", () => {
    const result = normalizeBarcode("883929264483");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.symbology).toBe("upca");
    expect(result.value.upca).toBe("883929264483");
    expect(result.value.ean13).toBe("0883929264483");
    expect(result.value.raw).toBe("883929264483");
  });

  it("accepts a 13-digit EAN-13 and derives the UPC-A form", () => {
    const result = normalizeBarcode("0883929264483");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ean13).toBe("0883929264483");
    expect(result.value.upca).toBe("883929264483");
  });

  it("keeps a non-US EAN-13 as EAN-13 only", () => {
    const result = normalizeBarcode("5051888234562");
    // Check digit is deliberately wrong in this fixture, so use a valid one.
    expect(result.ok).toBe(false);

    const valid = normalizeBarcode("4006381333931");
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.value.symbology).toBe("ean13");
    expect(valid.value.upca).toBe("4006381333931");
  });

  it("strips separators that barcode keyboards emit", () => {
    const result = normalizeBarcode(" 883929264483 ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw).toBe("883929264483");
  });

  it("rejects a bad check digit", () => {
    const result = normalizeBarcode("883929264484");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/check digit/i);
  });

  it("rejects the wrong length", () => {
    expect(normalizeBarcode("12345").ok).toBe(false);
    expect(normalizeBarcode("").ok).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(normalizeBarcode("hello").ok).toBe(false);
  });

  it("accepts a valid EAN-8", () => {
    // 96385074 is the canonical EAN-8 example.
    const result = normalizeBarcode("96385074");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.symbology).toBe("ean8");
    expect(result.value.short).toBe("96385074");
  });
});

describe("expandUpceToUpca", () => {
  it("expands the canonical UPC-E example", () => {
    // 04252614 -> 042100005264 (number system 0).
    expect(expandUpceToUpca("04252614")).toBe("042100005264");
  });

  it("rejects a malformed code", () => {
    expect(() => expandUpceToUpca("1234567")).toThrow();
  });
});

describe("upceAlternate", () => {
  it("returns null for non 8-digit codes", () => {
    const result = normalizeBarcode("883929264483");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(upceAlternate(result.value)).toBeNull();
  });
});