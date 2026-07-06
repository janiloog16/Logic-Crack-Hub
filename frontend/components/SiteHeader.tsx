"use client";

import Link from "next/link";
import { LayoutDashboard, LogIn, LogOut, Package, Search, ShieldCheck, UserPlus } from "lucide-react";
import type { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
  onLogout?: () => void;
};

export function SiteHeader({ user, onLogout }: SiteHeaderProps) {
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-black bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink text-white sm:h-11 sm:w-11">
            <Package size={18} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-black uppercase tracking-wide text-ink sm:text-xl">Logic Crack Hub</span>
            <span className="hidden truncate text-xs font-bold uppercase tracking-wide text-slate-500 sm:block">Unity assets and tutorials</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link className="px-3 py-2 text-sm font-bold uppercase text-slate-800 hover:bg-slate-100" href="/">
            Assets
          </Link>
          {isAdmin ? (
            <Link className="px-3 py-2 text-sm font-bold uppercase text-slate-800 hover:bg-slate-100" href="/admin">
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <span className="hidden items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 sm:flex">
                <ShieldCheck size={16} aria-hidden />
                {user.credits} credits
              </span>
              <button
                className="focus-ring inline-flex items-center gap-2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                onClick={onLogout}
                type="button"
              >
                <LogOut size={16} aria-hidden />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                className="focus-ring inline-flex items-center gap-2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                href="/login"
              >
                <LogIn size={16} aria-hidden />
                Login
              </Link>
              <Link
                className="focus-ring hidden items-center gap-2 bg-ink px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 sm:inline-flex"
                href="/register"
              >
                <UserPlus size={16} aria-hidden />
                Register
              </Link>
            </>
          )}
          {isAdmin ? (
            <Link
              className="focus-ring inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
              href="/admin"
            >
              <LayoutDashboard size={16} aria-hidden />
              <span className="hidden lg:inline">Dashboard</span>
            </Link>
          ) : null}
          <Link className="focus-ring hidden border border-slate-300 p-2 text-slate-700 hover:bg-slate-100 sm:inline-flex" href="/">
            <Search size={17} aria-hidden />
          </Link>
        </div>
      </div>
      <div className="bg-[#111111] text-white">
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
          {["Controllers", "AI", "UI", "Inventory", "Dialogue", "Save System", "VFX", "Templates"].map((item) => (
            <a className="whitespace-nowrap px-2.5 py-3 text-[11px] font-black uppercase tracking-wide hover:bg-slate-700 sm:px-3 sm:text-xs" href="/#assets" key={item}>
              {item}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
