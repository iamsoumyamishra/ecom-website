"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, request } from "@commerce/api-client";
import {
  productInput,
  productUpdateInput,
  type ProductInput,
  type Product,
  money,
} from "@commerce/contracts";
import { Button, Notice, Empty } from "@commerce/ui";
export function Products() {
  const q = useQuery({
    queryKey: ["admin-products"],
    queryFn: api.adminProducts,
  });
  const client = useQueryClient();
  const publish = useMutation({
    mutationFn: api.publishProduct,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-products"] }),
  });
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">The collection</span>
          <h1>Products.</h1>
        </div>
        <Link className="button" href="/products/new">
          Create product +
        </Link>
      </div>
      {publish.error && <Notice>{publish.error.message}</Notice>}
      {q.isPending ? (
        <p role="status">Loading products…</p>
      ) : q.error ? (
        <Notice>{q.error.message}</Notice>
      ) : !q.data.items.length ? (
        <Empty title="A fresh canvas.">
          <p>Create the first piece in your collection.</p>
          <Link className="button" href="/products/new">
            Create product
          </Link>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Variants</th>
                <th>From</th>
                <th>Available</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.title}</strong>
                    <br />
                    <span className="muted">{p.category}</span>
                  </td>
                  <td>
                    <span className="badge">{p.status.toLowerCase()}</span>
                  </td>
                  <td>{p.variants.length}</td>
                  <td>
                    {money(Math.min(...p.variants.map((v) => v.priceMinor)))}
                  </td>
                  <td>{p.variants.reduce((n, v) => n + v.available, 0)}</td>
                  <td>
                    <Link
                      className="text-link"
                      href={`/products/${p.id}`}
                      style={{ marginRight: 16 }}
                    >
                      Edit
                    </Link>
                    {p.status === "DRAFT" ? (
                      <Button
                        disabled={publish.isPending}
                        onClick={() => publish.mutate(p.id)}
                      >
                        Publish
                      </Button>
                    ) : (
                      <a
                        className="text-link"
                        href={`${process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000"}/products/${p.slug}`}
                      >
                        View ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function NewProduct() {
  const router = useRouter();
  const client = useQueryClient();
  const form = useForm<ProductInput>({
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      category: "Knitwear",
      fabricCare: "",
      imageUrl: "",
      imageAlt: "",
      variants: [
        { sku: "", size: "M", color: "Natural", priceMinor: 0, onHand: 0 },
      ],
    },
  });
  const variants = useFieldArray({ control: form.control, name: "variants" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  async function submit(data: ProductInput) {
    setBusy(true);
    setError("");
    try {
      const parsed = productInput.parse(data);
      await api.createProduct(parsed);
      await client.invalidateQueries({ queryKey: ["admin-products"] });
      router.push("/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Product could not be saved");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const ticket = await request<{ uploadUrl: string }>("/v1/admin/media", {
        method: "POST",
        body: JSON.stringify({
          mimeType: file.type,
          size: file.size,
          alt: form.getValues("imageAlt") || file.name,
        }),
      });
      const res = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.message);
      form.setValue("imageUrl", body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">
            <Link href="/products">Products</Link> / New piece
          </span>
          <h1>A new beginning.</h1>
        </div>
      </div>
      <form className="admin-form" onSubmit={form.handleSubmit(submit)}>
        <div className="admin-panel">
          <h2>The essentials</h2>
          <div className="form-grid">
            {(["title", "slug", "category"] as const).map((name) => (
              <div className="field" key={name}>
                <label htmlFor={name}>
                  {name === "slug"
                    ? "URL slug"
                    : name[0].toUpperCase() + name.slice(1)}
                </label>
                <input id={name} required {...form.register(name)} />
              </div>
            ))}
          </div>
          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              required
              {...form.register("description")}
            />
          </div>
          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="fabricCare">Fabric & care</label>
            <textarea
              id="fabricCare"
              required
              {...form.register("fabricCare")}
            />
          </div>
        </div>
        <div className="admin-panel">
          <h2>Photography</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="imageAlt">Image description / alt text</label>
              <input id="imageAlt" required {...form.register("imageAlt")} />
            </div>
            <div className="field">
              <label htmlFor="image">
                Upload photograph (JPEG, PNG, WebP, up to 10 MB)
              </label>
              <input
                id="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="imageUrl">Final image URL from your CDN</label>
              <input
                id="imageUrl"
                type="url"
                required
                {...form.register("imageUrl")}
              />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            {uploading
              ? "Uploading…"
              : "Storage must be configured for uploads. Development also accepts Unsplash image URLs."}
          </p>
        </div>
        <div className="admin-panel">
          <h2>Sizes, colours & stock</h2>
          <p className="muted" style={{ marginBottom: 24 }}>
            Enter prices in integer euro cents: €49.99 = 4999. Opening stock is
            recorded as an inventory movement.
          </p>
          {variants.fields.map((field, index) => (
            <div
              className="variant-row"
              key={field.id}
              style={{ marginBottom: 18 }}
            >
              {(["sku", "size", "color", "priceMinor", "onHand"] as const).map(
                (name) => (
                  <div className="field" key={name}>
                    <label htmlFor={`${field.id}-${name}`}>
                      {
                        {
                          sku: "SKU",
                          size: "Size",
                          color: "Colour",
                          priceMinor: "EUR cents",
                          onHand: "Opening stock",
                        }[name]
                      }
                    </label>
                    <input
                      id={`${field.id}-${name}`}
                      type={
                        ["priceMinor", "onHand"].includes(name)
                          ? "number"
                          : "text"
                      }
                      required
                      min={name === "priceMinor" ? 1 : 0}
                      step={1}
                      {...form.register(`variants.${index}.${name}`, {
                        valueAsNumber: ["priceMinor", "onHand"].includes(name),
                      })}
                    />
                  </div>
                ),
              )}
              <Button
                type="button"
                className="secondary"
                disabled={variants.fields.length === 1}
                aria-label={`Remove variant ${index + 1}`}
                onClick={() => variants.remove(index)}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            className="secondary"
            type="button"
            onClick={() =>
              variants.append({
                sku: "",
                size: "",
                color: "",
                priceMinor: 0,
                onHand: 0,
              })
            }
          >
            Add variant +
          </Button>
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="admin-actions">
          <Button disabled={busy || uploading}>
            {busy ? "Saving…" : "Save as draft"}
          </Button>
          <Link className="button secondary" href="/products">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

export function EditProduct({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["admin-product", id],
    queryFn: () => request<Product>(`/v1/admin/products/${id}`),
  });
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (q.isPending) return <p role="status">Loading product…</p>;
  if (q.error) return <Notice>{q.error.message}</Notice>;
  const product = q.data;
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">
            Product / {product.status.toLowerCase()}
          </span>
          <h1>{product.title}</h1>
        </div>
      </div>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setSaved(false);
          const d = new FormData(e.currentTarget);
          const fields = Object.fromEntries(d);
          try {
            const data = productUpdateInput.parse({
              title: fields.title,
              slug: fields.slug,
              description: fields.description,
              category: fields.category,
              fabricCare: fields.fabricCare,
              variants: product.variants.map((v) => ({
                id: v.id,
                sku: String(d.get(`sku-${v.id}`)),
                size: String(d.get(`size-${v.id}`)),
                color: String(d.get(`color-${v.id}`)),
                priceMinor: Number(d.get(`price-${v.id}`)),
              })),
            });
            await request(`/v1/admin/products/${id}`, {
              method: "PATCH",
              body: JSON.stringify(data),
            });
            await client.invalidateQueries({ queryKey: ["admin-products"] });
            await q.refetch();
            setSaved(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Update failed");
          }
        }}
      >
        <div className="admin-panel">
          <h2>Product details</h2>
          <div className="form-grid">
            {(
              [
                "title",
                "slug",
                "category",
                "description",
                "fabricCare",
              ] as const
            ).map((name) => (
              <div className="field" key={name}>
                <label htmlFor={name}>{name}</label>
                <input
                  id={name}
                  name={name}
                  defaultValue={product[name]}
                  required
                />
              </div>
            ))}
          </div>
        </div>
        <div className="admin-panel">
          <h2>Variants</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Adjust stock separately in Inventory. Historical order prices and
            variant descriptions remain unchanged.
          </p>
          {product.variants.map((v) => (
            <div className="form-grid" key={v.id} style={{ marginBottom: 20 }}>
              {(["sku", "size", "color", "price"] as const).map((name) => (
                <div className="field" key={name}>
                  <label htmlFor={`${name}-${v.id}`}>
                    {name === "price" ? "EUR cents" : name}
                  </label>
                  <input
                    id={`${name}-${v.id}`}
                    name={`${name}-${v.id}`}
                    type={name === "price" ? "number" : "text"}
                    min={1}
                    required
                    defaultValue={name === "price" ? v.priceMinor : v[name]}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="info">Product updated.</Notice>}
        <div className="row-actions">
          <Button>Save changes</Button>
          <Link className="button secondary" href="/products">
            Back to products
          </Link>
        </div>
      </form>
    </>
  );
}
