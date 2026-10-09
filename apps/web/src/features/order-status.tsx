"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
import { money } from "@commerce/contracts";
import { Notice, Button } from "@commerce/ui";
export function OrderStatus({ attempt }: { attempt: string }) {
  const query = useQuery({
    queryKey: ["checkout", attempt],
    queryFn: () => api.checkoutStatus(attempt),
    refetchInterval: (q) =>
      ["CREATING", "OPEN"].includes(q.state.data?.state ?? "") ? 3000 : false,
  });
  if (query.isPending)
    return (
      <div className="container section">
        <p role="status">Checking payment status…</p>
      </div>
    );
  if (query.error)
    return (
      <div className="container section">
        <Notice>{query.error.message}</Notice>
        <Link
          className="button"
          href={`/login?returnTo=${encodeURIComponent(`/checkout/return?attempt=${attempt}`)}`}
        >
          Sign in to view status
        </Link>
      </div>
    );
  const { state, order } = query.data;
  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <span className="eyebrow">Order {order.number}</span>
      <h1 style={{ margin: "24px 0" }}>
        {state === "PAID"
          ? "Thank you."
          : "EXPIRED" === state
            ? "Checkout expired."
            : state === "FAILED"
              ? "Checkout unavailable."
              : state === "REVIEW"
                ? "We’re reviewing your order."
                : "Your order is pending."}
      </h1>
      <p className="muted">
        {state === "PAID"
          ? "Your payment is confirmed and your pieces are reserved for fulfillment."
          : "We confirm payment with Stripe. Returning to this page does not confirm or cancel a payment."}
      </p>
      <div className="order-card" style={{ marginTop: 32 }}>
        {order.items.map((i) => (
          <div className="summary-row" key={i.id}>
            <span>
              {i.title} · {i.color} / {i.size} × {i.quantity}
            </span>
            <span>{money(i.unitPriceMinor * i.quantity)}</span>
          </div>
        ))}
        <div className="summary-row">
          <strong>Order total</strong>
          <strong>{money(order.totalMinor)}</strong>
        </div>
      </div>
      <div className="row-actions">
        <Link className="button" href={`/account/orders/${order.id}`}>
          View your order
        </Link>
        <Button className="secondary" onClick={() => query.refetch()}>
          Refresh status
        </Button>
        <Link className="text-link" href="/catalog">
          Explore the collection
        </Link>
      </div>
    </div>
  );
}
