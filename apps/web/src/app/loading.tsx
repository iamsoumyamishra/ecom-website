export default function Loading() {
  return (
    <div className="container section" aria-busy="true">
      <p role="status">Loading…</p>
      <div className="skeleton" style={{ height: 300, marginTop: 24 }} />
    </div>
  );
}
