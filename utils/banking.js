export const TRANSFER_TAX_RATE = 0.02;
export const EXCHANGE_RATE = 9.4;

export const CURRENCIES = {
  krw: { code: "KRW", name: "корейских вон", symbol: "₩", emoji: "💳" },
  yen: { code: "YEN", name: "японских йен", symbol: "¥", emoji: "💴" },
};

function safePositiveInteger(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function calculateTransfer(amount) {
  const sent = safePositiveInteger(amount);
  if (!sent) return { valid: false, reason: "invalid_amount" };
  const tax = Math.ceil(sent * TRANSFER_TAX_RATE);
  const received = sent - tax;
  if (!Number.isSafeInteger(tax) || !Number.isSafeInteger(received) || received < 1) {
    return { valid: false, reason: "below_minimum" };
  }
  return { valid: true, sent, tax, received };
}

export function calculateExchange(sourceCurrency, amount) {
  const spent = safePositiveInteger(amount);
  if (!spent || !CURRENCIES[sourceCurrency]) {
    return { valid: false, reason: "invalid_amount" };
  }
  const targetCurrency = sourceCurrency === "krw" ? "yen" : "krw";
  const received = sourceCurrency === "krw"
    ? Math.floor(spent / EXCHANGE_RATE)
    : Math.floor(spent * EXCHANGE_RATE);
  if (!Number.isSafeInteger(received) || received < 1) {
    return {
      valid: false,
      reason: "below_minimum",
      minimum: sourceCurrency === "krw" ? Math.ceil(EXCHANGE_RATE) : 1,
    };
  }
  return { valid: true, spent, received, sourceCurrency, targetCurrency };
}
