import { Records } from "../../features/operations";
export default function Page() {
  return (
    <Records
      section="customers"
      title="Customers"
      columns={["email", "name", "createdAt", "disabled"]}
    />
  );
}
