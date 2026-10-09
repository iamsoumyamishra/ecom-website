import { Records } from "../../features/operations";
export default function Page() {
  return (
    <Records
      section="discounts"
      title="Discounts"
      columns={[
        "code",
        "amountMinor",
        "usageLimit",
        "allocated",
        "redeemed",
        "endsAt",
      ]}
    />
  );
}
