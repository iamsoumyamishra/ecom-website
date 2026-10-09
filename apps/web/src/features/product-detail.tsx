"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@commerce/api-client";
import { money, type Product } from "@commerce/contracts";
import { Button, Notice, SizeGuide } from "@commerce/ui";
export function ProductDetail({ product }: { product: Product }) {
  const colors = [...new Set(product.variants.map((v) => v.color))];
  const [color, setColor] = useState(colors[0] ?? "");
  const [size, setSize] = useState("");
  const [added, setAdded] = useState(false);
  const client = useQueryClient();
  const variant = product.variants.find(
    (v) => v.color === color && v.size === size,
  );
  const add = useMutation({
    mutationFn: () => api.addItem(variant!.id, 1),
    onSuccess: async () => {
      setAdded(true);
      await client.invalidateQueries({ queryKey: ["cart"] });
    },
  });
  return (
    <div className="container pdp">
      <div className="gallery">
        {product.images.map((i, n) => (
          <div className="gallery-photo" key={i.id}>
            <Image
              src={i.url}
              alt={i.alt}
              fill
              priority={n === 0}
              sizes="(max-width:700px) 100vw,55vw"
            />
          </div>
        ))}
      </div>
      <div className="pdp-info">
        <span className="eyebrow">
          <Link href="/catalog">Collection</Link> / {product.category}
        </span>
        <h1>{product.title}</h1>
        <p className="pdp-price">
          {money(
            variant?.priceMinor ??
              Math.min(...product.variants.map((v) => v.priceMinor)),
          )}
        </p>
        <p className="pdp-description">{product.description}</p>
        <div className="option-row">
          <div className="label-row">
            <span>Colour — {color}</span>
          </div>
          <div className="swatches" role="group" aria-label="Select colour">
            {colors.map((c) => (
              <button
                className="swatch"
                key={c}
                aria-pressed={color === c}
                onClick={() => {
                  setColor(c);
                  setSize("");
                  setAdded(false);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="option-row">
          <div className="label-row">
            <span>Size {size && `— ${size}`}</span>
            <SizeGuide />
          </div>
          <div className="swatches" role="group" aria-label="Select size">
            {product.variants
              .filter((v) => v.color === color)
              .map((v) => (
                <button
                  className="swatch"
                  key={v.id}
                  aria-pressed={size === v.size}
                  disabled={!v.available}
                  aria-label={`${v.size}${!v.available ? ", sold out" : ""}`}
                  onClick={() => {
                    setSize(v.size);
                    setAdded(false);
                  }}
                >
                  {v.size}
                  {!v.available && " —"}
                </button>
              ))}
          </div>
        </div>
        <Button
          className="add-button"
          disabled={!variant || !variant.available || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending
            ? "Adding…"
            : !variant
              ? "Choose your size"
              : !variant.available
                ? "Sold out"
                : "Add to bag"}
        </Button>
        <p className="stock-status">
          {variant
            ? variant.available > 0
              ? "Available in your selected size"
              : "This size is sold out"
            : "Select a size to see availability"}
        </p>
        {add.error && <Notice>{add.error.message}</Notice>}
        {added && (
          <Notice tone="info">
            Added to your bag.{" "}
            <Link className="text-link" href="/cart">
              View bag →
            </Link>
          </Notice>
        )}
        <details>
          <summary>Fabric & care</summary>
          <p>{product.fabricCare}</p>
        </details>
        <details>
          <summary>Delivery & returns</summary>
          <p>
            Delivery options depend on your destination. Review the delivery
            policy and checkout total before payment.{" "}
            <Link className="text-link" href="/policies/delivery">
              Read the policy
            </Link>
          </p>
        </details>
      </div>
    </div>
  );
}
