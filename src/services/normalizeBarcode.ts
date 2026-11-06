/**
 * Barcode normalization.
 *
 * A scanned disc barcode can arrive as UPC-A (12 digits), EAN-13 (13 digits),
 * UPC-E (8 digits) or EAN-8 (8 digits). Providers are inconsistent about which
 * form they want, so we normalize once, here, and give every provider the same
 * shape.
 */

export interface NormalizedBarcode {
  /** Digits exactly as scanned or typed, before normalization. */
  raw: string;
  /** Canonical 13-digit EAN form when one exists (UPC-A is zero-padded). */
  ean13: string;
  /** Canonical 12-digit UPC-A form, or null when the code is not a UPC-A/EAN-13. */
  upca: string | null;
  /** 8-digit UPC-E or EAN-8 form, or null. */
  short: string | null;
  symbology: "ean13" | "upca" | "ean8" | "upce";
}

export type BarcodeParseResult =
  | { ok: true; value: NormalizedBarcode }
  | { ok: false; error: string };

/** EAN-13 / UPC-A / EAN-8 check digit. */
export function computeCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  // Weight 3 for the digits closest to the check digit, alternating outwards.
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  return computeCheckDigit(body) === Number(digits[digits.length - 1]);
}

/**
 * Expand a UPC-E (8 digit) code to its UPC-A equivalent.
 * Layout: number system (0 or 1) + 6 payload digits + check digit.
 */
export function expandUpceToUpca(code: string): string {
  if (!/^[01]\d{7}$/.test(code)) throw new Error(`Not a UPC-E code: ${code}`);
  const ns = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  let body: string;
  switch (d[5]) {
    case "0":
    case "1":
    case "2":
      body = `${d.slice(0, 2)}${d[5]}0000${d.slice(2, 5)}`;
      break;
    case "3":
      body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
      break;
    case "4":
      body = `${d.slice(0, 4)}00000${d[4]}`;
      break;
    default:
      body = `${d.slice(0, 5)}0000${d[5]}`;
      break;
  }
  return `${ns}${body}${check}`;
}

/** How much of a code we trust when choosing a symbology. */
function classify(digits: string): NormalizedBarcode["symbology"] | null {
  if (digits.length === 13) return digits.startsWith("0") ? "upca" : "ean13";
  if (digits.length === 12) return "upca";
  if (digits.length === 8) return "ean8";
  return null;
}

/**
 * Parse user input or a scanner hit into a normalized barcode.
 * Accepts separators and whitespace, which barcode keyboards often emit.
 */
export function normalizeBarcode(input: string): BarcodeParseResult {
  const digits = input.replace(/[^0-9Xx]/g, "").trim();
  if (!digits) return { ok: false, error: "Enter a barcode." };
  if (!/^\d+$/.test(digits)) return { ok: false, error: "Barcodes contain digits only." };

  const symbology = classify(digits);
  if (!symbology) {
    return {
      ok: false,
      error: "Expected a 12 or 13 digit UPC/EAN code (or an 8 digit short code).",
    };
  }
  if (!hasValidCheckDigit(digits)) {
    return { ok: false, error: "That barcode's check digit is invalid. Try scanning it again." };
  }

  if (symbology === "ean8") {
    // An 8-digit scan is either EAN-8 or UPC-E. We cannot tell them apart from
    // the digits alone, so prefer EAN-8 and let providers try the literal code.
    // Providers that need UPC-A get the zero-padded EAN-13-ish form below.
    return {
      ok: true,
      value: {
        raw: digits,
        ean13: `000000${digits}`.slice(-13),
        upca: null,
        short: digits,
        symbology: "ean8",
      },
    };
  }

  const ean13 = digits.length === 12 ? `0${digits}` : digits;
  const upca = ean13.startsWith("0") ? ean13.slice(1) : null;
  return {
    ok: true,
    value: {
      raw: digits,
      ean13,
      upca: upca ?? ean13,
      short: null,
      symbology,
    },
  };
}

/** Attempt a UPC-E interpretation of an 8 digit scan, for providers that accept UPC-A only. */
export function upceAlternate(code: NormalizedBarcode): string | null {
  if (code.symbology !== "ean8" || !code.short) return null;
  if (!/^[01]\d{7}$/.test(code.short)) return null;
  if (!hasValidCheckDigit(code.short)) return null;
  try {
    return expandUpceToUpca(code.short);
  } catch {
    return null;
  }
}