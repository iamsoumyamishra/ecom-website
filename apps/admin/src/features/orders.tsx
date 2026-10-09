"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
import { money, type Order } from "@commerce/contracts";
import { Button, Empty, Notice } from "@commerce/ui";
function OrderActions({ order }: { order: Order }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function ship(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const data = new FormData(form);
    try {
      await api.shipOrder(
        order.id,
        String(data.get("carrier")),
        String(data.get("tracking")),
      );
      await client.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shipment failed");
    } finally {
      setBusy(false);
    }
  }
  async function refund(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const data = new FormData(form);
    try {
      await api.refund(
        order.id,
        Number(data.get("amount")),
        String(data.get("reason")),
        key,
      );
      setKey(crypto.randomUUID());
      await client.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {["PAID", "PARTIALLY_REFUNDED"].includes(order.paymentState) &&
        order.fulfillmentState === "UNFULFILLED" && (
          <form
            className="row-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void ship(e.currentTarget);
            }}
          >
            <div className="field">
              <label htmlFor={`carrier-${order.id}`}>Carrier</label>
              <input id={`carrier-${order.id}`} name="carrier" required />
            </div>
            <div className="field">
              <label htmlFor={`tracking-${order.id}`}>Tracking reference</label>
              <input id={`tracking-${order.id}`} name="tracking" required />
            </div>
            <Button disabled={busy}>Mark shipped</Button>
          </form>
        )}
      {["PAID", "PARTIALLY_REFUNDED"].includes(order.paymentState) && (
        <details>
          <summary>Request a partial or full refund</summary>
          <p>
            Requires sign-in within the last five minutes. Refunds do not
            restock items. Provider events confirm the final state.
          </p>
          <form
            className="row-actions"
            style={{ marginTop: 20 }}
            onSubmit={(e) => {
              e.preventDefault();
              void refund(e.currentTarget);
            }}
          >
            <div className="field">
              <label htmlFor={`amount-${order.id}`}>
                Refund amount (EUR cents)
              </label>
              <input
                id={`amount-${order.id}`}
                name="amount"
                type="number"
                required
                min={1}
                max={order.totalMinor}
              />
            </div>
            <div className="field">
              <label htmlFor={`reason-${order.id}`}>Reason</label>
              <input
                id={`reason-${order.id}`}
                name="reason"
                minLength={3}
                required
              />
            </div>
            <Button disabled={busy}>Request refund</Button>
          </form>
        </details>
      )}
      {error && <Notice>{error}</Notice>}
    </>
  );
}
export function Orders() {
  const q = useQuery({
    queryKey: ["admin-orders"],
    queryFn: api.adminOrders,
    refetchInterval: 15000,
  });
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">From checkout to doorstep</span>
          <h1>Orders.</h1>
        </div>
      </div>
      {q.isPending ? (
        <p role="status">Loading orders…</p>
      ) : q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : !q.data.items.length ? (
        <Empty title="Ready for your first order.">
          <p>Confirmed orders and payment status will appear here.</p>
        </Empty>
      ) : (
        q.data.items.map((o) => (
          <div className="order-card" key={o.id}>
            <div className="order-top">
              <h2>{o.number}</h2>
              <div className="row-actions">
                <span className="badge">
                  {o.paymentState.replaceAll("_", " ")}
                </span>
                <span className="badge">
                  {o.fulfillmentState.replaceAll("_", " ")}
                </span>
                <strong>{money(o.totalMinor)}</strong>
              </div>
            </div>
            {o.items.map((i) => (
              <div className="summary-row" key={i.id}>
                <span>
                  {i.title} / {i.color} / {i.size}
                </span>
                <span>
                  {i.quantity} × {money(i.unitPriceMinor)}
                </span>
              </div>
            ))}
            {o.shipments.map((s) => (
              <p key={s.trackingReference} style={{ margin: "16px 0" }}>
                Shipped: {s.carrier} · {s.trackingReference}
              </p>
            ))}
            {o.shippingAddress && (
              <p className="muted" style={{ margin: "20px 0" }}>
                {o.shippingAddress.recipient}
                <br />
                {o.shippingAddress.line1}
                {o.shippingAddress.line2 && ` / ${o.shippingAddress.line2}`}
                <br />
                {o.shippingAddress.postalCode} {o.shippingAddress.city} ·{" "}
                {o.shippingAddress.country}
              </p>
            )}
            <div style={{ marginTop: 20 }}>
              <OrderActions order={o} />
            </div>
          </div>
        ))
      )}
    </>
  );
}
