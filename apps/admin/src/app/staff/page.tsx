import { Records } from "../../features/operations";
export default function Page() {
  return (
    <Records
      section="staff"
      title="Staff"
      columns={["email", "role", "disabled"]}
    />
  );
}
