"use client";

import { memo } from "react";
import { Bell } from "lucide-react";
import type { Notification } from "@/lib/types";

type NotificationRailProps = {
  notifications: Notification[];
};

export const NotificationRail = memo(function NotificationRail({ notifications }: NotificationRailProps) {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[#ff5252]">Updates</p>
          <h2 className="mt-1 text-2xl font-black text-white">Notifications</h2>
        </div>
        <span className="rounded-2xl bg-white/[0.06] p-3 text-[#ff5252]">
          <Bell size={22} aria-hidden />
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {notifications.slice(0, 4).map((notification) => (
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" key={notification.id}>
            <h3 className="text-sm font-bold text-white">{notification.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#b6b6b6]">{notification.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
});
