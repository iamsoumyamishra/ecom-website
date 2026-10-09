"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request, ApiError } from "@commerce/api-client";
import { type AddressInput, money, addressInput } from "@commerce/contracts";
import { Button, Notice } from "@commerce/ui";
import Link from "next/link";
import type { SavedAddress } from "./addresses";
export function Checkout() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const cart = useQuery({ queryKey: ["cart"], queryFn: api.cart });
  const config = useQuery({
    queryKey: ["checkout-config"],
    queryFn: () =>
      request<{
        countries: string[];
        shippingMinor: number;
        taxPolicy: string;
        configured: boolean;
      }>("/v1/checkout-config"),
  });
  const active = useQuery({
    queryKey: ["active-checkout"],
    queryFn: () =>
      request<{ id: string; state: string; providerUrl: string | null } | null>(
        "/v1/checkout/active",
      ),
    enabled: !!session.data,
    refetchInterval: 3000,
  });
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => request<{ items: SavedAddress[] }>("/v1/me/addresses"),
    enabled: !!session.data,
  });
  const form = useForm<AddressInput & { discountCode: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  async function submit(data: AddressInput & { discountCode: string }) {
    setError("");
    setBusy(true);
    try {
      const { discountCode, ...address } = data;
      const shippingAddress = addressInput.parse(address);
      const idempotencyKey = key ?? crypto.randomUUID();
      setKey(idempotencyKey);
      const result = await api.checkout({
        idempotencyKey,
        shippingAddress,
        ...(discountCode ? { discountCode } : {}),
      });
      if (!result.url)
        throw Error(
          "Checkout is pending. Retry this same request in a moment.",
        );
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      if (e instanceof ApiError && [400, 409].includes(e.status)) setKey(null);
      await client.invalidateQueries({ queryKey: ["active-checkout"] });
    } finally {
      setBusy(false);
    }
  }
  if (session.isPending || cart.isPending || config.isPending)
    return (
      <div className="container section">
        <p role="status">Preparing checkout…</p>
      </div>
    );
  if (!session.data)
    return (
      <div className="container section">
        <h1>One step closer.</h1>
        <p style={{ margin: "24px 0" }}>
          Verify your email to check out and keep track of your order.
        </p>
        <Link className="button" href="/login?returnTo=/checkout">
          Sign in to continue
        </Link>
      </div>
    );
  if (active.data)
    return (
      <div className="container section">
        <span className="eyebrow">Checkout in progress</span>
        <h1 style={{ margin: "24px 0" }}>Your pieces are reserved.</h1>
        <p className="muted">
          {active.data.providerUrl
            ? "Continue your existing secure checkout."
            : "We’re reconciling your checkout with the payment provider. This page updates automatically."}
        </p>
        <div className="row-actions" style={{ marginTop: 28 }}>
          {active.data.providerUrl && (
            <a className="button" href={active.data.providerUrl}>
              Continue to Stripe ↗
            </a>
          )}
          <Link
            className="text-link"
            href={`/checkout/return?attempt=${active.data.id}`}
          >
            View order status
          </Link>
        </div>
      </div>
    );
  return (
    <div className="container">
      <div className="page-heading">
        <span className="eyebrow">Secure checkout</span>
        <h1>The finishing touch.</h1>
      </div>
      <div className="cart-layout">
        <form className="checkout-form" onSubmit={form.handleSubmit(submit)}>
          <h2 style={{ fontSize: 30 }}>Delivery address</h2>
          {!!addresses.data?.items.length && (
            <div className="field">
              <label htmlFor="saved-address">Use a saved address</label>
              <select
                id="saved-address"
                defaultValue=""
                onChange={(e) => {
                  const a = addresses.data?.items.find(
                    (a) => a.id === e.target.value,
                  );
                  if (a)
                    for (const field of [
                      "recipient",
                      "line1",
                      "line2",
                      "city",
                      "postalCode",
                      "country",
                      "phone",
                    ] as const)
                      form.setValue(field, a[field] ?? "");
                }}
              >
                <option value="">Enter an address</option>
                {addresses.data.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.recipient} · {a.line1}
                  </option>
                ))}
              </select>
            </div>
          )}
          {["recipient", "line1", "line2", "city", "postalCode", "phone"].map(
            (name) => (
              <div className="field" key={name}>
                <label htmlFor={name}>
                  {
                    {
                      recipient: "Full name",
                      line1: "Street address",
                      line2: "Apartment / suite (optional)",
                      city: "City",
                      postalCode: "Postal code",
                      phone: "Phone (optional)",
                    }[name]
                  }
                </label>
                <input
                  id={name}
                  autoComplete={
                    {
                      recipient: "shipping name",
                      line1: "shipping address-line1",
                      line2: "shipping address-line2",
                      city: "shipping address-level2",
                      postalCode: "shipping postal-code",
                      phone: "shipping tel",
                    }[name]
                  }
                  required={!["line2", "phone"].includes(name)}
                  {...form.register(name as keyof AddressInput)}
                />
              </div>
            ),
          )}
          <div className="field">
            <label htmlFor="country">Destination country</label>
            <select id="country" required {...form.register("country")}>
              <option value="">Choose your country</option>
              {config.data?.countries.map((c) => (
                <option value={c} key={c}>
                  {new Intl.DisplayNames(["en"], { type: "region" }).of(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="discountCode">Discount code (optional)</label>
            <input id="discountCode" {...form.register("discountCode")} />
          </div>
          {error && <Notice>{error}</Notice>}
          {!config.data?.configured && (
            <Notice>
              Checkout is not configured yet. Contact support for availability.
            </Notice>
          )}
          <Button
            disabled={
              busy || !config.data?.configured || !cart.data?.items.length
            }
          >
            {busy ? "Preparing secure checkout…" : "Continue to Stripe ↗"}
          </Button>
          <p className="muted" style={{ fontSize: 12 }}>
            You’ll review the final total on Stripe before paying. Stock and
            prices are verified by our server.
          </p>
        </form>
        <aside className="summary-card">
          <h2>Your order</h2>
          {cart.data?.items.map((i) => (
            <div className="summary-row" key={i.id}>
              <span>
                {i.variant.product.title}
                <br />
                {i.variant.color} / {i.variant.size} × {i.quantity}
              </span>
              <span>{money(i.variant.priceMinor * i.quantity)}</span>
            </div>
          ))}
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{money(cart.data?.subtotalMinor ?? 0)}</span>
          </div>
          <div className="summary-row">
            <span>Delivery</span>
            <span>{money(config.data?.shippingMinor ?? 0)}</span>
          </div>
          <p>
            {config.data?.taxPolicy === "included"
              ? "Listed prices include applicable tax."
              : "Tax treatment is configured by the shop."}{" "}
            Any valid discount appears in the final Stripe total.
          </p>
        </aside>
      </div>
    </div>
  );
}
