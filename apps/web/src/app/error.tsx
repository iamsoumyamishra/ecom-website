"use client";
import { Button, Notice } from "@commerce/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container section">
      <Notice>We couldn’t load this page. Please try again.</Notice>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
