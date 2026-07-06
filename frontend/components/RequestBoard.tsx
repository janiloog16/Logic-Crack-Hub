"use client";

import { ExternalLink, Plus, ThumbsUp } from "lucide-react";
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
}: RequestBoardProps) {
  return (
    <section className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-reef">Community</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Asset requests</h2>
        </div>
        <span className="bg-mist p-3 text-orange-800">
          <ThumbsUp size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {requests.slice(0, 4).map((request) => (
          <article className="border border-slate-200 bg-white p-3" key={request.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-ink">{request.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{request.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-slate-500">
                  <span className="bg-slate-100 px-2 py-1">{request.status}</span>
                  {request.unity_asset_store_link ? (
                    <a className="inline-flex items-center gap-1 text-reef" href={request.unity_asset_store_link} rel="noreferrer" target="_blank">
                      Asset Store
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
              <button
                className="focus-ring inline-flex shrink-0 items-center gap-2 border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                disabled={!user}
                onClick={() => onVote(request.id)}
                type="button"
              >
                <ThumbsUp size={15} aria-hidden />
                {request.vote_count}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
        <input
          className="focus-ring w-full border border-slate-300 px-3 py-2 text-sm"
          disabled={!user}
          onChange={(event) => onRequestTitle(event.target.value)}
          placeholder={user ? "Request title" : "Login to request assets"}
          value={requestTitle}
        />
        <input
          className="focus-ring w-full border border-slate-300 px-3 py-2 text-sm"
          disabled={!user}
          onChange={(event) => onRequestLink(event.target.value)}
          placeholder="Unity Asset Store link"
          value={requestLink}
        />
        <textarea
          className="focus-ring min-h-24 w-full resize-y border border-slate-300 px-3 py-2 text-sm"
          disabled={!user}
          onChange={(event) => onRequestReason(event.target.value)}
          placeholder="Why should Logic Crack Studio add this asset?"
          value={requestReason}
        />
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!user || !requestTitle.trim() || !requestReason.trim()}
          onClick={onSubmit}
          type="button"
        >
          <Plus size={16} aria-hidden />
          Submit request
        </button>
      </div>
    </section>
  );
}
