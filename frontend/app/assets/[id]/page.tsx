"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, Download, Heart, PackageCheck, Star } from "lucide-react";
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
    try {
      const response = await apiFetch<{ charged_credits: number; already_owned: boolean; download_url: string }>(`/assets/${asset.id}/download`, {
        method: "POST",
      });
      const remaining = Math.max(user.credits - response.charged_credits, 0);
      setUser({ ...user, credits: remaining });
      setHasDownloaded(true);
      setDownloadUrl(response.download_url);
      setMessage(response.already_owned ? "Download ready. You already owned this asset." : `Credits spent. Download is unlocked now.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not start download.");
    }
  }

  async function favoriteAsset() {
    if (!user || !asset) {
      setMessage("Login first to favorite assets.");
      return;
    }
    try {
      const response = await apiFetch<{ favorited: boolean }>(`/assets/${asset.id}/favorite`, { method: "POST" });
      setIsFavorited(response.favorited);
      setMessage(response.favorited ? "Added to favorites." : "Removed from favorites.");
    } catch {
      setMessage("Could not update favorite.");
    }
  }

  async function submitReview() {
    if (!user || !asset) {
      setMessage("Login first to review assets.");
      return;
    }
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
    }
  }

  if (!asset) {
    return (
      <main>
        <SiteHeader user={user} onLogout={logout} />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">Loading asset...</div>
      </main>
    );
  }

  return (
    <main>
      <SiteHeader user={user} onLogout={logout} />
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <Link className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" href="/">
          <ArrowLeft size={16} aria-hidden />
          Back to catalog
        </Link>

        <section className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="panel overflow-hidden">
              <img className="aspect-[16/9] w-full object-cover" src={asset.thumbnail_url} alt={`${asset.title} preview`} />
            </div>

            <section className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-mist px-2 py-1 text-xs font-bold text-orange-900">{asset.category.name}</span>
                <span className="bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{asset.unity_version}</span>
                <span className="bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">v{asset.version}</span>
              </div>
              <h1 className="directory-title mt-4 text-3xl font-bold leading-tight text-ink sm:text-4xl">{asset.title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{asset.description}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="bg-slate-50 p-4">
                  <Star className="text-signal" size={20} aria-hidden />
                  <p className="mt-2 text-2xl font-black text-ink">{asset.rating.toFixed(1)}</p>
                  <p className="text-sm font-semibold text-slate-500">Rating</p>
                </div>
                <div className="bg-slate-50 p-4">
                  <Download className="text-reef" size={20} aria-hidden />
                  <p className="mt-2 text-2xl font-black text-ink">{asset.download_count}</p>
                  <p className="text-sm font-semibold text-slate-500">Downloads</p>
                </div>
                <div className="bg-slate-50 p-4">
                  <Coins className="text-ember" size={20} aria-hidden />
                  <p className="mt-2 text-2xl font-black text-ink">{asset.credit_cost}</p>
                  <p className="text-sm font-semibold text-slate-500">Credits</p>
                </div>
              </div>
            </section>

            <section className="panel p-4 sm:p-5">
              <h2 className="text-xl font-black text-ink">Features</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {asset.features.map((feature) => (
                  <div className="flex items-start gap-3 border border-slate-200 bg-white p-3" key={feature}>
                    <PackageCheck className="mt-0.5 shrink-0 text-reef" size={18} aria-hidden />
                    <span className="text-sm font-semibold leading-6 text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="panel p-4 sm:p-5">
              <h2 className="text-xl font-black text-ink">Download</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {hasDownloaded ? "You already unlocked this asset. Download opens in a new tab." : "First download spends credits. Re-downloads are free after purchase."}
              </p>
              <button
                className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 bg-reef px-4 py-3 text-sm font-bold text-white hover:bg-orange-700"
                onClick={downloadAsset}
                type="button"
              >
                <Download size={16} aria-hidden />
                {hasDownloaded ? "Download asset" : `Spend ${asset.credit_cost} credits`}
              </button>
              <button
                className={`focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-bold ${
                  isFavorited
                    ? "border border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                aria-pressed={isFavorited}
                onClick={favoriteAsset}
                type="button"
              >
                <Heart fill={isFavorited ? "currentColor" : "none"} size={16} aria-hidden />
                {isFavorited ? "Favorited" : "Add to favorites"}
              </button>
              {message ? <p className="mt-3 bg-mist px-3 py-2 text-sm font-semibold text-orange-900">{message}</p> : null}
            </section>

            <section className="panel p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-ink">{hasReview ? "Edit your review" : "Review asset"}</h2>
                  {hasReview ? <p className="mt-1 text-sm font-semibold text-orange-800">Your saved review is loaded below.</p> : null}
                </div>
                {hasReview ? (
                  <span className="bg-mist px-2 py-1 text-xs font-bold uppercase text-orange-900">Saved</span>
                ) : null}
              </div>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-700">Rating</span>
                <select
                  className="focus-ring mt-2 w-full border border-slate-300 px-3 py-3 text-sm font-semibold"
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
                <span className="text-sm font-bold text-slate-700">Comment</span>
                <textarea
                  className="focus-ring mt-2 min-h-28 w-full border border-slate-300 px-3 py-3 text-sm"
                  onChange={(event) => setComment(event.target.value)}
                  value={comment}
                />
              </label>
              <button
                className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
                onClick={submitReview}
                type="button"
              >
                <Star size={16} aria-hidden />
                {hasReview ? "Update review" : "Save review"}
              </button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
