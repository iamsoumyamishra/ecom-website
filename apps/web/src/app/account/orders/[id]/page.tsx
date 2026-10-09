import { OrderDetail } from "../../../../features/account";
export const metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderDetail id={(await params).id} />;
}
