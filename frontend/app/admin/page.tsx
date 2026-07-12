"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Bell, BarChart3, PackagePlus, ShieldAlert, Upload } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { SiteHeader } from "@/components/SiteHeader";
import {
  apiFetch,
  AssetResponse,
  CategoriesResponse,
  clearSession,
  NotificationsResponse,
  RequestsResponse,
  readSavedUser,
  StatsResponse,
} from "@/lib/api";
import { fallbackCategories } from "@/lib/fallback";
import type { Asset, AssetRequest, Category, Notification, User } from "@/lib/types";

type AssetForm = {
  title: string;
  slug: string;
  thumbnail_url: string;
  download_url: string;
  gallery_urls: string;
  description: string;
  features: string;
  unity_version: string;
  file_size: string;
  category_id: number;
  credit_cost: number;
  changelog: string;
  version: string;
  tags: string;
};

const initialForm: AssetForm = {
  title: "",
  slug: "",
  thumbnail_url: "/mock-assets/controller.png",
  download_url: "",
  gallery_urls: "/mock-assets/controller.png",
  description: "",
  features: "",
  unity_version: "2022.3 LTS+",
  file_size: "25 MB",
  category_id: 1,
  credit_cost: 50,
  changelog: "Initial release.",
  version: "1.0.0",
  tags: "",
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [activePanel, setActivePanel] = useState<"users" | "requests" | "assets" | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<AssetRequest | null>(null);
  const [form, setForm] = useState<AssetForm>(initialForm);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeExpiryHours, setNoticeExpiryHours] = useState("");
  const [editingNotificationId, setEditingNotificationId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState("");
  const [savingAsset, setSavingAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<number | null>(null);
  const [pendingDeleteAssetId, setPendingDeleteAssetId] = useState<number | null>(null);
  const [savingNotification, setSavingNotification] = useState(false);
  const [deletingNotificationId, setDeletingNotificationId] = useState<number | null>(null);
  const [pendingDeleteNotificationId, setPendingDeleteNotificationId] = useState<number | null>(null);
  const [loadingPanel, setLoadingPanel] = useState<"users" | "requests" | "assets" | null>(null);

  useEffect(() => {
    const saved = readSavedUser();
    setUser(saved);

    async function load() {
      try {
        const [statsResponse, categoryResponse, assetResponse, notificationResponse] = await Promise.all([
          apiFetch<StatsResponse>("/admin/stats"),
          apiFetch<CategoriesResponse>("/categories"),
          apiFetch<AssetResponse>("/assets?limit=60"),
          apiFetch<NotificationsResponse>("/admin/notifications"),
        ]);
        setStats(statsResponse.stats);
        setCategories(categoryResponse.categories);
        setAssets(assetResponse.assets);
        setNotifications(notificationResponse.notifications);
      } catch {
        setMessage("Login as an admin and make sure the API is running to use dashboard controls.");
      }
    }

    void load();
  }, []);

  function logout() {
    clearSession();
    setUser(null);
  }

  function updateForm<Key extends keyof AssetForm>(key: Key, value: AssetForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAsset) {
      return;
    }
    setMessage("");
    setSavingAsset(true);
    try {
      const payload = {
        ...form,
        gallery_urls: splitList(form.gallery_urls),
        features: paragraphList(form.features),
        tags: splitList(form.tags),
      };
      await apiFetch(editingAssetId ? `/admin/assets/${editingAssetId}` : "/admin/assets", {
        method: editingAssetId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await reloadAssets();
      setForm(initialForm);
      setEditingAssetId(null);
      setPendingDeleteAssetId(null);
      setMessage(editingAssetId ? "Asset updated." : "Asset published.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save asset.");
    } finally {
      setSavingAsset(false);
    }
  }

  async function reloadAssets() {
    const [statsResponse, assetResponse] = await Promise.all([
      apiFetch<StatsResponse>("/admin/stats"),
      apiFetch<AssetResponse>("/assets?limit=60"),
    ]);
    setStats(statsResponse.stats);
    setAssets(assetResponse.assets);
  }

  function editAsset(asset: Asset) {
    setEditingAssetId(asset.id);
    setForm({
      title: asset.title,
      slug: asset.slug,
      thumbnail_url: asset.thumbnail_url,
      download_url: asset.download_url ?? "",
      gallery_urls: asset.gallery_urls.join(", "),
      description: asset.description,
      features: asset.features.join("\n\n"),
      unity_version: asset.unity_version,
      file_size: asset.file_size,
      category_id: asset.category.id,
      credit_cost: asset.credit_cost,
      changelog: asset.changelog,
      version: asset.version,
      tags: asset.tags.join(", "),
    });
    setMessage(`Editing ${asset.title}`);
  }

  function cancelEdit() {
    setEditingAssetId(null);
    setForm(initialForm);
    setMessage("");
  }

  async function deleteAsset(asset: Asset) {
    if (deletingAssetId) {
      return;
    }
    if (pendingDeleteAssetId !== asset.id) {
      setPendingDeleteAssetId(asset.id);
      setMessage(`Click Delete again to remove "${asset.title}".`);
      return;
    }

    setMessage("");
    setDeletingAssetId(asset.id);
    try {
      await apiFetch(`/admin/assets/${asset.id}`, { method: "DELETE" });
      if (editingAssetId === asset.id) {
        cancelEdit();
      }
      await reloadAssets();
      setPendingDeleteAssetId(null);
      setMessage("Asset deleted.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete asset.");
    } finally {
      setDeletingAssetId(null);
    }
  }

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingNotification) {
      return;
    }
    setMessage("");
    setSavingNotification(true);
    try {
      await apiFetch(editingNotificationId ? `/admin/notifications/${editingNotificationId}` : "/admin/notifications", {
        method: editingNotificationId ? "PUT" : "POST",
        body: JSON.stringify({
          title: noticeTitle,
          body: noticeBody,
          type: "admin_announcement",
          expires_in_hours: noticeExpiryHours ? Number(noticeExpiryHours) : null,
        }),
      });
      resetNotificationForm();
      await reloadNotifications();
      setMessage(editingNotificationId ? "Notification updated." : "Notification sent.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save notification.");
    } finally {
      setSavingNotification(false);
    }
  }

  async function reloadNotifications() {
    const response = await apiFetch<NotificationsResponse>("/admin/notifications");
    setNotifications(response.notifications);
  }

  function editNotification(notification: Notification) {
    setEditingNotificationId(notification.id);
    setNoticeTitle(notification.title);
    setNoticeBody(notification.body);
    setNoticeExpiryHours("");
    setMessage(`Editing notification: ${notification.title}`);
  }

  function resetNotificationForm() {
    setEditingNotificationId(null);
    setNoticeTitle("");
    setNoticeBody("");
    setNoticeExpiryHours("");
  }

  async function deleteNotification(notification: Notification) {
    if (deletingNotificationId) {
      return;
    }
    if (pendingDeleteNotificationId !== notification.id) {
      setPendingDeleteNotificationId(notification.id);
      setMessage(`Click Delete again to remove notification "${notification.title}".`);
      return;
    }

    setDeletingNotificationId(notification.id);
    try {
      await apiFetch(`/admin/notifications/${notification.id}`, { method: "DELETE" });
      if (editingNotificationId === notification.id) {
        resetNotificationForm();
      }
      await reloadNotifications();
      setPendingDeleteNotificationId(null);
      setMessage("Notification deleted.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete notification.");
    } finally {
      setDeletingNotificationId(null);
    }
  }

  async function openPanel(panel: "users" | "requests" | "assets") {
    if (loadingPanel === panel) {
      return;
    }
    setActivePanel(panel);
    setMessage("");
    setLoadingPanel(panel);
    try {
      if (panel === "users") {
        const response = await apiFetch<{ users: User[] }>("/admin/users");
        setUsers(response.users);
        setSelectedUser(response.users[0] ?? null);
      }
      if (panel === "requests") {
        const response = await apiFetch<RequestsResponse>("/admin/requests");
        setRequests(response.requests);
        setSelectedRequest(response.requests[0] ?? null);
      }
      if (panel === "assets") {
        await reloadAssets();
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not load details.");
    } finally {
      setLoadingPanel(null);
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <main className="site-page game-shell">
      <SiteHeader user={user} onLogout={logout} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link className="site-back-link inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-bold" href="/">
          <ArrowLeft size={16} aria-hidden />
          Back to catalog
        </Link>

        <section className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <section className="panel rounded-lg p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-reef">Admin dashboard</p>
                  <h1 className="mt-1 text-3xl font-black text-ink">Logic Crack Studio controls</h1>
                </div>
                <span className="rounded-lg bg-mist p-3 text-orange-800">
                  <BarChart3 size={24} aria-hidden />
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                V1 keeps publishing centralized. Admins upload assets, manage requests, send announcements, and review the credit economy.
              </p>
              {!isAdmin ? (
                <div className="mt-4 flex items-start gap-3 rounded-md bg-amber-100 p-3 text-sm font-semibold text-amber-900">
                  <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden />
                  Login with the seeded admin account to unlock writes.
                </div>
              ) : null}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Users", stats.users ?? 0, "users"],
                ["Assets", stats.assets ?? 0, "assets"],
                ["Requests", stats.requests ?? 0, "requests"],
                ["Downloads", stats.downloads ?? 0, null],
                ["Credit logs", stats.credit_transactions ?? 0, null],
                ["Total credits", stats.total_credits ?? 0, null],
              ].map(([label, value, panel]) => (
                <button
                  className={`panel rounded-lg p-4 text-left ${panel ? "cursor-pointer hover:border-orange-300 hover:bg-orange-50" : "cursor-default"}`}
                  disabled={!panel || !isAdmin || loadingPanel === panel}
                  key={label}
                  onClick={() => panel && openPanel(panel as "users" | "requests" | "assets")}
                  type="button"
                >
                  <p className="text-sm font-bold text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-black text-ink">{value}</p>
                  {panel ? (
                    <p className="mt-1 text-xs font-bold uppercase text-reef">
                      {loadingPanel === panel ? "Loading..." : "Click to view"}
                    </p>
                  ) : null}
                </button>
              ))}
            </section>

            {activePanel === "users" ? (
              <section className="panel rounded-lg p-5">
                <h2 className="text-xl font-black text-ink">Users</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div className="space-y-2">
                    {users.map((item) => (
                      <button
                        className={`w-full rounded-md border p-3 text-left ${selectedUser?.id === item.id ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}
                        key={item.id}
                        onClick={() => setSelectedUser(item)}
                        type="button"
                      >
                        <p className="font-black text-ink">{item.name}</p>
                        <p className="truncate text-sm text-slate-600">{item.email}</p>
                      </button>
                    ))}
                  </div>
                  {selectedUser ? (
                    <div className="rounded-md border border-slate-200 p-4">
                      <h3 className="text-2xl font-black text-ink">{selectedUser.name}</h3>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Detail label="Email" value={selectedUser.email} />
                        <Detail label="Role" value={selectedUser.role} />
                        <Detail label="Credits" value={String(selectedUser.credits)} />
                        <Detail label="Joined" value={new Date(selectedUser.created_at).toLocaleString()} />
                      </dl>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activePanel === "requests" ? (
              <section className="panel rounded-lg p-5">
                <h2 className="text-xl font-black text-ink">Asset requests</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="space-y-2">
                    {requests.map((item) => (
                      <button
                        className={`w-full rounded-md border p-3 text-left ${selectedRequest?.id === item.id ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}
                        key={item.id}
                        onClick={() => setSelectedRequest(item)}
                        type="button"
                      >
                        <p className="font-black text-ink">{item.title}</p>
                        <p className="text-sm font-bold text-slate-500">{item.vote_count} votes · {item.status}</p>
                      </button>
                    ))}
                  </div>
                  {selectedRequest ? (
                    <div className="rounded-md border border-slate-200 p-4">
                      <h3 className="text-2xl font-black text-ink">{selectedRequest.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{selectedRequest.reason}</p>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Detail label="Requested by" value={selectedRequest.requested_by} />
                        <Detail label="Votes" value={String(selectedRequest.vote_count)} />
                        <Detail label="Status" value={selectedRequest.status} />
                        <Detail label="Date" value={new Date(selectedRequest.created_at).toLocaleString()} />
                      </dl>
                      {selectedRequest.unity_asset_store_link ? (
                        <a className="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-slate-800" href={selectedRequest.unity_asset_store_link} target="_blank" rel="noreferrer">
                          Open Unity Asset Store link
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="panel rounded-lg p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-slate-100 p-3 text-slate-700">
                  <PackagePlus size={22} aria-hidden />
                </span>
                <div>
                  <h2 className="text-xl font-black text-ink">{editingAssetId ? "Edit asset" : "Publish asset"}</h2>
                  <p className="text-sm text-slate-600">Use Supabase file URLs for ZIPs, thumbnails, and screenshots later.</p>
                </div>
              </div>

              <form className="mt-5 grid gap-4" onSubmit={createAsset}>
                <fieldset className="grid gap-4 disabled:opacity-70" disabled={savingAsset}>
                  <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Title" value={form.title} onChange={(value) => updateForm("title", value)} />
                  <Field label="Slug" value={form.slug} onChange={(value) => updateForm("slug", value)} placeholder="auto-generated if empty" />
                  <Field label="Thumbnail URL" value={form.thumbnail_url} onChange={(value) => updateForm("thumbnail_url", value)} />
                  <Field label="Download URL" value={form.download_url} onChange={(value) => updateForm("download_url", value)} placeholder="ZIP or external file URL" />
                  <Field label="Gallery URLs" value={form.gallery_urls} onChange={(value) => updateForm("gallery_urls", value)} placeholder="comma separated" />
                  <Field label="Unity Version" value={form.unity_version} onChange={(value) => updateForm("unity_version", value)} />
                  <Field label="File Size" value={form.file_size} onChange={(value) => updateForm("file_size", value)} />
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Category</span>
                    <select
                      className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm font-semibold"
                      onChange={(event) => updateForm("category_id", Number(event.target.value))}
                      value={form.category_id}
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Credit Cost</span>
                    <input
                      className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
                      min={0}
                      onChange={(event) => updateForm("credit_cost", Number(event.target.value))}
                      type="number"
                      value={form.credit_cost}
                    />
                  </label>
                  </div>

                  <TextArea label="Description" value={form.description} onChange={(value) => updateForm("description", value)} />
                  <TextArea
                    label="Features"
                    value={form.features}
                    onChange={(value) => updateForm("features", value)}
                    placeholder="Paste or write feature paragraphs"
                  />
                  <TextArea label="Tags" value={form.tags} onChange={(value) => updateForm("tags", value)} placeholder="comma separated" />
                  <TextArea label="Changelog" value={form.changelog} onChange={(value) => updateForm("changelog", value)} />
                </fieldset>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-reef px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:bg-slate-300"
                    disabled={!isAdmin || savingAsset}
                    type="submit"
                  >
                    <ButtonLoading isLoading={savingAsset} loadingText={editingAssetId ? "Saving..." : "Uploading..."}>
                      <Upload size={16} aria-hidden />
                      {editingAssetId ? "Update asset" : "Publish asset"}
                    </ButtonLoading>
                  </button>
                  {editingAssetId ? (
                    <button
                      className="focus-ring inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                      onClick={cancelEdit}
                      type="button"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </section>

            <section className="panel rounded-lg p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-ink">Manage assets</h2>
                  <p className="text-sm text-slate-600">Edit or delete products already published in MySQL.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {assets.map((asset) => (
                  <article className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[84px_1fr_auto]" key={asset.id}>
                    <img className="h-20 w-full rounded object-cover sm:w-20" src={asset.thumbnail_url} alt={`${asset.title} thumbnail`} />
                    <div className="min-w-0">
                      <h3 className="font-black text-ink">{asset.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {asset.category.name} · {asset.credit_cost} credits · v{asset.version}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{asset.slug}</p>
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <button
                        className="focus-ring flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                        disabled={!isAdmin || deletingAssetId === asset.id}
                        onClick={() => editAsset(asset)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="focus-ring flex-1 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                        disabled={!isAdmin}
                        onClick={() => deleteAsset(asset)}
                        type="button"
                      >
                        <ButtonLoading isLoading={deletingAssetId === asset.id} loadingText="Deleting...">
                          {pendingDeleteAssetId === asset.id ? "Confirm delete" : "Delete"}
                        </ButtonLoading>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="panel rounded-lg p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-slate-100 p-3 text-slate-700">
                  <Bell size={22} aria-hidden />
                </span>
                <div>
                  <h2 className="text-xl font-black text-ink">{editingNotificationId ? "Edit notification" : "Send notification"}</h2>
                  <p className="text-sm text-slate-600">Announce updates or auto-expire them after a few hours.</p>
                </div>
              </div>
              <form className="mt-5 space-y-4" onSubmit={createNotification}>
                <fieldset className="space-y-4 disabled:opacity-70" disabled={savingNotification}>
                  <Field label="Title" value={noticeTitle} onChange={setNoticeTitle} />
                  <TextArea label="Body" value={noticeBody} onChange={setNoticeBody} />
                  <Field label="Delete after hours" value={noticeExpiryHours} onChange={setNoticeExpiryHours} placeholder="Example: 4, empty = never" />
                </fieldset>
                <button
                  className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-300"
                  disabled={!isAdmin || savingNotification}
                  type="submit"
                >
                  <ButtonLoading isLoading={savingNotification} loadingText="Saving...">
                    <Bell size={16} aria-hidden />
                    {editingNotificationId ? "Update notification" : "Send announcement"}
                  </ButtonLoading>
                </button>
                {editingNotificationId ? (
                  <button
                    className="focus-ring inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                    onClick={resetNotificationForm}
                    type="button"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </form>
            </section>

            <section className="panel rounded-lg p-5">
              <h2 className="text-xl font-black text-ink">Manage notifications</h2>
              <div className="mt-4 space-y-3">
                {notifications.map((notification) => (
                  <article className="rounded-md border border-slate-200 p-3" key={notification.id}>
                    <h3 className="font-black text-ink">{notification.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{notification.body}</p>
                    <p className="mt-2 text-xs font-bold uppercase text-slate-500">
                      {notification.expires_at ? `Expires ${new Date(notification.expires_at).toLocaleString()}` : "No expiry"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="focus-ring flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                        disabled={!isAdmin || deletingNotificationId === notification.id}
                        onClick={() => editNotification(notification)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="focus-ring flex-1 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                        disabled={!isAdmin}
                        onClick={() => deleteNotification(notification)}
                        type="button"
                      >
                        <ButtonLoading isLoading={deletingNotificationId === notification.id} loadingText="Deleting...">
                          {pendingDeleteNotificationId === notification.id ? "Confirm delete" : "Delete"}
                        </ButtonLoading>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {message ? <FeedbackMessage tone={message.includes("deleted") || message.includes("updated") || message.includes("published") || message.includes("sent") ? "success" : "info"}>{message}</FeedbackMessage> : null}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        className="focus-ring mt-2 min-h-24 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <dt className="text-xs font-black uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

function splitList(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphList(raw: string) {
  const cleaned = raw.replace(/\r\n/g, "\n").trim();
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
