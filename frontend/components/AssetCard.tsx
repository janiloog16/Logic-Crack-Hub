"use client";

import Link from "next/link";
import { Coins, Download, Star } from "lucide-react";
import type { Asset } from "@/lib/types";

type AssetCardProps = {
  asset: Asset;
};

export function AssetCard({ asset }: AssetCardProps) {
  return (
    <article className="panel grid gap-0 overflow-hidden md:grid-cols-[220px_1fr]">
      <Link className="block bg-slate-100" href={`/assets/${asset.slug}`}>
        <img className="h-full max-h-52 min-h-36 w-full object-cover md:max-h-none md:min-h-44" src={asset.thumbnail_url} alt={`${asset.title} preview`} />
      </Link>
      <div className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
          <span className="bg-ink px-2 py-1 text-white">{asset.category.name}</span>
          <span className="bg-slate-100 px-2 py-1 text-slate-700">{asset.unity_version}</span>
        </div>
        <Link href={`/assets/${asset.slug}`}>
          <h2 className="directory-title text-xl font-bold leading-tight text-ink hover:text-reef sm:text-2xl">{asset.title}</h2>
        </Link>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{asset.description}</p>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-sm font-bold text-slate-700 sm:gap-4">
          <span className="inline-flex items-center gap-1">
            <Star className="text-signal" size={15} aria-hidden />
            {asset.rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Download className="text-reef" size={15} aria-hidden />
            {asset.download_count} downloads
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="text-ember" size={15} aria-hidden />
            {asset.credit_cost} credits
          </span>
          <Link className="font-black uppercase text-reef hover:underline sm:ml-auto" href={`/assets/${asset.slug}`}>
            Download page
          </Link>
        </div>
      </div>
    </article>
  );
}
