"use client";

import { ExternalLink, Plus, ThumbsUp } from "lucide-react";
import { ButtonLoading, LoadingSpinner } from "@/components/LoadingFeedback";
import type { AssetRequest, User } from "@/lib/types";

type RequestBoardProps = {
  user: User | null;
  requests: AssetRequest[];
  requestTitle: string;
  requestLink: string;
  requestReason: string;
  onRequestTitle: (value: string) => void;
  onRequestLink: (value: string) => void;
  onRequestReason: (value: string) => void;
  onSubmit: () => void;
  onVote: (id: number) => void;
  isSubmitting?: boolean;
  votingRequestId?: number | null;
};

export function RequestBoard({
  user,
  requests,
  requestTitle,
  requestLink,
  requestReason,
  onRequestTitle,
  onRequestLink,
  onRequestReason,
  onSubmit,
  onVote,
  isSubmitting = false,
  votingRequestId = null,
}: RequestBoardProps) {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[#ff5252]">Community forum</p>
          <h2 className="mt-1 text-2xl font-black text-white">Asset requests</h2>
        </div>
        <span className="rounded-2xl bg-red-500/12 p-3 text-[#ff5252]">
          <ThumbsUp size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {requests.slice(0, 4).map((request) => (
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" key={request.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-white">{request.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#b6b6b6]">{request.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-[#b6b6b6]">
                  <span className="rounded-full bg-white/[0.06] px-2 py-1">{request.status}</span>
                  {request.unity_asset_store_link ? (
                    <a className="inline-flex items-center gap-1 text-[#ff5252]" href={request.unity_asset_store_link} rel="noreferrer" target="_blank">
                      Asset Store
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
              <button
                className="focus-ring btn-secondary inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50"
                disabled={!user || votingRequestId === request.id}
                onClick={() => onVote(request.id)}
                type="button"
              >
                {votingRequestId === request.id ? (
                  <LoadingSpinner label={String(request.vote_count)} />
                ) : (
                  <>
                    <ThumbsUp size={15} aria-hidden />
                    {request.vote_count}
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <input
          className="focus-ring w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white placeholder:text-[#797979]"
          disabled={!user || isSubmitting}
          onChange={(event) => onRequestTitle(event.target.value)}
          placeholder={user ? "Request title" : "Login to request assets"}
          value={requestTitle}
        />
        <input
          className="focus-ring w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white placeholder:text-[#797979]"
          disabled={!user || isSubmitting}
          onChange={(event) => onRequestLink(event.target.value)}
          placeholder="Unity Asset Store link"
          value={requestLink}
        />
        <textarea
          className="focus-ring min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white placeholder:text-[#797979]"
          disabled={!user || isSubmitting}
          onChange={(event) => onRequestReason(event.target.value)}
          placeholder="Why should Logic Crack Studio add this asset?"
          value={requestReason}
        />
        <button
          className="focus-ring btn-secondary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!user || isSubmitting || !requestTitle.trim() || !requestReason.trim()}
          onClick={onSubmit}
          type="button"
        >
          <ButtonLoading isLoading={isSubmitting} loadingText="Submitting...">
            <Plus size={16} aria-hidden />
            Submit request
          </ButtonLoading>
        </button>
      </div>
    </section>
  );
}
