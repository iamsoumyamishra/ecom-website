import { Records } from "../../features/operations";
export default function Page() {
  return (
    <Records
      section="audit"
      title="Audit history"
      columns={["createdAt", "action", "actorId", "target", "summary"]}
    />
  );
}
