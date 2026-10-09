"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
import { money } from "@commerce/contracts";
import { Addresses } from "./addresses";
import { Button, Notice, Empty } from "@commerce/ui";
export function Account() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: api.orders,
    enabled: !!session.data,
  });
  const client = useQueryClient();
  const router = useRouter();
  if (session.isPending)
    return (
      <p className="container section" role="status">
        Opening your account…
      </p>
    );
  if (!session.data)
    return (
      <div className="container section">
        <Empty title="Your wardrobe, your account.">
          <p>Sign in to see your orders and track delivery.</p>
          <Link className="button" href="/login">
            Sign in
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className="container section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{session.data.user.email}</span>
          <h1 style={{ fontSize: 60, marginTop: 12 }}>Your account.</h1>
        </div>
        <Button
          className="secondary"
          onClick={async () => {
            await api.logout();
            client.clear();
            router.refresh();
            router.push("/login");
          }}
        >
          Sign out
        </Button>
      </div>
      <h2 style={{ fontSize: 32, marginBottom: 24 }}>Your orders</h2>
      {orders.isPending ? (
        <p role="status">Loading orders…</p>
      ) : orders.error ? (
        <Notice>{orders.error.message}</Notice>
      ) : orders.data?.items.length ? (
        orders.data.items.map((o) => (
          <Link
            className="order-card"
            style={{ display: "block" }}
            key={o.id}
            href={`/account/orders/${o.id}`}
          >
            <div className="order-top">
              <h2>{o.number}</h2>
              <span className="badge">
                {o.paymentState.replaceAll("_", " ")}
              </span>
            </div>
            <div className="summary-row">
              <span>
                {new Date(o.createdAt).toLocaleDateString()} · {o.items.length}{" "}
                pieces
              </span>
              <span>{money(o.totalMinor)} →</span>
            </div>
          </Link>
        ))
      ) : (
        <Empty title="Your story starts here.">
          <p>Your first order will appear here.</p>
          <Link className="button" href="/catalog">
            Explore the collection
          </Link>
        </Empty>
      )}
      <Addresses />
    </div>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.order(id),
  });
  if (query.isPending)
    return (
      <p className="container section" role="status">
        Loading order…
      </p>
    );
  if (query.error)
    return (
      <div className="container section">
        <Notice>{query.error.message}</Notice>
        <Link className="button" href="/login">
          Sign in
        </Link>
      </div>
    );
  const o = query.data;
  return (
    <div className="container section" style={{ maxWidth: 1000 }}>
      <Link className="text-link" href="/account">
        ← Your orders
      </Link>
      <div className="page-heading">
        <span className="eyebrow">
          {o.paymentState.replaceAll("_", " ")} /{" "}
          {o.fulfillmentState.replaceAll("_", " ")}
        </span>
        <h1>{o.number}</h1>
      </div>
      <div className="order-card">
        {o.items.map((i) => (
          <div className="summary-row" key={i.id}>
            <span>
              {i.title} · {i.color} / {i.size} × {i.quantity}
            </span>
            <span>{money(i.quantity * i.unitPriceMinor)}</span>
          </div>
        ))}
        {[
          ["Delivery", o.shippingMinor],
          ["Discount", -o.discountMinor],
          ["Total", o.totalMinor],
        ].map(([label, amount]) => (
          <div className="summary-row" key={label}>
            <span>{label}</span>
            <strong>{money(Number(amount))}</strong>
          </div>
        ))}
      </div>
      {o.shipments.map((s) => (
        <Notice tone="info" key={s.trackingReference}>
          Shipped with {s.carrier}. Tracking: {s.trackingReference}
        </Notice>
      ))}
    </div>
  );
}
