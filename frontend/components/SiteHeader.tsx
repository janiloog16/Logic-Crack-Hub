"use client";

import Link from "next/link";
import { LayoutDashboard, LogIn, LogOut, Menu, Package, Search, ShieldCheck, UserIcon, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
  onLogout?: () => void;
};

export function SiteHeader({ user, onLogout }: SiteHeaderProps) {
  const isAdmin = user?.role === "admin";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function logout() {
    closeMobileMenu();
    onLogout?.();
  }

  const navItems = [
    { label: "Assets", href: "/#assets" },
    { label: "Popular", href: "/#assets" },
    { label: "Latest", href: "/#assets" },
  ];

  return (
    <header className="glass-nav sticky top-0 z-30 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex min-w-[220px] shrink-0 items-center gap-2 sm:min-w-[280px] sm:gap-3" onClick={closeMobileMenu}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff5252] to-[#8f1014] text-white shadow-[0_12px_34px_rgba(229,57,53,0.32)] sm:h-11 sm:w-11">
            <Package size={18} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-base font-black uppercase text-white sm:text-xl">Logic Crack Hub</span>
            <span className="hidden whitespace-nowrap text-xs font-bold uppercase text-[#b6b6b6] sm:block">Premium Unity assets</span>
          </span>
        </Link>

        <nav className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 md:flex">
          {navItems.map((item) => (
            <Link className="rounded-full px-4 py-2 text-sm font-bold text-[#d7d7d7] transition hover:bg-white/10 hover:text-white" href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link className="rounded-full px-3 py-2 text-sm font-bold text-[#d7d7d7] transition hover:bg-white/10 hover:text-white" href="/admin">
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <Link className="focus-ring btn-secondary inline-flex h-10 w-10 items-center justify-center rounded-full" href="/#assets" aria-label="Search assets">
            <Search size={17} aria-hidden />
          </Link>
          {user ? (
            <>
              <Link
                className="focus-ring btn-secondary inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
                href="/profile"
                aria-label="Profile"
              >
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-full w-full object-cover" src={user.avatar_url} />
                ) : (
                  <UserIcon size={17} aria-hidden />
                )}
              </Link>
              <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[#ededed] sm:flex">
                <ShieldCheck size={16} aria-hidden />
                {user.credits} credits
              </span>
              <button
                className="focus-ring btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
                onClick={logout}
                type="button"
              >
                <LogOut size={16} aria-hidden />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                className="focus-ring btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
                href="/login"
              >
                <LogIn size={16} aria-hidden />
                Login
              </Link>
              <Link
                className="focus-ring btn-primary ripple hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-bold sm:inline-flex"
                href="/register"
              >
                <UserPlus size={16} aria-hidden />
                Register
              </Link>
            </>
          )}
          {isAdmin ? (
            <Link
              className="focus-ring btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
              href="/admin"
            >
              <LayoutDashboard size={16} aria-hidden />
              <span className="hidden lg:inline">Dashboard</span>
            </Link>
          ) : null}
        </div>

        <button
          aria-controls="mobile-site-menu"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white md:hidden"
          onClick={() => setMobileMenuOpen((current) => !current)}
          type="button"
        >
          {mobileMenuOpen ? <X size={21} aria-hidden /> : <Menu size={21} aria-hidden />}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-white/10 bg-[#0b090a]/95 backdrop-blur-xl md:hidden" id="mobile-site-menu">
            <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4">
            <nav className="grid gap-2">
              {navItems.map((item) => (
                <Link className="focus-ring rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-black uppercase text-white" href={item.href} key={item.label} onClick={closeMobileMenu}>
                  {item.label}
                </Link>
              ))}
              {isAdmin ? (
                <Link className="focus-ring rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-black uppercase text-white" href="/admin" onClick={closeMobileMenu}>
                  Admin dashboard
                </Link>
              ) : null}
            </nav>

            <div className="grid gap-2 border-t border-white/10 pt-4">
              {user ? (
                <>
                  <Link className="focus-ring rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-black uppercase text-white" href="/profile" onClick={closeMobileMenu}>
                    Profile
                  </Link>
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-3 text-sm font-bold text-slate-100">
                    <ShieldCheck size={16} aria-hidden />
                    {user.credits} credits available
                  </span>
                  <button
                    className="focus-ring btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black"
                    onClick={logout}
                    type="button"
                  >
                    <LogOut size={16} aria-hidden />
                    Logout
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link className="focus-ring btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black" href="/login" onClick={closeMobileMenu}>
                    <LogIn size={16} aria-hidden />
                    Login
                  </Link>
                  <Link className="focus-ring btn-primary ripple inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black" href="/register" onClick={closeMobileMenu}>
                    <UserPlus size={16} aria-hidden />
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
