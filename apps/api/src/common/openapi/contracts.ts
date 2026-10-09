import type { OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  productInput,
  productUpdateInput,
  addressInput,
  checkoutInput,
  stockInput,
  shipmentInput,
  refundInput,
  discountInput,
  cartItemInput,
  cartQuantityInput,
} from "@commerce/contracts";
export function addContracts(document: OpenAPIObject) {
  document.components ??= {};
  document.components.schemas ??= {};
  for (const [name, schema] of Object.entries({
    ProductInput: productInput,
    ProductUpdate: productUpdateInput,
    Address: addressInput,
    CheckoutInput: checkoutInput,
    StockInput: stockInput,
    ShipmentInput: shipmentInput,
    RefundInput: refundInput,
    DiscountInput: discountInput,
    CartItemInput: cartItemInput,
    CartQuantityInput: cartQuantityInput,
  })) {
    document.components.schemas[name] = z.toJSONSchema(schema, {
      target: "openapi-3.0",
    }) as never;
  }
  const routes: [string, string, string][] = [
    ["/api/v1/admin/products", "post", "ProductInput"],
    ["/api/v1/admin/products/{id}", "patch", "ProductUpdate"],
    ["/api/v1/cart/items", "post", "CartItemInput"],
    ["/api/v1/cart/items/{id}", "patch", "CartQuantityInput"],
    ["/api/v1/checkout", "post", "CheckoutInput"],
    ["/api/v1/admin/inventory/{id}", "post", "StockInput"],
    ["/api/v1/admin/orders/{id}/shipments", "post", "ShipmentInput"],
    ["/api/v1/admin/orders/{id}/refunds", "post", "RefundInput"],
    ["/api/v1/admin/discounts", "post", "DiscountInput"],
    ["/api/v1/me/addresses", "post", "Address"],
  ];
  for (const [path, method, schema] of routes) {
    const operation = document.paths[path]?.[method as "post" | "patch"];
    if (operation)
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schema}` },
          },
        },
      };
  }
  for (const [route, schema] of Object.entries({
    "email-otp/send-verification-otp": z.object({
      email: z.email(),
      type: z.literal("sign-in"),
    }),
    "sign-in/email-otp": z.object({
      email: z.email(),
      otp: z.string().regex(/^\d{6}$/),
    }),
  })) {
    document.paths[`/api/auth/${route}`] = {
      post: {
        tags: ["authentication"],
        summary: route.startsWith("email-otp")
          ? "Request a sign-in OTP (60-second cooldown)"
          : "Verify and consume OTP; set a host-only HttpOnly session cookie",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(schema, {
                target: "openapi-3.0",
              }) as never,
            },
          },
        },
        responses: {
          200: { description: "Success; no session token in JSON" },
          400: { description: "Invalid input or code" },
          403: { description: "Untrusted origin" },
          429: { description: "Shared rate limit or cooldown" },
          503: {
            description: "Email submission or infrastructure unavailable",
          },
        },
      },
    };
  }
  document.paths["/api/auth/get-session"] = {
    get: {
      tags: ["authentication"],
      responses: {
        200: {
          description: "Current session/user or null; private and uncached",
        },
      },
    },
  };
  document.paths["/api/auth/sign-out"] = {
    post: {
      tags: ["authentication"],
      responses: { 200: { description: "Session revoked and cookie cleared" } },
    },
  };
  document.paths["/api/webhooks/stripe"] = {
    post: {
      tags: ["payments"],
      summary: "Verify raw Stripe signature and store durable receipt",
      parameters: [
        {
          in: "header",
          name: "Stripe-Signature",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Event receipt persisted" },
        400: { description: "Signature invalid or receipt not persisted" },
      },
    },
  };
  return document;
}
