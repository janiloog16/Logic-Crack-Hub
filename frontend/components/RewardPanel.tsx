"use client";

import { Coins, Flame } from "lucide-react";
import type { User } from "@/lib/types";

const rewards = [
  { day: 1, credits: 10 },
  { day: 2, credits: 20 },
  { day: 3, credits: 30 },
  { day: 4, credits: 40 },
  { day: 5, credits: 50 },
  { day: 6, credits: 60 },
  { day: 7, credits: 100, badge: true },
];

type RewardPanelProps = {
  user: User | null;
  isClaiming: boolean;
  message: string;
  onClaim: () => void;
};

export function RewardPanel({ user, isClaiming, message, onClaim }: RewardPanelProps) {
  return (
    <section className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-ember">Credit economy</p>
          <h2 className="mt-1 text-xl font-bold text-ink">7-day streak rewards</h2>
        </div>
        <span className="bg-amber-100 p-3 text-amber-700">
          <Flame size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {rewards.map((reward) => (
          <div
            className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2 text-sm"
            key={reward.day}
          >
            <span className="font-semibold text-slate-700">Day {reward.day}</span>
            <span className="inline-flex items-center gap-2 font-bold text-ink">
              <Coins size={15} aria-hidden />
              {reward.credits} credits{reward.badge ? " + badge" : ""}
            </span>
          </div>
        ))}
      </div>

      <button
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 bg-reef px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!user || isClaiming}
        onClick={onClaim}
        type="button"
      >
        <Coins size={16} aria-hidden />
        {user ? (isClaiming ? "Claiming..." : "Claim daily reward") : "Login to claim credits"}
      </button>

      {message ? <p className="mt-3 bg-mist px-3 py-2 text-sm font-semibold text-orange-900">{message}</p> : null}
    </section>
  );
}
