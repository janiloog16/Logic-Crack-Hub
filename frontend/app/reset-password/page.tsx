"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get("email") ?? "");
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifying || resetToken) {
      return;
    }
    setError("");
    setMessage("");
    setVerifying(true);
    try {
      const response = await apiFetch<{ reset_token: string }>("/auth/verify-reset-code", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      setResetToken(response.reset_token);
      setMessage("✓ Code verified");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify reset code.");
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (resending || verifying || resetting || secondsLeft > 0) {
      return;
    }
    setError("");
    setMessage("");
    setResending(true);
    try {
      await apiFetch<{ status: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setOtp("");
      setResetToken("");
      setSecondsLeft(60);
      setMessage("✓ New reset code sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetting) {
      return;
    }
    setError("");
    setMessage("");
    setResetting(true);
    try {
      await apiFetch<{ status: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      });
      setMessage("✓ Password reset");
      router.push("/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset password.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="site-page game-shell flex items-center justify-center px-4 py-10">
      <section className="glass-panel w-full max-w-md rounded-3xl p-6">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#ff7373]" href="/login">
          <ArrowLeft size={16} aria-hidden />
          Back
        </Link>

        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5252] to-[#8f1014] text-white shadow-[0_12px_34px_rgba(229,57,53,0.32)]">
          <ShieldCheck size={22} aria-hidden />
        </div>
        <h1 className="mt-5 text-3xl font-black text-white">Reset Password</h1>
        <p className="mt-2 text-sm leading-6 text-[#b6b6b6]">Enter the reset code sent to {email || "your email"}.</p>

        {!resetToken ? (
          <form className="mt-6 space-y-4" onSubmit={verifyCode}>
            <fieldset className="space-y-4 disabled:opacity-70" disabled={verifying || resending}>
              <label className="block">
                <span className="text-sm font-bold text-[#d8d8d8]">Reset Code</span>
                <input
                  className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-center text-xl font-black tracking-[0.45em] text-white"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  value={otp}
                />
              </label>
            </fieldset>

            {message ? <FeedbackMessage tone="success">{message}</FeedbackMessage> : null}
            {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

            <button className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50" disabled={verifying || resending || otp.length !== 6} type="submit">
              <ButtonLoading isLoading={verifying} loadingText="Verifying...">
                Verify Code
              </ButtonLoading>
            </button>
            <button className="focus-ring w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white disabled:opacity-50" disabled={verifying || resending || secondsLeft > 0} onClick={resend} type="button">
              <ButtonLoading isLoading={resending} loadingText="Sending...">
                {secondsLeft > 0 ? `Resend Code (${secondsLeft}s)` : "Resend Code"}
              </ButtonLoading>
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={resetPassword}>
            <fieldset className="space-y-4 disabled:opacity-70" disabled={resetting}>
              <label className="block">
                <span className="text-sm font-bold text-[#d8d8d8]">New Password</span>
                <input
                  className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  value={newPassword}
                />
              </label>
            </fieldset>

            {message ? <FeedbackMessage tone="success">{message}</FeedbackMessage> : null}
            {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

            <button className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50" disabled={resetting || newPassword.length < 8} type="submit">
              <ButtonLoading isLoading={resetting} loadingText="Resetting...">
                Reset Password
              </ButtonLoading>
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
