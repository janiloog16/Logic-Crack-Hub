"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    setError("");
    setSending(true);
    try {
      await apiFetch<{ status: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      router.push(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send reset code.");
    } finally {
      setSending(false);
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
          <KeyRound size={22} aria-hidden />
        </div>
        <h1 className="mt-5 text-3xl font-black text-white">Forgot Password</h1>
        <p className="mt-2 text-sm leading-6 text-[#b6b6b6]">Enter your email and we will send a reset code.</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <fieldset className="space-y-4 disabled:opacity-70" disabled={sending}>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Email</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
          </fieldset>

          {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

          <button className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50" disabled={sending || !email.trim()} type="submit">
            <ButtonLoading isLoading={sending} loadingText="Sending...">
              Send Code
            </ButtonLoading>
          </button>
        </form>
      </section>
    </main>
  );
}
