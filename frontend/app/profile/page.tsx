"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Camera, Download, Heart, MapPin, MessageSquareText, PackageCheck, PenLine, Star, UserRound } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { SiteHeader } from "@/components/SiteHeader";
import { apiFetch, clearSession, ProfileResponse, readSavedUser, saveSession } from "@/lib/api";
import type { ProfileActivity, ProfileAssetItem, ProfileReviewItem, ProfileStats, User } from "@/lib/types";

type ProfileForm = {
  name: string;
  first_name: string;
  last_name: string;
  full_name: string;
  bio: string;
  date_of_birth: string;
  avatar_url: string;
  location: string;
  website: string;
};

const emptyStats: ProfileStats = {
  favorites: 0,
  reviews: 0,
  downloads: 0,
  requests: 0,
  credit_events: 0,
};

const emptyActivity: ProfileActivity = {
  downloads: [],
  favorites: [],
  reviews: [],
};

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<ProfileStats>(emptyStats);
  const [activity, setActivity] = useState<ProfileActivity>(emptyActivity);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    first_name: "",
    last_name: "",
    full_name: "",
    bio: "",
    date_of_birth: "",
    avatar_url: "",
    location: "",
    website: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = readSavedUser();
    setUser(saved);
    if (!saved) {
      setIsLoading(false);
      return;
    }
    setForm(profileToForm(saved));
    setIsLoading(false);

    apiFetch<ProfileResponse>("/profile")
      .then((response) => {
        setUser(response.user);
        setStats(response.stats);
        setActivity(response.activity);
        setForm(profileToForm(response.user));
        saveSession({ token: window.localStorage.getItem("lch_token") ?? "", user: response.user });
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not load profile.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const displayName = useMemo(() => {
    if (!user) {
      return "Profile";
    }
    return user.full_name || user.name || user.email;
  }, [user]);

  function updateField(key: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      const response = await apiFetch<{ user: User }>("/profile", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setUser(response.user);
      setForm(profileToForm(response.user));
      saveSession({ token: window.localStorage.getItem("lch_token") ?? "", user: response.user });
      setMessage("✓ Profile saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file || isUploading) {
      return;
    }
    setError("");
    setMessage("");
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      const response = await apiFetch<{ avatar_url: string; user: User }>("/profile/avatar", {
        method: "POST",
        body,
      });
      setUser(response.user);
      setForm(profileToForm(response.user));
      saveSession({ token: window.localStorage.getItem("lch_token") ?? "", user: response.user });
      setMessage("✓ Profile image updated");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload image. You can paste an avatar URL instead.");
    } finally {
      setIsUploading(false);
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
            <p className="mt-3 text-sm leading-6 text-[#b6b6b6]">Please sign in to view and edit your profile.</p>
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

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="glass-panel h-fit rounded-3xl p-5">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-32 w-32 overflow-hidden rounded-3xl border border-white/10 bg-[#171214]">
              {form.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="h-full w-full object-cover" src={form.avatar_url} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#ff7373]">
                  <UserRound size={48} aria-hidden />
                </div>
              )}
            </div>
            <h1 className="mt-5 text-2xl font-black text-white">{displayName}</h1>
            <p className="mt-1 text-sm font-semibold text-[#b6b6b6]">{user?.email}</p>
            {form.location ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#d8d8d8]">
                <MapPin size={15} aria-hidden />
                {form.location}
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatCard icon={<Download size={17} aria-hidden />} label="Downloads" value={stats.downloads} />
            <StatCard icon={<Heart size={17} aria-hidden />} label="Favorites" value={stats.favorites} />
            <StatCard icon={<Star size={17} aria-hidden />} label="Reviews" value={stats.reviews} />
            <StatCard icon={<MessageSquareText size={17} aria-hidden />} label="Requests" value={stats.requests} />
          </div>

          <div className="mt-6 space-y-5">
            <ActivityList title="Purchased Assets" items={activity.downloads} emptyText="No purchased assets yet." />
            <ActivityList title="Favorites" items={activity.favorites} emptyText="No favorite assets yet." />
            <ReviewList items={activity.reviews} />
          </div>
        </aside>

        <section className="glass-panel rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-[#ff7373]">Account profile</p>
              <h2 className="mt-1 text-2xl font-black text-white">Edit Your Info</h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-[#ededed]">
              <PackageCheck size={16} aria-hidden />
              {user?.credits ?? 0} credits
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Upload profile image</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-red-500 file:px-3 file:py-2 file:text-sm file:font-black file:text-white"
                disabled={isUploading || isSaving}
                onChange={(event) => void uploadAvatar(event.target.files?.[0] ?? null)}
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </label>
            <p className="mt-2 text-xs font-semibold text-[#a9a9a9]">JPG, PNG, or WEBP. Max 5MB.</p>
            <p className="mt-1 text-xs font-semibold text-[#a9a9a9]">
              Local testing saves the image on this computer when Supabase Storage is not configured.
            </p>
            {isUploading ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-black text-red-100">
                <Camera size={16} aria-hidden />
                Uploading image...
              </p>
            ) : null}
          </div>

          <form className="mt-6 space-y-5" onSubmit={saveProfile}>
            <fieldset className="grid gap-4 disabled:opacity-70 sm:grid-cols-2" disabled={isSaving || isUploading || isLoading}>
              <Input label="Display Name" value={form.name} onChange={(value) => updateField("name", value)} />
              <Input label="Full Name" value={form.full_name} onChange={(value) => updateField("full_name", value)} />
              <Input label="First Name" value={form.first_name} onChange={(value) => updateField("first_name", value)} />
              <Input label="Last Name" value={form.last_name} onChange={(value) => updateField("last_name", value)} />
              <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(value) => updateField("date_of_birth", value)} />
              <Input label="Location" value={form.location} onChange={(value) => updateField("location", value)} />
              <Input label="Website" type="url" value={form.website} onChange={(value) => updateField("website", value)} />
              <Input label="Avatar URL" type="url" value={form.avatar_url} onChange={(value) => updateField("avatar_url", value)} />
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-[#d8d8d8]">Bio</span>
                <textarea
                  className="focus-ring mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm leading-6 text-white"
                  maxLength={600}
                  onChange={(event) => updateField("bio", event.target.value)}
                  value={form.bio}
                />
              </label>
            </fieldset>

            {message ? <FeedbackMessage tone="success">{message}</FeedbackMessage> : null}
            {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

            <button
              className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50 sm:w-auto"
              disabled={isSaving || isUploading || isLoading}
              type="submit"
            >
              <ButtonLoading isLoading={isSaving} loadingText="Saving...">
                <PenLine size={16} aria-hidden />
                Save Profile
              </ButtonLoading>
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function profileToForm(user: User): ProfileForm {
  return {
    name: user.name ?? "",
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    full_name: user.full_name ?? "",
    bio: user.bio ?? "",
    date_of_birth: user.date_of_birth ?? "",
    avatar_url: user.avatar_url ?? "",
    location: user.location ?? "",
    website: user.website ?? "",
  };
}

function Input({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#d8d8d8]">{label}</span>
      <input
        className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left">
      <div className="text-[#ff7373]">{icon}</div>
      <div className="mt-2 text-xl font-black text-white">{value}</div>
      <div className="text-xs font-bold uppercase text-[#a9a9a9]">{label}</div>
    </div>
  );
}

function ActivityList({ emptyText, items, title }: { emptyText: string; items: ProfileAssetItem[]; title: string }) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs font-semibold text-[#a9a9a9]">{emptyText}</p> : null}
        {items.map((item) => (
          <Link
            className="focus-ring grid grid-cols-[44px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 transition hover:border-red-300/30 hover:bg-red-500/10"
            href={`/assets/${item.slug}`}
            key={`${title}-${item.id}`}
          >
            <AssetThumb item={item} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-white">{item.title}</span>
              <span className="block text-xs font-semibold text-[#a9a9a9]">Open asset</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ReviewList({ items }: { items: ProfileReviewItem[] }) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase text-white">Your Reviews</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs font-semibold text-[#a9a9a9]">No reviews yet.</p> : null}
        {items.map((item) => (
          <Link
            className="focus-ring grid grid-cols-[44px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 transition hover:border-red-300/30 hover:bg-red-500/10"
            href={`/assets/${item.slug}#review`}
            key={`review-${item.id}`}
          >
            <AssetThumb item={item} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-white">{item.title}</span>
              <span className="block text-xs font-semibold text-[#ffb4b4]">{item.rating}/5 stars · Click to edit review</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AssetThumb({ item }: { item: ProfileAssetItem }) {
  return (
    <span className="h-11 w-11 overflow-hidden rounded-xl bg-[#171214]">
      {item.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={item.thumbnail_url} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[#ff7373]">
          <PackageCheck size={16} aria-hidden />
        </span>
      )}
    </span>
  );
}
