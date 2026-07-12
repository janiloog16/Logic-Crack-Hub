"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ListFilter, RefreshCw, Search, ShieldCheck, Sparkles, Star, Trophy, Zap } from "lucide-react";
import { AssetCard } from "@/components/AssetCard";
import { CardSkeleton } from "@/components/LoadingFeedback";
import { NotificationRail } from "@/components/NotificationRail";
import { RequestBoard } from "@/components/RequestBoard";
import { RewardPanel } from "@/components/RewardPanel";
import { SiteHeader } from "@/components/SiteHeader";
import {
  apiFetch,
  AssetResponse,
  CategoriesResponse,
  clearSession,
  NotificationsResponse,
  readSavedUser,
  RequestsResponse,
  saveSession,
} from "@/lib/api";
import { fallbackAssets, fallbackCategories, fallbackNotifications, fallbackRequests } from "@/lib/fallback";
import type { Asset, AssetRequest, Category, Notification, User } from "@/lib/types";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "most_downloaded", label: "Most Downloaded" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "lowest_credits", label: "Lowest Credits" },
  { value: "recently_updated", label: "Recently Updated" },
];

const ASSETS_PER_PAGE = 6;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [requests, setRequests] = useState<AssetRequest[]>(fallbackRequests);
  const [notifications, setNotifications] = useState<Notification[]>(fallbackNotifications);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [offline, setOffline] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [visibleCount, setVisibleCount] = useState(ASSETS_PER_PAGE);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [votingRequestId, setVotingRequestId] = useState<number | null>(null);
  const [rewardMessage, setRewardMessage] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestLink, setRequestLink] = useState("");
  const [requestReason, setRequestReason] = useState("");

  const loadAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (category !== "all") {
      params.set("category", category);
    }
    params.set("sort", sort);
    params.set("limit", "60");

    try {
      const response = await apiFetch<AssetResponse>(`/assets?${params.toString()}`);
      setAssets(response.assets);
      setOffline(false);
    } catch {
      setOffline(true);
      const local = fallbackAssets.filter((asset) => {
        const matchesSearch =
          !search.trim() ||
          `${asset.title} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "all" || asset.category.slug === category;
        return matchesSearch && matchesCategory;
      });
      setAssets(local);
    } finally {
      setIsLoadingAssets(false);
    }
  }, [category, search, sort]);

  const loadShellData = useCallback(async () => {
    setUser(readSavedUser());
    try {
      const [categoryResponse, requestResponse, notificationResponse] = await Promise.all([
        apiFetch<CategoriesResponse>("/categories"),
        apiFetch<RequestsResponse>("/requests"),
        apiFetch<NotificationsResponse>("/notifications").catch(() => ({ notifications: fallbackNotifications })),
      ]);
      setCategories(categoryResponse.categories);
      setRequests(requestResponse.requests);
      setNotifications(notificationResponse.notifications);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void loadShellData();
  }, [loadShellData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => (current === searchInput ? current : searchInput));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    setVisibleCount(ASSETS_PER_PAGE);
  }, [category, search, sort]);

  const visibleAssets = useMemo(() => assets, [assets]);
  const displayedAssets = useMemo(() => visibleAssets.slice(0, visibleCount), [visibleAssets, visibleCount]);
  const skeletonCards = isLoadingAssets ? Array.from({ length: Math.max(0, ASSETS_PER_PAGE - displayedAssets.length) }) : [];
  const hasMoreAssets = visibleCount < visibleAssets.length;
  const selectedCategoryName = category === "all" ? "all categories" : categories.find((item) => item.slug === category)?.name ?? category;

  const claimReward = useCallback(async () => {
    if (isClaiming) {
      return;
    }
    if (!user) {
      setRewardMessage("Login first, then claim credits every 24 hours.");
      return;
    }
    setIsClaiming(true);
    try {
      const response = await apiFetch<{ streak_day: number; reward: number; bonus_badge: boolean }>("/rewards/claim", {
        method: "POST",
      });
      const nextUser = { ...user, credits: user.credits + response.reward };
      setUser(nextUser);
      saveSession({ token: window.localStorage.getItem("lch_token") ?? "", user: nextUser });
      setRewardMessage(`Day ${response.streak_day} claimed: +${response.reward} credits${response.bonus_badge ? " and badge" : ""}.`);
    } catch (error) {
      setRewardMessage(error instanceof Error ? error.message : "Reward is not available yet.");
    } finally {
      setIsClaiming(false);
    }
  }, [isClaiming, user]);

  async function submitRequest() {
    if (!user || isSubmittingRequest) {
      return;
    }
    setIsSubmittingRequest(true);
    try {
      await apiFetch("/requests", {
        method: "POST",
        body: JSON.stringify({
          title: requestTitle,
          unity_asset_store_link: requestLink,
          reason: requestReason,
        }),
      });
      setRequestTitle("");
      setRequestLink("");
      setRequestReason("");
      const response = await apiFetch<RequestsResponse>("/requests");
      setRequests(response.requests);
    } catch {
      setRequests([
        {
          id: Date.now(),
          title: requestTitle,
          unity_asset_store_link: requestLink,
          reason: requestReason,
          status: "open",
          vote_count: 0,
          requested_by: user.name,
          created_at: new Date().toISOString(),
        },
        ...requests,
      ]);
      setRequestTitle("");
      setRequestLink("");
      setRequestReason("");
    }
    finally {
      setIsSubmittingRequest(false);
    }
  }

  async function voteRequest(id: number) {
    if (!user || votingRequestId === id) {
      return;
    }
    setVotingRequestId(id);
    try {
      await apiFetch(`/requests/${id}/vote`, { method: "POST" });
    } catch {
      // Keep local voting responsive while the API is unavailable.
    }
    setRequests((current) => current.map((request) => (request.id === id ? { ...request, vote_count: request.vote_count + 1 } : request)));
    setVotingRequestId(null);
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  return (
    <main className="site-page game-shell">
      <SiteHeader user={user} onLogout={logout} />

      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 lg:px-8">
        <section className="hero-bg glass-panel relative overflow-hidden rounded-[28px] px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
          <div className="particle-field" />
          <div className="relative grid gap-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-100">
                <Sparkles size={15} aria-hidden />
                Premium game asset marketplace
              </p>
              <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
                Build faster with battle-ready Unity assets.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#d2d2d2] sm:text-lg">
                Discover polished controllers, AI systems, UI kits, environments, tools, and templates curated for indie
                creators, students, and fast-moving game teams.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a className="btn-primary ripple inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-black" href="#assets">
                  Browse Assets
                  <ArrowRight size={18} aria-hidden />
                </a>
                <a className="btn-secondary inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-black" href="#requests">
                  Visit Forum
                </a>
              </div>
            </div>

            <div className="grid gap-3 rounded-3xl border border-white/10 bg-black/24 p-4 backdrop-blur-xl">
              {[
                ["Assets", visibleAssets.length],
                ["Categories", categories.length],
                ["Requests", requests.length],
              ].map(([label, value]) => (
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.05] px-4 py-3" key={label}>
                  <span className="text-sm font-bold text-[#b6b6b6]">{label}</span>
                  <span className="text-2xl font-black text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 space-y-5">
            <section className="glass-panel rounded-3xl p-4 sm:p-5" id="assets">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-[#ff5252]">Asset collection</p>
                  <h2 className="mt-1 text-2xl font-black text-white sm:text-4xl">Latest downloads</h2>
                </div>
                {offline ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/12 px-3 py-2 text-sm font-bold text-amber-200">
                    <RefreshCw size={15} aria-hidden />
                    Using local sample data
                  </span>
                ) : isLoadingAssets ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-2 text-sm font-bold text-[#d7d7d7]">
                    <RefreshCw className="animate-spin" size={15} aria-hidden />
                    Loading latest assets
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#b6b6b6]" size={18} aria-hidden />
                  <input
                    className="focus-ring w-full rounded-2xl border border-white/10 bg-[#171214] py-4 pl-11 pr-4 text-sm text-white placeholder:text-[#797979]"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by name, tag, Unity version"
                    value={searchInput}
                  />
                </label>
                <label className="relative block">
                  <ListFilter className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#b6b6b6]" size={18} aria-hidden />
                  <select
                    className="focus-ring w-full appearance-none rounded-2xl border border-white/10 bg-[#171214] py-4 pl-11 pr-4 text-sm font-bold text-white"
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    <option value="all">All categories</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.slug}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <button
                  className={`focus-ring whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition ${
                    category === "all"
                      ? "bg-[#e53935] text-white shadow-[0_12px_28px_rgba(229,57,53,0.22)]"
                      : "border border-white/10 bg-white/[0.04] text-[#d7d7d7] hover:border-red-400/50 hover:text-white"
                  }`}
                  onClick={() => setCategory("all")}
                  type="button"
                >
                  All
                </button>
                {categories.map((item) => (
                  <button
                    className={`focus-ring whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition ${
                      category === item.slug
                        ? "bg-[#e53935] text-white shadow-[0_12px_28px_rgba(229,57,53,0.22)]"
                        : "border border-white/10 bg-white/[0.04] text-[#d7d7d7] hover:border-red-400/50 hover:text-white"
                    }`}
                    key={item.id}
                    onClick={() => setCategory(item.slug)}
                    type="button"
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {sortOptions.map((option) => (
                  <button
                    className={`focus-ring whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition ${
                      sort === option.value
                        ? "bg-[#e53935] text-white shadow-[0_12px_28px_rgba(229,57,53,0.22)]"
                        : "border border-white/10 bg-white/[0.04] text-[#d7d7d7] hover:border-red-400/50 hover:text-white"
                    }`}
                    key={option.value}
                    onClick={() => setSort(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {displayedAssets.map((asset, index) => (
                <AssetCard asset={asset} eager={index < ASSETS_PER_PAGE} key={asset.id} />
              ))}
              {skeletonCards.map((_, index) => (
                <CardSkeleton key={`asset-skeleton-${index}`} />
              ))}
            </div>

            {!isLoadingAssets && visibleAssets.length === 0 ? (
              <section className="glass-panel rounded-3xl p-6 text-center">
                <h3 className="text-xl font-black text-white">No assets found</h3>
                <p className="mt-2 text-sm font-semibold text-[#b6b6b6]">
                  Nothing matched {selectedCategoryName}. Try another category or clear the search.
                </p>
                <button
                  className="focus-ring btn-secondary mt-4 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-black"
                  onClick={() => {
                    setCategory("all");
                    setSearchInput("");
                    setSearch("");
                  }}
                  type="button"
                >
                  Show all assets
                </button>
              </section>
            ) : null}

            {visibleAssets.length > 0 ? (
              <div className="flex flex-col items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.035] px-4 py-4 sm:flex-row">
                <p className="text-sm font-bold text-[#b6b6b6]">
                  Showing {Math.min(displayedAssets.length, visibleAssets.length)} of {visibleAssets.length} assets
                </p>
                {hasMoreAssets ? (
                  <button
                    className="focus-ring btn-primary ripple inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-black"
                    onClick={() => setVisibleCount((current) => Math.min(current + ASSETS_PER_PAGE, visibleAssets.length))}
                    type="button"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="space-y-5">
            <section className="glass-panel rounded-3xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase text-[#ff5252]">Session</p>
                  <h2 className="mt-1 text-2xl font-black text-white">{user ? user.name : "Guest browsing"}</h2>
                </div>
                <span className="rounded-2xl bg-red-500/12 p-3 text-[#ff5252]">
                  <ShieldCheck size={22} aria-hidden />
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#b6b6b6]">
                Guests can browse and search. Logged-in users can download, favorite, review, claim credits, and request
                assets.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat icon={<Zap size={15} aria-hidden />} label="Credits" value={user ? String(user.credits) : "0"} />
                <MiniStat icon={<Star size={15} aria-hidden />} label="Rating" value="4.8" />
                <MiniStat icon={<Trophy size={15} aria-hidden />} label="Drops" value={String(visibleAssets.length)} />
              </div>
            </section>

            <RewardPanel isClaiming={isClaiming} message={rewardMessage} onClaim={claimReward} user={user} />
            <div id="requests">
              <RequestBoard
                onRequestLink={setRequestLink}
                onRequestReason={setRequestReason}
                onRequestTitle={setRequestTitle}
                onSubmit={submitRequest}
                onVote={voteRequest}
                isSubmitting={isSubmittingRequest}
                votingRequestId={votingRequestId}
                requestLink={requestLink}
                requestReason={requestReason}
                requestTitle={requestTitle}
                requests={requests}
                user={user}
              />
            </div>
            <NotificationRail notifications={notifications} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[#ff5252]">{icon}</div>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
      <p className="text-[11px] font-bold uppercase text-[#b6b6b6]">{label}</p>
    </div>
  );
}
