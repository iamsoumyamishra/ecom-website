"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@commerce/api-client";
import { safeReturnPath, emailInput } from "@commerce/contracts";
import { Button, Notice } from "@commerce/ui";
export function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const query = useQueryClient();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const form = useForm<{ email: string; otp: string }>();
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send(address: string) {
    setError("");
    setBusy(true);
    try {
      const normalized = emailInput.parse({ email: address.trim() }).email;
      await api.requestOtp(normalized);
      setEmail(normalized);
      setStep("code");
      setCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to request code");
    } finally {
      setBusy(false);
    }
  }
  async function verify(otp: string) {
    setError("");
    setBusy(true);
    try {
      await api.verifyOtp(email, otp);
      const session = await api.session();
      if (!session)
        throw Error("The session could not be established. Please retry.");
      if (!["STAFF", "OWNER"].includes(session.user.role))
        throw Error("Staff access required");
      await query.invalidateQueries();
      router.replace(safeReturnPath(params.get("returnTo"), "/"));
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The code is invalid or expired",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-card">
      <span className="eyebrow">Staff access</span>
      <h1>{step === "email" ? "Welcome in." : "Check your inbox."}</h1>
      <p>
        {step === "email"
          ? "Sign in with your email. We’ll send a one-use code; no password needed."
          : `Enter the six-digit code sent to ${email}. It expires in five minutes.`}
      </p>
      {error && <Notice>{error}</Notice>}
      <form
        style={{ marginTop: 28 }}
        onSubmit={form.handleSubmit((data) =>
          step === "email" ? send(data.email) : verify(data.otp),
        )}
      >
        {step === "email" ? (
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              {...form.register("email", { required: true })}
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="otp">Sign-in code</label>
            <input
              id="otp"
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              {...form.register("otp", { required: true, pattern: /^\d{6}$/ })}
            />
          </div>
        )}
        <Button disabled={busy}>
          {busy
            ? "Please wait…"
            : step === "email"
              ? "Send sign-in code"
              : "Verify & continue"}
        </Button>
      </form>
      {step === "code" && (
        <div style={{ marginTop: 20, display: "flex", gap: 20 }}>
          <button
            className="text-link"
            disabled={busy || cooldown > 0}
            onClick={() => send(email)}
          >
            {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
          <button
            className="text-link"
            onClick={() => {
              setStep("email");
              form.resetField("otp");
              setError("");
            }}
          >
            Change email
          </button>
        </div>
      )}
    </div>
  );
}
