import { OrderStatus } from "../../../features/order-status";
export const metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { attempt } = await searchParams;
  return attempt ? (
    <OrderStatus attempt={attempt} />
  ) : (
    <div className="container section">
      <h1>Checkout not found.</h1>
    </div>
  );
}
