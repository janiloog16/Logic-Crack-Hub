"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListFilter, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { AssetCard } from "@/components/AssetCard";
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>(fallbackAssets);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [requests, setRequests] = useState<AssetRequest[]>(fallbackRequests);
  const [notifications, setNotifications] = useState<Notification[]>(fallbackNotifications);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [offline, setOffline] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [rewardMessage, setRewardMessage] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestLink, setRequestLink] = useState("");
  const [requestReason, setRequestReason] = useState("");

  const loadAssets = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (category !== "all") {
      params.set("category", category);
    }
    params.set("sort", sort);

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
    void loadAssets();
  }, [loadAssets]);

  const visibleAssets = useMemo(() => assets, [assets]);

  async function claimReward() {
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
  }

  async function submitRequest() {
    if (!user) {
      return;
    }
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
  }

  async function voteRequest(id: number) {
    if (!user) {
      return;
    }
    try {
      await apiFetch(`/requests/${id}/vote`, { method: "POST" });
    } catch {
      // Keep local voting responsive while the API is unavailable.
    }
    setRequests((current) => current.map((request) => (request.id === id ? { ...request, vote_count: request.vote_count + 1 } : request)));
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  return (
    <main>
      <SiteHeader user={user} onLogout={logout} />

      <div className="bg-[#f4f4f4]">
        <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-4">
          <article className="panel p-4 sm:p-7">
            <p className="text-xs font-black uppercase tracking-widest text-reef">Logic Crack Studio</p>
            <h1 className="directory-title mt-2 text-3xl font-bold leading-tight text-ink sm:text-5xl">
              Free Unity Assets Download and Community Requests
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-slate-700 sm:text-base">
              Browse high-quality Unity assets published by Logic Crack Studio. Earn credits through daily activity,
              download assets, review packs, and vote for the tools you want added next.
            </p>
            <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Audience</p>
                <p className="mt-1 text-sm font-bold text-ink">Beginner, indie, student, hobbyist</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Publishing</p>
                <p className="mt-1 text-sm font-bold text-ink">Only Logic Crack Studio uploads in V1</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Credits</p>
                <p className="mt-1 text-sm font-bold text-ink">Earn daily and spend on downloads</p>
              </div>
            </div>
          </article>

          <div className="panel p-3 sm:p-4" id="assets">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Asset collection</p>
                <h2 className="directory-title mt-1 text-2xl font-bold text-ink sm:text-3xl">Latest downloads</h2>
              </div>
              {offline ? (
                <span className="inline-flex items-center gap-2 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">
                  <RefreshCw size={15} aria-hidden />
                  Using local sample data
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_190px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden />
                <input
                  className="focus-ring w-full border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, tag, Unity version"
                  value={search}
                />
              </label>
              <label className="relative block">
                <ListFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden />
                <select
                  className="focus-ring w-full appearance-none border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm font-semibold"
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

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {sortOptions.map((option) => (
                <button
                  className={`focus-ring whitespace-nowrap px-3 py-2 text-sm font-bold ${
                    sort === option.value ? "bg-ink text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  key={option.value}
                  onClick={() => setSort(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {visibleAssets.map((asset) => (
              <AssetCard asset={asset} key={asset.id} />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Session</p>
                <h2 className="mt-1 text-xl font-bold text-ink">{user ? user.name : "Guest browsing"}</h2>
              </div>
              <span className="bg-slate-100 p-3 text-slate-700">
                <ShieldCheck size={22} aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Guests can browse and search. Logged-in users can download, favorite, review, claim credits, and request assets.
            </p>
            <div className="mt-4 bg-mist p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-orange-950">
                <Sparkles size={16} aria-hidden />
                {user ? `${user.credits} credits available` : "Create an account to start earning credits"}
              </p>
            </div>
          </section>

          <RewardPanel isClaiming={isClaiming} message={rewardMessage} onClaim={claimReward} user={user} />
          <RequestBoard
            onRequestLink={setRequestLink}
            onRequestReason={setRequestReason}
            onRequestTitle={setRequestTitle}
            onSubmit={submitRequest}
            onVote={voteRequest}
            requestLink={requestLink}
            requestReason={requestReason}
            requestTitle={requestTitle}
            requests={requests}
            user={user}
          />
          <NotificationRail notifications={notifications} />
        </aside>
        </div>
      </div>
    </main>
  );
}
