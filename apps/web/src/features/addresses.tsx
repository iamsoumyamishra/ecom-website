"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@commerce/api-client";
import { addressInput, type AddressInput } from "@commerce/contracts";
import { Button, Notice } from "@commerce/ui";
export type SavedAddress = AddressInput & { id: string };
export function Addresses() {
  const client = useQueryClient();
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => request<{ items: SavedAddress[] }>("/v1/me/addresses"),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/v1/me/addresses/${id}`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["addresses"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove address");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ marginTop: 64 }}>
      <h2 style={{ fontSize: 32, marginBottom: 24 }}>Delivery addresses</h2>
      {addresses.isPending ? (
        <p role="status">Loading addresses…</p>
      ) : addresses.error ? (
        <Notice>{addresses.error.message}</Notice>
      ) : (
        addresses.data.items.map((a) => (
          <div className="order-card" key={a.id}>
            <div className="section-heading">
              <div>
                <strong>{a.recipient}</strong>
                <p>
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.city}, {a.postalCode}, {a.country}
                </p>
              </div>
              <Button
                className="secondary"
                disabled={busy}
                onClick={() => void remove(a.id)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))
      )}
      <details className="order-card">
        <summary>Add a delivery address</summary>
        <form
          className="checkout-form"
          style={{ marginTop: 24 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setError("");
            setBusy(true);
            try {
              const data = addressInput.parse(
                Object.fromEntries(new FormData(form)),
              );
              await request("/v1/me/addresses", {
                method: "POST",
                body: JSON.stringify(data),
              });
              await client.invalidateQueries({ queryKey: ["addresses"] });
              form.reset();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not save address",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {[
            ["recipient", "Full name"],
            ["line1", "Street address"],
            ["line2", "Apartment / suite (optional)"],
            ["city", "City"],
            ["postalCode", "Postal code"],
            ["country", "Country code (e.g. FR)"],
            ["phone", "Phone (optional)"],
          ].map(([name, label]) => (
            <div className="field" key={name}>
              <label htmlFor={`address-${name}`}>{label}</label>
              <input
                id={`address-${name}`}
                name={name}
                required={!["line2", "phone"].includes(name)}
                maxLength={name === "country" ? 2 : 200}
                pattern={name === "country" ? "[A-Z]{2}" : undefined}
              />
            </div>
          ))}
          <Button disabled={busy}>{busy ? "Saving…" : "Save address"}</Button>
        </form>
      </details>
      {error && <Notice>{error}</Notice>}
    </section>
  );
}
