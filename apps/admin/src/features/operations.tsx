"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request } from "@commerce/api-client";
import { money } from "@commerce/contracts";
import { Button, Notice, Empty } from "@commerce/ui";
export function Inventory() {
  const q = useQuery({
    queryKey: ["admin-products"],
    queryFn: api.adminProducts,
  });
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Stock with a story</span>
          <h1>Inventory.</h1>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : q.isPending ? (
        <p role="status">Loading stock…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU / product</th>
                <th>Size / colour</th>
                <th>Available</th>
                <th>Record an adjustment</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.flatMap((p) =>
                p.variants.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.sku}
                      <br />
                      <span className="muted">{p.title}</span>
                    </td>
                    <td>
                      {v.size} / {v.color}
                    </td>
                    <td>{v.available}</td>
                    <td>
                      <form
                        className="row-actions"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const data = new FormData(form);
                          setBusy(true);
                          setError("");
                          try {
                            await api.stock(
                              v.id,
                              Number(data.get("delta")),
                              String(data.get("reason")),
                            );
                            await client.invalidateQueries({
                              queryKey: ["admin-products"],
                            });
                            form.reset();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Adjustment failed",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <input
                          className="control"
                          aria-label={`Quantity change for ${v.sku}`}
                          style={{ maxWidth: 100 }}
                          type="number"
                          name="delta"
                          required
                          placeholder="+ / −"
                        />
                        <input
                          className="control"
                          aria-label={`Reason for ${v.sku}`}
                          style={{ maxWidth: 220 }}
                          name="reason"
                          required
                          minLength={3}
                          placeholder="Reason"
                        />
                        <Button disabled={busy}>Record</Button>
                      </form>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
type Row = Record<string, unknown>;
function cell(value: unknown) {
  return value === null || value === undefined
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
export function Records({
  section,
  title,
  columns,
}: {
  section: string;
  title: string;
  columns: string[];
}) {
  const q = useQuery({
    queryKey: [section],
    queryFn: () => request<{ items: Row[] }>(`/v1/admin/${section}`),
  });
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(form: HTMLFormElement) {
    setError("");
    setBusy(true);
    const d = Object.fromEntries(new FormData(form));
    let body: Record<string, unknown> = d;
    if (section === "discounts")
      body = {
        ...d,
        amountMinor: Number(d.amountMinor),
        usageLimit: Number(d.usageLimit),
        startsAt: new Date(String(d.startsAt)).toISOString(),
        endsAt: new Date(String(d.endsAt)).toISOString(),
      };
    if (section === "collections")
      body = {
        ...d,
        productIds: String(d.productIds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    try {
      await request(`/v1/admin/${section}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await client.invalidateQueries({ queryKey: [section] });
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const fields =
    section === "staff"
      ? ["email"]
      : section === "discounts"
        ? ["code", "amountMinor", "usageLimit", "startsAt", "endsAt"]
        : section === "collections"
          ? ["title", "slug", "description", "productIds"]
          : [];
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">The details that matter</span>
          <h1>{title}.</h1>
        </div>
      </div>
      {fields.length > 0 && (
        <div className="admin-panel">
          <h2>
            {section === "staff"
              ? "Invite staff"
              : section === "discounts"
                ? "Create a discount"
                : "Create an edit"}
          </h2>
          {section === "staff" && (
            <p className="muted" style={{ marginBottom: 20 }}>
              Owner access and fresh verification are required. Staff must sign
              in with their own email code.
            </p>
          )}
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create(e.currentTarget);
            }}
          >
            <div className="form-grid">
              {fields.map((field) => (
                <div className="field" key={field}>
                  <label htmlFor={field}>
                    {{
                      email: "Staff email",
                      code: "Code (uppercase)",
                      amountMinor: "Fixed discount in EUR cents",
                      usageLimit: "Maximum uses",
                      startsAt: "Starts at",
                      endsAt: "Ends at",
                      productIds: "Product IDs, comma-separated",
                      title: "Title",
                      slug: "URL slug",
                      description: "Description",
                    }[field] ?? field}
                  </label>
                  <input
                    id={field}
                    name={field}
                    required={field !== "productIds"}
                    type={
                      field === "email"
                        ? "email"
                        : ["startsAt", "endsAt"].includes(field)
                          ? "datetime-local"
                          : ["amountMinor", "usageLimit"].includes(field)
                            ? "number"
                            : "text"
                    }
                  />
                </div>
              ))}
            </div>
            <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </form>
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      {q.isPending ? (
        <p role="status">Loading {title.toLowerCase()}…</p>
      ) : q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : !q.data.items.length ? (
        <Empty title={`No ${title.toLowerCase()} yet.`}>
          <p>Records will appear as your shop grows.</p>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                {section === "staff" && <th>Access</th>}
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((row, i) => (
                <tr key={cell(row.id) ?? i}>
                  {columns.map((c) => (
                    <td key={c}>
                      {c === "amountMinor"
                        ? money(Number(row[c]))
                        : cell(row[c])}
                    </td>
                  ))}
                  {section === "staff" && (
                    <td>
                      {row.role === "STAFF" && (
                        <Button
                          disabled={busy}
                          className="secondary"
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              await request(`/v1/admin/staff/${row.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({
                                  disabled: !row.disabled,
                                }),
                              });
                              await client.invalidateQueries({
                                queryKey: [section],
                              });
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Could not change staff access",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {row.disabled ? "Restore access" : "Revoke access"}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function Settings() {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => request<Row>("/v1/admin/settings"),
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Make it yours</span>
          <h1>Shop settings.</h1>
        </div>
      </div>
      {q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : q.isPending ? (
        <p role="status">Loading configuration…</p>
      ) : (
        <div className="admin-panel">
          <h2>Launch configuration</h2>
          {Object.entries(q.data).map(([key, value]) => (
            <div className="summary-row" key={key}>
              <span>{key}</span>
              <strong>{cell(value)}</strong>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 24 }}>
            Brand, shipping countries, delivery pricing and tax treatment are
            configured through deployment environment variables. Secret values
            are kept in the API.
          </p>
        </div>
      )}
      <div className="admin-panel">
        <h2>Publish a customer policy</h2>
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setSaved(false);
            const d = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await request(`/v1/admin/policies/${d.policy}`, {
                method: "PUT",
                body: JSON.stringify({ title: d.title, content: d.content }),
              });
              setSaved(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save");
            }
          }}
        >
          <div className="field">
            <label htmlFor="policy">Policy</label>
            <select id="policy" name="policy">
              <option value="delivery">Delivery & returns</option>
              <option value="privacy">Privacy</option>
              <option value="terms">Terms</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="title">Page title</label>
            <input id="title" name="title" required />
          </div>
          <div className="field">
            <label htmlFor="content">Approved policy text</label>
            <textarea
              id="content"
              name="content"
              required
              minLength={50}
              rows={10}
            />
          </div>
          <Button>Publish policy</Button>
        </form>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="info">Policy published.</Notice>}
      </div>
    </>
  );
}
