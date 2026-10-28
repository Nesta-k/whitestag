const PAYMENT_REFERENCE_PREFIX = "whitestag.payment.reference.";
const LATEST_PAYMENT_REFERENCE = "whitestag.payment.latest-reference";

export function savePaymentReference(
  orderReference: string,
  paymentReference: string,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${PAYMENT_REFERENCE_PREFIX}${orderReference}`,
    paymentReference,
  );
  window.localStorage.setItem(LATEST_PAYMENT_REFERENCE, paymentReference);
  window.localStorage.setItem("whitestag.checkout.last-order", orderReference);
}

export function getPaymentReference(orderReference: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(
    `${PAYMENT_REFERENCE_PREFIX}${orderReference}`,
  );
}

export function getLatestPaymentReference(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LATEST_PAYMENT_REFERENCE);
}

export function getOrderReferenceForPayment(
  paymentReference: string,
): string | null {
  if (typeof window === "undefined") return null;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (
      key?.startsWith(PAYMENT_REFERENCE_PREFIX) &&
      window.localStorage.getItem(key) === paymentReference
    ) {
      return key.slice(PAYMENT_REFERENCE_PREFIX.length);
    }
  }
  return null;
}

export function redirectToPaystack(authorizationUrl: string): void {
  const parsedUrl = new URL(authorizationUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "checkout.paystack.com" ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("The payment provider returned an invalid checkout link.");
  }
  window.location.assign(parsedUrl.toString());
}

export function getOrCreatePaymentIdempotencyKey(
  orderReference: string,
  newAttempt = false,
): string {
  const keyName = `whitestag.payment.idempotency.${orderReference}`;
  const existing = newAttempt ? null : window.localStorage.getItem(keyName);
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.localStorage.setItem(keyName, key);
  return key;
}
