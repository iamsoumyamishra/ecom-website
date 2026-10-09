"use client";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
import { money } from "@commerce/contracts";
import { Empty, Notice, Button } from "@commerce/ui";
export function Bag() {
  const query = useQuery({ queryKey: ["cart"], queryFn: api.cart });
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: api.removeItem,
    onSuccess: () => client.invalidateQueries({ queryKey: ["cart"] }),
  });
  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.updateItem(id, quantity),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cart"] }),
  });
  if (query.isPending)
    return (
      <p className="container section" role="status">
        Opening your bag…
      </p>
    );
  if (query.error)
    return (
      <div className="container section">
        <Notice>{query.error.message}</Notice>
        <Button onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  const cart = query.data;
  return (
    <div className="container">
      <div className="page-heading">
        <span className="eyebrow">A few good choices</span>
        <h1>Your bag.</h1>
      </div>
      {!cart.items.length ? (
        <div style={{ paddingBottom: 80 }}>
          <Empty title="Your bag is waiting.">
            <p>Find your next everyday favourite in the collection.</p>
            <Link className="button" href="/catalog">
              Explore the collection
            </Link>
          </Empty>
        </div>
      ) : (
        <div className="cart-layout">
          <div>
            {cart.items.map((i) => (
              <div className="cart-line" key={i.id}>
                <Link
                  className="cart-image"
                  href={`/products/${i.variant.product.slug}`}
                >
                  {i.variant.product.images[0] && (
                    <Image
                      src={i.variant.product.images[0].url}
                      alt={i.variant.product.images[0].alt}
                      fill
                      sizes="110px"
                    />
                  )}
                </Link>
                <div>
                  <Link href={`/products/${i.variant.product.slug}`}>
                    <h3>{i.variant.product.title}</h3>
                  </Link>
                  <p>
                    {i.variant.color} / {i.variant.size}
                    <br />
                    Quantity: {i.quantity}
                  </p>
                  <div
                    role="group"
                    aria-label={`Quantity for ${i.variant.product.title}`}
                    className="row-actions"
                    style={{ margin: "12px 0" }}
                  >
                    <Button
                      className="secondary"
                      aria-label="Decrease quantity"
                      disabled={update.isPending || i.quantity <= 1}
                      onClick={() =>
                        update.mutate({ id: i.id, quantity: i.quantity - 1 })
                      }
                    >
                      −
                    </Button>
                    <span aria-live="polite">{i.quantity}</span>
                    <Button
                      className="secondary"
                      aria-label="Increase quantity"
                      disabled={
                        update.isPending ||
                        i.quantity >= Math.min(20, i.variant.available)
                      }
                      onClick={() =>
                        update.mutate({ id: i.id, quantity: i.quantity + 1 })
                      }
                    >
                      +
                    </Button>
                  </div>
                  <button
                    className="text-link"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(i.id)}
                  >
                    Remove
                  </button>
                </div>
                <span>{money(i.quantity * i.variant.priceMinor)}</span>
              </div>
            ))}
            {remove.error && <Notice>{remove.error.message}</Notice>}
            {update.error && <Notice>{update.error.message}</Notice>}
          </div>
          <aside className="summary-card">
            <h2>A considered choice.</h2>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{money(cart.subtotalMinor)}</span>
            </div>
            <p>
              Delivery, discounts and tax treatment are confirmed at checkout.
              Stock is reserved when checkout begins.
            </p>
            <Link className="button" href="/checkout">
              Continue to checkout ↗
            </Link>
            <Link
              className="text-link"
              style={{ display: "block", marginTop: 18, textAlign: "center" }}
              href="/catalog"
            >
              Keep exploring
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
