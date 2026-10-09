export type DeliveryFailure =
  | "NOT_CONFIGURED"
  | "TEST_RECIPIENT_RESTRICTED"
  | "SENDER_UNVERIFIED"
  | "INVALID_API_KEY"
  | "RATE_LIMITED"
  | "NETWORK"
  | "PROVIDER";
export function deliveryFailure(error: {
  name?: string;
  message?: string;
  statusCode?: number | null;
}): DeliveryFailure {
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("only send testing emails") ||
    message.includes("testing emails to your own")
  )
    return "TEST_RECIPIENT_RESTRICTED";
  if (
    message.includes("domain is not verified") ||
    message.includes("verify a domain")
  )
    return "SENDER_UNVERIFIED";
  if (
    error.statusCode === 401 ||
    error.name === "invalid_api_key" ||
    message.includes("api key is invalid")
  )
    return "INVALID_API_KEY";
  if (error.statusCode === 429 || error.name === "rate_limit_exceeded")
    return "RATE_LIMITED";
  if (
    error.name === "application_error" ||
    message.includes("fetch failed") ||
    message.includes("could not be resolved")
  )
    return "NETWORK";
  return "PROVIDER";
}
export class EmailSubmissionError extends Error {
  constructor(readonly kind: DeliveryFailure) {
    super("Email submission failed");
  }
}
export function deliveryMessage(kind: DeliveryFailure, production: boolean) {
  const generic = "We could not send the code. Please try again later";
  if (production) return generic;
  const messages: Partial<Record<DeliveryFailure, string>> = {
    NOT_CONFIGURED:
      "Resend is not configured. Set RESEND_API_KEY in apps/api/.env and restart the API.",
    TEST_RECIPIENT_RESTRICTED:
      "Resend’s test sender can only send to the email address used by your Resend account. Use that address to sign in.",
    SENDER_UNVERIFIED:
      "The sender is not verified. For local testing set EMAIL_FROM=Forme <onboarding@resend.dev> and restart the API.",
    INVALID_API_KEY:
      "Resend rejected the API key. Check RESEND_API_KEY in apps/api/.env and restart the API.",
    RATE_LIMITED:
      "Resend’s sending limit was reached. Wait before requesting another code.",
    NETWORK:
      "The API could not connect to Resend. Check internet access, DNS and proxy settings, then retry.",
  };
  return messages[kind] ?? generic;
}
