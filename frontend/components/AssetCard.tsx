"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { Coins, Download, Heart, Star } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingFeedback";
import type { Asset } from "@/lib/types";

type AssetCardProps = {
  asset: Asset;
  eager?: boolean;
};

export const AssetCard = memo(function AssetCard({ asset, eager = false }: AssetCardProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  function startNavigation() {
    setIsNavigating(true);
  }

  return (
    <article
      className="game-card game-card-hover group overflow-hidden rounded-2xl"
    >
      <Link
        aria-disabled={isNavigating}
        className={`relative block overflow-hidden bg-[#120d0f] ${isNavigating ? "pointer-events-none" : ""}`}
        href={`/assets/${asset.slug}`}
        onClick={startNavigation}
      >
        <img
          className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105"
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          src={asset.thumbnail_url}
          alt={`${asset.title} preview`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b090a] via-[#0b090a]/18 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-black uppercase text-white backdrop-blur-md">
            {asset.category.name}
          </span>
          <span className="rounded-full border border-red-300/20 bg-red-500/15 px-3 py-1 text-xs font-black text-red-100 backdrop-blur-md">
            {asset.unity_version}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
            <Star className="text-[#ffcb45]" size={14} aria-hidden />
            {asset.rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
            <Download className="text-[#ff5252]" size={14} aria-hidden />
            {asset.download_count}
          </span>
        </div>
        {isNavigating ? (
          <div className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-black text-white backdrop-blur-sm">
            <LoadingSpinner label="Opening..." />
          </div>
        ) : null}
      </Link>
      <div className="p-4">
        <Link href={`/assets/${asset.slug}`} onClick={startNavigation}>
          <h2 className="line-clamp-2 text-xl font-black leading-tight text-white transition group-hover:text-[#ff5252]">{asset.title}</h2>
        </Link>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#b6b6b6]">{asset.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-sm font-bold text-[#d8d8d8]">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-1">
            <Coins className="text-[#ff5252]" size={15} aria-hidden />
            {asset.credit_cost} credits
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-1">v{asset.version}</span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Link
            aria-disabled={isNavigating}
            className={`focus-ring btn-primary ripple inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${isNavigating ? "pointer-events-none" : ""}`}
            href={`/assets/${asset.slug}`}
            onClick={startNavigation}
          >
            {isNavigating ? <LoadingSpinner label="Opening..." /> : <><Download size={16} aria-hidden />Download</>}
          </Link>
          <Link
            aria-label={`Open ${asset.title} to favorite`}
            className={`focus-ring btn-secondary inline-flex h-12 w-12 items-center justify-center rounded-xl ${isNavigating ? "pointer-events-none" : ""}`}
            href={`/assets/${asset.slug}`}
            onClick={startNavigation}
          >
            <Heart size={17} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
});
