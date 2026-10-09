import { EditProduct } from "../../../features/products";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditProduct id={(await params).id} />;
}
