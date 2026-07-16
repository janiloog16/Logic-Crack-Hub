"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Download, Heart, Star } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { SiteHeader } from "@/components/SiteHeader";
import { apiFetch, clearSession, readSavedUser, SingleAssetResponse } from "@/lib/api";
import { fallbackAssets } from "@/lib/fallback";
import type { Asset, User } from "@/lib/types";

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const assetID = params.id;
  const [user, setUser] = useState<User | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [message, setMessage] = useState("");
  const [isFavorited, setIsFavorited] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [hasReview, setHasReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);

  const fallback = useMemo(
    () => fallbackAssets.find((item) => item.slug === assetID || String(item.id) === assetID) ?? fallbackAssets[0],
    [assetID],
  );

  useEffect(() => {
    const savedUser = readSavedUser();
    setUser(savedUser);
    async function load() {
      try {
        const response = await apiFetch<SingleAssetResponse>(`/assets/${assetID}`);
        setAsset(response.asset);
        if (savedUser) {
          const state = await apiFetch<{
            favorited: boolean;
            has_downloaded: boolean;
            download_url: string | null;
            review: null | { rating: number; comment: string; updated_at: string };
          }>(`/assets/${response.asset.id}/me`);
          setIsFavorited(state.favorited);
          setHasDownloaded(state.has_downloaded);
          setDownloadUrl(state.download_url ?? "");
          if (state.review) {
            setHasReview(true);
            setRating(state.review.rating);
            setComment(state.review.comment);
          } else {
            setHasReview(false);
            setRating(5);
            setComment("");
          }
        }
      } catch {
        setAsset(fallback);
      }
    }
    void load();
  }, [assetID, fallback]);

  function logout() {
    clearSession();
    setUser(null);
  }

  async function downloadAsset() {
    if (isPurchasing) {
      return;
    }
    if (!user || !asset) {
      setMessage("Login first to spend credits and download assets.");
      return;
    }
    if (hasDownloaded) {
      if (downloadUrl) {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        setMessage("Download URL is not set for this asset yet.");
      }
      return;
    }
    setIsPurchasing(true);
    setMessage("");
    try {
      const response = await apiFetch<{ charged_credits: number; already_owned: boolean; download_url: string }>(`/assets/${asset.id}/download`, {
        method: "POST",
      });
      const remaining = Math.max(user.credits - response.charged_credits, 0);
      setUser({ ...user, credits: remaining });
      setHasDownloaded(true);
      setDownloadUrl(response.download_url);
      setMessage(response.already_owned ? "Download ready. You already owned this asset." : "✓ Purchased. Download is unlocked now.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not start download. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  }

  async function favoriteAsset() {
    if (isFavoriting) {
      return;
    }
    if (!user || !asset) {
      setMessage("Login first to favorite assets.");
      return;
    }
    setIsFavoriting(true);
    try {
      const response = await apiFetch<{ favorited: boolean }>(`/assets/${asset.id}/favorite`, { method: "POST" });
      setIsFavorited(response.favorited);
      setMessage(response.favorited ? "Added to favorites." : "Removed from favorites.");
    } catch {
      setMessage("Could not update favorite.");
    } finally {
      setIsFavoriting(false);
    }
  }

  async function submitReview() {
    if (isSavingReview) {
      return;
    }
    if (!user || !asset) {
      setMessage("Login first to review assets.");
      return;
    }
    setIsSavingReview(true);
    try {
      const response = await apiFetch<{ rating: number; comment: string }>(`/assets/${asset.id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      });
      setHasReview(true);
      setRating(response.rating);
      setComment(response.comment);
      setMessage(hasReview ? "Review updated." : "Review saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save review.");
    } finally {
      setIsSavingReview(false);
    }
  }

  if (!asset) {
    return (
      <main className="site-page game-shell">
        <SiteHeader user={user} onLogout={logout} />
        <div className="mx-auto max-w-7xl px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
          <div className="game-card rounded-3xl p-5">
            <div className="h-7 w-48 rounded shimmer" />
            <div className="mt-4 h-64 rounded-3xl shimmer" />
          </div>
        </div>
      </main>
    );
  }

  const featureParagraphs = toParagraphs(asset.features);

  return (
    <main className="site-page game-shell">
      <SiteHeader user={user} onLogout={logout} />
      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 lg:px-8">
        <Link className="site-back-link inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold" href="/">
          <ArrowLeft size={16} aria-hidden />
          Back to catalog
        </Link>

        <section className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <motion.div className="space-y-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
            <div className="game-card overflow-hidden rounded-[28px]">
              <div className="relative">
                <img className="aspect-[16/8] w-full object-cover" loading="lazy" src={asset.thumbnail_url} alt={`${asset.title} preview`} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b090a] via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-black uppercase text-white backdrop-blur-md">
                    {asset.category.name}
                  </span>
                  <span className="rounded-full border border-red-300/20 bg-red-500/15 px-3 py-1 text-xs font-black text-red-100 backdrop-blur-md">
                    {asset.unity_version}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-black text-white backdrop-blur-md">v{asset.version}</span>
                </div>
              </div>
            </div>

            <section className="glass-panel rounded-3xl p-5 sm:p-7">
              <h1 className="text-3xl font-black leading-tight text-white sm:text-5xl">{asset.title}</h1>
              <p className="mt-4 max-w-4xl text-base leading-8 text-[#b6b6b6]">{asset.description}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric icon={<Star className="text-[#ffcb45]" size={20} aria-hidden />} label="Rating" value={asset.rating.toFixed(1)} />
                <Metric icon={<Download className="text-[#ff5252]" size={20} aria-hidden />} label="Downloads" value={String(asset.download_count)} />
                <Metric icon={<Coins className="text-[#ff5252]" size={20} aria-hidden />} label="Credits" value={String(asset.credit_cost)} />
              </div>
            </section>

            <section className="glass-panel rounded-3xl p-5 sm:p-7">
              <h2 className="text-2xl font-black text-white">Features</h2>
              <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                {featureParagraphs.length > 0 ? (
                  featureParagraphs.map((feature, index) => (
                    <p className="whitespace-pre-line text-sm font-semibold leading-7 text-[#d8d8d8]" key={`${feature}-${index}`}>
                      {feature}
                    </p>
                  ))
                ) : (
                  <p className="text-sm font-semibold leading-7 text-[#d8d8d8]">No feature details have been added yet.</p>
                )}
              </div>
            </section>
          </motion.div>

          <aside className="space-y-5">
            <section className="glass-panel rounded-3xl p-5">
              <h2 className="text-2xl font-black text-white">Download</h2>
              <p className="mt-2 text-sm leading-6 text-[#b6b6b6]">
                {hasDownloaded ? "You already unlocked this asset. Download opens in a new tab." : "First download spends credits. Re-downloads are free after purchase."}
              </p>
              <button
                className="focus-ring btn-primary ripple mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black"
                disabled={isPurchasing}
                onClick={downloadAsset}
                type="button"
              >
                <ButtonLoading isLoading={isPurchasing} loadingText="Spending Credits...">
                  <Download size={16} aria-hidden />
                  {hasDownloaded ? "Download asset" : `Spend ${asset.credit_cost} credits`}
                </ButtonLoading>
              </button>
              <button
                className={`focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
                  isFavorited ? "border border-red-400/50 bg-red-500/15 text-red-100" : "btn-secondary"
                }`}
                aria-pressed={isFavorited}
                disabled={isFavoriting}
                onClick={favoriteAsset}
                type="button"
              >
                <ButtonLoading isLoading={isFavoriting} loadingText="Saving...">
                  <Heart fill={isFavorited ? "currentColor" : "none"} size={16} aria-hidden />
                  {isFavorited ? "Favorited" : "Add to favorites"}
                </ButtonLoading>
              </button>
              {message ? (
                <div className="mt-3">
                  <FeedbackMessage tone={message.includes("✓") || message.includes("saved") || message.includes("Added") ? "success" : "info"}>
                    {message}
                  </FeedbackMessage>
                </div>
              ) : null}
            </section>

            <section className="glass-panel rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3">
              <div id="review">
                  <h2 className="text-2xl font-black text-white">{hasReview ? "Edit your review" : "Review asset"}</h2>
                  {hasReview ? <p className="mt-1 text-sm font-semibold text-red-100">Your saved review is loaded below.</p> : null}
                </div>
                {hasReview ? (
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold uppercase text-red-100">Saved</span>
                ) : null}
              </div>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-[#d8d8d8]">Rating</span>
                <select
                  className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm font-semibold text-white"
                  disabled={isSavingReview}
                  onChange={(event) => setRating(Number(event.target.value))}
                  value={rating}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} stars
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-[#d8d8d8]">Comment</span>
                <textarea
                  className="focus-ring mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                  disabled={isSavingReview}
                  onChange={(event) => setComment(event.target.value)}
                  value={comment}
                />
              </label>
              <button
                className="focus-ring btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black"
                disabled={isSavingReview}
                onClick={submitReview}
                type="button"
              >
                <ButtonLoading isLoading={isSavingReview} loadingText="Saving...">
                  <Star size={16} aria-hidden />
                  {hasReview ? "Update review" : "Save review"}
                </ButtonLoading>
              </button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function toParagraphs(features: string[]) {
  return features
    .flatMap((feature) => feature.replace(/\r\n/g, "\n").split(/\n\s*\n/))
    .map((feature) => feature.trim())
    .filter(Boolean);
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      {icon}
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="text-sm font-semibold text-[#b6b6b6]">{label}</p>
    </div>
  );
}
