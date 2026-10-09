import type {
  Cart,
  Product,
  ProductPage,
  ProductInput,
  Session,
  Order,
  CheckoutInput,
} from "@commerce/contracts";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({
    message: "The service is unavailable. Please try again.",
  }));
  if (!res.ok)
    throw new ApiError(
      res.status,
      typeof body.message === "string" ? body.message : "Request failed",
    );
  return body as T;
}
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const api = {
  products: (query = "") => request<ProductPage>(`/v1/products${query}`),
  product: (slug: string) =>
    request<Product>(`/v1/products/${encodeURIComponent(slug)}`),
  session: () => request<Session | null>("/auth/get-session"),
  requestOtp: (email: string) =>
    post("/auth/email-otp/send-verification-otp", { email, type: "sign-in" }),
  verifyOtp: (email: string, otp: string) =>
    post("/auth/sign-in/email-otp", { email, otp }),
  logout: () => post("/auth/sign-out", {}),
  cart: () => request<Cart>("/v1/cart"),
  addItem: (variantId: string, quantity: number) =>
    post<Cart>("/v1/cart/items", { variantId, quantity }),
  updateItem: (id: string, quantity: number) =>
    request<Cart>(`/v1/cart/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),
  removeItem: (id: string) =>
    request<Cart>(`/v1/cart/items/${id}`, { method: "DELETE" }),
  mergeCart: () => post<Cart>("/v1/cart/merge", {}),
  checkout: (input: CheckoutInput) =>
    post<{ id: string; url: string | null; state: string }>(
      "/v1/checkout",
      input,
    ),
  checkoutStatus: (id: string) =>
    request<{ state: string; order: Order }>(`/v1/checkout/${id}`),
  orders: () => request<{ items: Order[] }>("/v1/orders"),
  order: (id: string) => request<Order>(`/v1/orders/${id}`),
  adminProducts: () => request<ProductPage>("/v1/admin/products"),
  createProduct: (data: ProductInput) =>
    post<Product>("/v1/admin/products", data),
  publishProduct: (id: string) =>
    post<Product>(`/v1/admin/products/${id}/publish`, {}),
  adminOrders: () => request<{ items: Order[] }>("/v1/admin/orders"),
  shipOrder: (id: string, carrier: string, trackingReference: string) =>
    post(`/v1/admin/orders/${id}/shipments`, { carrier, trackingReference }),
  refund: (
    id: string,
    amountMinor: number,
    reason: string,
    idempotencyKey: string,
  ) =>
    post(`/v1/admin/orders/${id}/refunds`, {
      amountMinor,
      reason,
      idempotencyKey,
    }),
  stock: (id: string, delta: number, reason: string) =>
    post(`/v1/admin/inventory/${id}`, { delta, reason }),
};
