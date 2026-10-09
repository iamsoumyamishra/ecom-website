"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { request } from "@commerce/api-client";
import { money } from "@commerce/contracts";
import { Notice } from "@commerce/ui";
export function Overview() {
  const q = useQuery({
    queryKey: ["overview"],
    queryFn: () =>
      request<{
        revenueMinor: number;
        unfulfilledOrders: number;
        pendingNotifications: number;
        pendingWebhooks: number;
      }>("/v1/admin/overview"),
  });
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">A little perspective</span>
          <h1>Your shop, at a glance.</h1>
        </div>
        <Link className="button" href="/products/new">
          Create a product +
        </Link>
      </div>
      {q.isPending ? (
        <p role="status">Loading overview…</p>
      ) : q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span className="eyebrow">Net confirmed revenue</span>
              <p className="value">{money(q.data.revenueMinor)}</p>
              <span className="muted">
                Successful payments less confirmed refunds
              </span>
            </div>
            <div className="stat">
              <span className="eyebrow">Ready to fulfill</span>
              <p className="value">{q.data.unfulfilledOrders}</p>
              <Link href="/orders" className="text-link">
                Review orders →
              </Link>
            </div>
            <div className="stat">
              <span className="eyebrow">Pending notifications</span>
              <p className="value">{q.data.pendingNotifications}</p>
              <span className="muted">
                Durable delivery intent in the outbox
              </span>
            </div>
          </div>
          {q.data.pendingWebhooks > 0 && (
            <Notice tone="info">
              {q.data.pendingWebhooks} payment events awaiting reconciliation.
            </Notice>
          )}
          <div className="admin-panel">
            <span className="eyebrow">From idea to collection</span>
            <h2 style={{ marginTop: 16 }}>Make room for what’s next.</h2>
            <p className="muted" style={{ maxWidth: 500, marginBottom: 24 }}>
              Create a draft, add its sizes and colours, and set opening stock.
              Publish when photography, fabric details and variants are ready.
            </p>
            <div className="row-actions">
              <Link className="button" href="/products/new">
                Create your next piece ↗
              </Link>
              <Link className="text-link" href="/products">
                Manage the collection
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
