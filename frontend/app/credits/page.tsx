"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { SiteHeader } from "@/components/SiteHeader";
import { apiFetch, clearSession, CreditPackagesResponse, readSavedUser } from "@/lib/api";
import type { CreditPackage, User } from "@/lib/types";

export default function CreditsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingID, setBuyingID] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = readSavedUser();
    setUser(saved);
    if (!saved) {
      setIsLoading(false);
      return;
    }
    apiFetch<CreditPackagesResponse>("/credits/packages")
      .then((response) => setPackages(response.packages))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load credit packages."))
      .finally(() => setIsLoading(false));
  }, []);

  async function buyCredits(packageID: string) {
    if (buyingID) {
      return;
    }
    setError("");
    setBuyingID(packageID);
    try {
      const response = await apiFetch<{ checkout_url: string }>("/credits/checkout", {
        method: "POST",
        body: JSON.stringify({ package_id: packageID }),
      });
      window.location.href = response.checkout_url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open Stripe checkout.");
      setBuyingID("");
    }
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  if (!user && !isLoading) {
    return (
      <main className="site-page game-shell min-h-screen">
        <SiteHeader user={null} />
        <section className="mx-auto max-w-xl px-4 py-16">
          <div className="glass-panel rounded-3xl p-6 text-center">
            <UserRound className="mx-auto text-[#ff7373]" size={42} aria-hidden />
            <h1 className="mt-4 text-3xl font-black text-white">Login Required</h1>
            <p className="mt-3 text-sm leading-6 text-[#b6b6b6]">Please sign in before buying credits.</p>
            <Link className="btn-primary ripple mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-black" href="/login">
              Go to Login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="site-page game-shell min-h-screen">
      <SiteHeader user={user} onLogout={logout} />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="glass-panel rounded-3xl p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-[#ff7373]">Credit Store</p>
              <h1 className="mt-1 text-3xl font-black text-white">Buy Credits</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b6b6b6]">
                Credits unlock asset downloads. Payments are handled securely by Stripe Checkout.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white">
              <ShieldCheck size={17} aria-hidden />
              {user?.credits ?? 0} credits
            </span>
          </div>

          {new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("payment") === "success" ? (
            <div className="mt-5">
              <FeedbackMessage tone="success">Payment received. Credits will appear after Stripe confirms the checkout.</FeedbackMessage>
            </div>
          ) : null}
          {new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("payment") === "cancelled" ? (
            <div className="mt-5">
              <FeedbackMessage tone="error">Payment was cancelled. No credits were charged.</FeedbackMessage>
            </div>
          ) : null}
          {error ? (
            <div className="mt-5">
              <FeedbackMessage tone="error">{error}</FeedbackMessage>
            </div>
          ) : null}

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {isLoading ? <p className="text-sm font-bold text-[#b6b6b6]">Loading credit packages...</p> : null}
            {packages.map((item) => (
              <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <Sparkles className="text-[#ff7373]" size={24} aria-hidden />
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-black uppercase text-[#ffb4b4]">{item.badge}</span>
                </div>
                <h2 className="mt-5 text-xl font-black text-white">{item.name}</h2>
                <p className="mt-2 text-4xl font-black text-white">{item.credits}</p>
                <p className="text-sm font-bold uppercase text-[#a9a9a9]">credits</p>
                <p className="mt-4 text-2xl font-black text-[#ffb4b4]">{formatMoney(item.amount_cents, item.currency)}</p>
                <button
                  className="focus-ring btn-primary ripple mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
                  disabled={Boolean(buyingID)}
                  onClick={() => void buyCredits(item.id)}
                  type="button"
                >
                  <ButtonLoading isLoading={buyingID === item.id} loadingText="Opening Stripe...">
                    <CreditCard size={16} aria-hidden />
                    Buy Credits
                  </ButtonLoading>
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
}
