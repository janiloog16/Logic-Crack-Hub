"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Package, UserPlus } from "lucide-react";
import { apiFetch, AuthResponse, saveSession } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      saveSession(response);
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-md rounded-lg p-6">
        <Link className="inline-flex items-center gap-3" href="/">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
            <Package size={20} aria-hidden />
          </span>
          <span>
            <span className="block text-base font-bold text-ink">Logic Crack Hub</span>
            <span className="block text-xs font-medium text-slate-500">Start earning credits</span>
          </span>
        </Link>

        <h1 className="mt-8 text-2xl font-black text-ink">Register</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Create a user account to download assets, claim daily rewards, vote, review, and favorite packs.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Name</span>
            <input
              className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Email</span>
            <input
              className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <input
              className="focus-ring mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-reef px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:bg-slate-300"
            disabled={loading}
            type="submit"
          >
            <UserPlus size={16} aria-hidden />
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link className="font-bold text-reef" href="/login">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}

