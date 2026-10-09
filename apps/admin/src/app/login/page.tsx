import { Suspense } from "react";
import { Login } from "../../features/login";
export default function LoginPage() {
  return (
    <Suspense fallback={<p role="status">Loading sign-in…</p>}>
      <Login />
    </Suspense>
  );
}
