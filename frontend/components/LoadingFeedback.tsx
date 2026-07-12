"use client";

import type { ReactNode } from "react";

type LoadingSpinnerProps = {
  label?: string;
  size?: "sm" | "md";
};

export function LoadingSpinner({ label = "Loading", size = "sm" }: LoadingSpinnerProps) {
  const dimension = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span className={`${dimension} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

type ButtonLoadingProps = {
  children: ReactNode;
  isLoading: boolean;
  loadingText: string;
};

export function ButtonLoading({ children, isLoading, loadingText }: ButtonLoadingProps) {
  return isLoading ? <LoadingSpinner label={loadingText} /> : <>{children}</>;
}

type CardSkeletonProps = {
  label?: string;
};

export function CardSkeleton({ label = "Loading asset" }: CardSkeletonProps) {
  return (
    <article className="game-card overflow-hidden rounded-2xl" aria-busy="true" aria-label={label}>
      <div className="aspect-[16/10] shimmer" />
      <div className="p-4">
        <div className="mb-4 flex gap-2">
          <span className="h-6 w-24 rounded-full shimmer" />
          <span className="h-6 w-28 rounded-full shimmer" />
        </div>
        <div className="h-7 w-4/5 rounded-lg shimmer" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full rounded shimmer" />
          <div className="h-4 w-11/12 rounded shimmer" />
          <div className="h-4 w-2/3 rounded shimmer" />
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <span className="h-12 rounded-xl shimmer" />
          <span className="h-12 w-12 rounded-xl shimmer" />
        </div>
      </div>
    </article>
  );
}

type FeedbackMessageProps = {
  children: ReactNode;
  tone?: "info" | "success" | "error";
};

export function FeedbackMessage({ children, tone = "info" }: FeedbackMessageProps) {
  const toneClass =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
      : tone === "error"
        ? "border-red-300/20 bg-red-500/10 text-red-100"
        : "border-red-300/20 bg-red-500/10 text-red-100";

  return (
    <p className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${toneClass}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
