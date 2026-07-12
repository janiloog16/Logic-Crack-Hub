"use client";

import { memo } from "react";
import { Coins, Flame } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
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

export const RewardPanel = memo(function RewardPanel({ user, isClaiming, message, onClaim }: RewardPanelProps) {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[#ff5252]">Credit economy</p>
          <h2 className="mt-1 text-2xl font-black text-white">7-day streak rewards</h2>
        </div>
        <span className="rounded-2xl bg-red-500/12 p-3 text-[#ff5252]">
          <Flame size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {rewards.map((reward) => (
          <div
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
            key={reward.day}
          >
            <span className="font-semibold text-[#d8d8d8]">Day {reward.day}</span>
            <span className="inline-flex items-center gap-2 font-bold text-white">
              <Coins className="text-[#ff5252]" size={15} aria-hidden />
              {reward.credits} credits{reward.badge ? " + badge" : ""}
            </span>
          </div>
        ))}
      </div>

      <button
        className="focus-ring btn-primary ripple mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!user || isClaiming}
        onClick={onClaim}
        type="button"
      >
        <ButtonLoading isLoading={isClaiming} loadingText="Claiming Reward...">
          <Coins size={16} aria-hidden />
          {user ? "Claim daily reward" : "Login to claim credits"}
        </ButtonLoading>
      </button>

      {message ? (
        <div className="mt-3">
          <FeedbackMessage tone={message.includes("claimed") ? "success" : "info"}>{message}</FeedbackMessage>
        </div>
      ) : null}
    </section>
  );
});
