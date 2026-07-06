"use client";

import { Bell } from "lucide-react";
import type { Notification } from "@/lib/types";

type NotificationRailProps = {
  notifications: Notification[];
};

export function NotificationRail({ notifications }: NotificationRailProps) {
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Updates</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Notifications</h2>
        </div>
        <span className="bg-slate-100 p-3 text-slate-700">
          <Bell size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {notifications.slice(0, 4).map((notification) => (
          <article className="border border-slate-200 bg-white p-3" key={notification.id}>
            <h3 className="text-sm font-bold text-ink">{notification.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{notification.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
