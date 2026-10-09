import { Records } from "../../features/operations";
export default function Page() {
  return (
    <Records
      section="collections"
      title="Collections"
      columns={["title", "slug", "description"]}
    />
  );
}
