// Value object monetario. NUNCA float. Guarda unidades menores (centavos) como
// bigint + código de moneda ISO-4217. Ver ADR-008.

export type CurrencyCode = string; // ISO-4217, p.ej. "MXN"

// Exponente decimal por moneda (cuántos dígitos tiene la unidad menor).
// La mayoría usa 2; se extiende según se necesite.
const CURRENCY_EXPONENT: Record<string, number> = {
  MXN: 2,
  USD: 2,
  EUR: 2,
};

function exponentFor(currency: CurrencyCode): number {
  const exp = CURRENCY_EXPONENT[currency.toUpperCase()];
  if (exp === undefined) {
    throw new MoneyError(`Moneda no soportada: ${currency}`);
  }
  return exp;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export class Money {
  private constructor(
    public readonly amountMinor: bigint,
    public readonly currency: CurrencyCode
  ) {}

  // Crea desde unidades menores (centavos).
  static fromMinor(amountMinor: bigint | number | string, currency: CurrencyCode): Money {
    return new Money(BigInt(amountMinor), currency.toUpperCase());
  }

  // Crea desde unidad mayor en texto ("123.45") para no perder precisión.
  static fromMajor(major: string, currency: CurrencyCode): Money {
    const cur = currency.toUpperCase();
    const exp = exponentFor(cur);
    const trimmed = major.trim();
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
    if (!match) {
      throw new MoneyError(`Importe inválido: "${major}"`);
    }
    const sign = match[1] === "-" ? -1n : 1n;
    const whole = match[2] ?? "0";
    const frac = (match[3] ?? "").padEnd(exp, "0");
    if (frac.length > exp) {
      throw new MoneyError(
        `"${major}" tiene más decimales de los que admite ${cur} (${exp})`
      );
    }
    const minor = BigInt(whole) * 10n ** BigInt(exp) + BigInt(frac || "0");
    return new Money(sign * minor, cur);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, currency.toUpperCase());
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `No se pueden operar monedas distintas: ${this.currency} vs ${other.currency}`
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  // Multiplica por una cantidad entera (p.ej. unidades vendidas).
  multiply(factor: bigint | number): Money {
    return new Money(this.amountMinor * BigInt(factor), this.currency);
  }

  isZero(): boolean {
    return this.amountMinor === 0n;
  }

  isNegative(): boolean {
    return this.amountMinor < 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  // Representación de transporte segura para JSON (minor como string).
  toJSON(): { amountMinor: string; currency: CurrencyCode } {
    return { amountMinor: this.amountMinor.toString(), currency: this.currency };
  }

  // Formato legible: "1234.50".
  toMajorString(): string {
    const exp = exponentFor(this.currency);
    const negative = this.amountMinor < 0n;
    const abs = negative ? -this.amountMinor : this.amountMinor;
    const divisor = 10n ** BigInt(exp);
    const whole = abs / divisor;
    const frac = (abs % divisor).toString().padStart(exp, "0");
    return `${negative ? "-" : ""}${whole.toString()}${exp > 0 ? `.${frac}` : ""}`;
  }
}
