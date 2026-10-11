/**
 * Money is always an integer number of minor units (tiyin for UZS), held as a bigint.
 * See docs/spec/04-rules.md §2. There is deliberately no conversion from a JS float.
 */
export type Money = bigint & { readonly __brand: "Money" };

/** Wrap an integer amount of minor units. Accepts a bigint or a safe-integer number. */
export function money(minorUnits: bigint | number): Money {
  if (typeof minorUnits === "number") {
    if (!Number.isSafeInteger(minorUnits)) {
      throw new RangeError(`money() needs an integer number of minor units, got ${minorUnits}`);
    }
    return BigInt(minorUnits) as Money;
  }
  return minorUnits as Money;
}

/**
 * Parse a minor-units string coming from the database or a form (e.g. "55384615").
 * Rejects decimals: the UI converts major units with `parseMajorUnits`.
 */
export function parseMinorUnits(value: string): Money {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new RangeError(`not an integer amount of minor units: "${value}"`);
  }
  return BigInt(value.trim()) as Money;
}

/**
 * Parse an amount typed in major units ("600 000", "1250.5") into minor units without floats.
 * `minorDigits` is 2 for UZS (1 so'm = 100 tiyin).
 */
export function parseMajorUnits(value: string, minorDigits = 2): Money {
  const cleaned = value.replace(/[\s_]/g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new RangeError(`not an amount: "${value}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > minorDigits) {
    throw new RangeError(`"${value}" has more than ${minorDigits} decimal places`);
  }
  const minor = BigInt(whole + fraction.padEnd(minorDigits, "0"));
  return (sign === "-" ? -minor : minor) as Money;
}

/** Integer division rounding half away from zero ("half up" for the non-negative amounts we bill). */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  if (numerator >= 0n) return (2n * numerator + denominator) / (2n * denominator);
  return -((-2n * numerator + denominator) / (2n * denominator));
}

/**
 * amount × numerator / denominator, rounded half up to a whole minor unit.
 * The single place where money is divided (proration, percentages).
 */
export function prorate(
  amount: Money,
  numerator: bigint | number,
  denominator: bigint | number,
): Money {
  const num = BigInt(numerator);
  const den = BigInt(denominator);
  if (num < 0n) throw new RangeError("numerator must not be negative");
  return divRound(amount * num, den) as Money;
}

/** Percentage given in basis points (10000 = 100%). */
export function percentOf(amount: Money, basisPoints: bigint | number): Money {
  return prorate(amount, basisPoints, 10_000n);
}

/** Round to a multiple of `unit` minor units (e.g. 100000 tiyin = 1 000 UZS), half up. */
export function roundToUnit(amount: Money, unit: Money): Money {
  if (unit <= 0n) throw new RangeError("rounding unit must be positive");
  return (divRound(amount, unit) * unit) as Money;
}

export function sum(amounts: readonly Money[]): Money {
  return amounts.reduce<bigint>((acc, a) => acc + a, 0n) as Money;
}
