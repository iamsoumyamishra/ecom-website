import { notFound } from "next/navigation";
import { serverApi } from "../../../lib/server";
export default async function Page({
  params,
}: {
  params: Promise<{ policy: string }>;
}) {
  const { policy } = await params;
  if (!["delivery", "privacy", "terms"].includes(policy)) notFound();
  let content: { title: string; content: string } | null = null;
  try {
    content = await serverApi(`/policies/${policy}`);
  } catch {}
  return (
    <article className="policy">
      <span className="eyebrow">Customer care</span>
      <h1>
        {content?.title ??
          {
            delivery: "Delivery & returns",
            privacy: "Privacy policy",
            terms: "Terms of service",
          }[policy]}
      </h1>
      {content ? (
        <div style={{ whiteSpace: "pre-wrap" }}>{content.content}</div>
      ) : (
        <p>
          This policy has not been published yet. Please contact the shop before
          purchasing. Launch requires approved delivery, returns, privacy and
          terms information.
        </p>
      )}
    </article>
  );
}
