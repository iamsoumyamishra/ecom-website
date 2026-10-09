import { it, expect } from "vitest";
import {
  deliveryFailure,
  deliveryMessage,
} from "../apps/api/src/modules/notifications/email-delivery.js";
it("classifies recipient restriction without exposing the recipient in its message", () => {
  const kind = deliveryFailure({
    name: "validation_error",
    statusCode: 403,
    message:
      "You can only send testing emails to your own email address (private@example.com).",
  });
  expect(kind).toBe("TEST_RECIPIENT_RESTRICTED");
  expect(deliveryMessage(kind, false)).toContain("Resend account");
  expect(deliveryMessage(kind, false)).not.toContain("private@example.com");
});
it("distinguishes provider network and credential failures", () => {
  expect(
    deliveryFailure({
      name: "application_error",
      message: "The request could not be resolved.",
    }),
  ).toBe("NETWORK");
  expect(deliveryFailure({ name: "validation_error", statusCode: 401 })).toBe(
    "INVALID_API_KEY",
  );
  expect(deliveryFailure({ statusCode: 429 })).toBe("RATE_LIMITED");
});
it("uses the generic email failure response in production", () => {
  for (const kind of [
    "INVALID_API_KEY",
    "NETWORK",
    "TEST_RECIPIENT_RESTRICTED",
    "NOT_CONFIGURED",
  ] as const)
    expect(deliveryMessage(kind, true)).toBe(
      "We could not send the code. Please try again later",
    );
});
