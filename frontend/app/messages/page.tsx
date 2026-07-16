"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Inbox, MessageCircle, MoreVertical, Search, Send, Trash2, UserRound } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { SiteHeader } from "@/components/SiteHeader";
import {
  apiFetch,
  clearSession,
  ConversationsResponse,
  MessageUsersResponse,
  MessagesResponse,
  readSavedUser,
} from "@/lib/api";
import type { Conversation, ConversationUser, Message, User } from "@/lib/types";

export default function MessagesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<ConversationUser[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [actionMessageID, setActionMessageID] = useState<number | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState("");
  const unreadTotal = useMemo(() => conversations.reduce((total, conversation) => total + conversation.unread_count, 0), [conversations]);

  useEffect(() => {
    const saved = readSavedUser();
    setUser(saved);
    if (!saved) {
      setIsLoading(false);
      return;
    }
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (!search.trim()) {
      setUsers([]);
      setIsSearching(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      void searchUsers(search);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, user]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedID) ?? null,
    [conversations, selectedID],
  );

  async function loadConversations(nextSelectedID?: number) {
    setError("");
    setIsLoading(true);
    try {
      const response = await apiFetch<ConversationsResponse>("/messages/conversations");
      setConversations(response.conversations);
      const targetID = nextSelectedID ?? selectedID ?? response.conversations[0]?.id ?? null;
      setSelectedID(targetID);
      if (targetID) {
        await loadMessages(targetID);
        setConversations((current) =>
          current.map((conversation) => (conversation.id === targetID ? { ...conversation, unread_count: 0 } : conversation)),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load messages.");
    } finally {
      setIsLoading(false);
    }
  }

  async function searchUsers(value: string) {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (value.trim()) {
        params.set("search", value.trim());
      }
      const response = await apiFetch<MessageUsersResponse>(`/messages/users?${params.toString()}`);
      setUsers(response.users);
    } catch {
      setUsers([]);
    } finally {
      setIsSearching(false);
    }
  }

  async function openConversation(conversationID: number) {
    if (isOpening && selectedID === conversationID) {
      return;
    }
    setError("");
    setSelectedID(conversationID);
    setConversations((current) =>
      current.map((conversation) => (conversation.id === conversationID ? { ...conversation, unread_count: 0 } : conversation)),
    );
    await loadMessages(conversationID);
  }

  async function startConversation(otherUserID: number) {
    if (isOpening) {
      return;
    }
    setError("");
    setIsOpening(true);
    try {
      const response = await apiFetch<{ conversation_id: number }>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ user_id: otherUserID }),
      });
      await loadConversations(response.conversation_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start conversation.");
    } finally {
      setIsOpening(false);
    }
  }

  async function loadMessages(conversationID: number) {
    setIsOpening(true);
    try {
      const response = await apiFetch<MessagesResponse>(`/messages/conversations/${conversationID}`);
      setMessages(response.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open conversation.");
    } finally {
      setIsOpening(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedID || isSending || !draft.trim()) {
      return;
    }
    setError("");
    setIsSending(true);
    const body = draft.trim();
    try {
      const response = await apiFetch<{ message: Message }>(`/messages/conversations/${selectedID}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setDraft("");
      setMessages((current) => [...current, response.message]);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedID
            ? { ...conversation, last_message: response.message, updated_at: response.message.created_at }
            : conversation,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send message.");
    } finally {
      setIsSending(false);
    }
  }

  async function deleteForMe(message: Message) {
    if (isActing) {
      return;
    }
    setError("");
    setIsActing(true);
    try {
      await apiFetch<{ status: string }>(`/messages/${message.id}`, { method: "DELETE" });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setActionMessageID(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete message.");
    } finally {
      setIsActing(false);
    }
  }

  async function deleteForEveryone(message: Message) {
    if (isActing) {
      return;
    }
    setError("");
    setIsActing(true);
    try {
      await apiFetch<{ status: string }>(`/messages/${message.id}/everyone`, { method: "DELETE" });
      const deleted = { ...message, body: "This message was deleted", deleted_for_everyone_at: new Date().toISOString() };
      setMessages((current) => current.map((item) => (item.id === message.id ? deleted : item)));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.last_message?.id === message.id ? { ...conversation, last_message: deleted } : conversation,
        ),
      );
      setActionMessageID(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete message for everyone.");
    } finally {
      setIsActing(false);
    }
  }

  async function forwardToConversation(conversationID: number) {
    if (!forwardingMessage || isActing) {
      return;
    }
    setError("");
    setIsActing(true);
    try {
      const response = await apiFetch<{ message: Message }>(`/messages/${forwardingMessage.id}/forward`, {
        method: "POST",
        body: JSON.stringify({ conversation_id: conversationID }),
      });
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationID
            ? { ...conversation, last_message: response.message, updated_at: response.message.created_at }
            : conversation,
        ),
      );
      if (conversationID === selectedID) {
        setMessages((current) => [...current, response.message]);
      }
      setForwardingMessage(null);
      setActionMessageID(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not forward message.");
    } finally {
      setIsActing(false);
    }
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  if (!user && !isLoading) {
    return (
      <main className="site-page game-shell min-h-screen">
        <SiteHeader user={null} />
        <section className="mx-auto max-w-xl px-4 py-16">
          <div className="glass-panel rounded-3xl p-6 text-center">
            <Inbox className="mx-auto text-[#ff7373]" size={42} aria-hidden />
            <h1 className="mt-4 text-3xl font-black text-white">Login Required</h1>
            <p className="mt-3 text-sm leading-6 text-[#b6b6b6]">Please sign in to send and read messages.</p>
            <Link className="btn-primary ripple mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-black" href="/login">
              Go to Login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="site-page game-shell min-h-screen">
      <SiteHeader user={user} onLogout={logout} unreadMessages={unreadTotal} />

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="glass-panel h-fit rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[#ff7373]">Inbox</p>
              <h1 className="text-2xl font-black text-white">Messages</h1>
            </div>
            <Inbox className="text-[#ff7373]" size={26} aria-hidden />
          </div>

          <label className="mt-5 block">
            <span className="sr-only">Search users</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9a9a9]" size={16} aria-hidden />
              <input
                className="focus-ring w-full rounded-2xl border border-white/10 bg-[#171214] py-3 pl-9 pr-3 text-sm text-white"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users..."
                value={search}
              />
            </span>
          </label>

          {search.trim() ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-black uppercase text-[#a9a9a9]">Start Chat</p>
              {isSearching ? <p className="rounded-2xl bg-white/[0.04] p-3 text-xs font-bold text-[#b6b6b6]">Searching...</p> : null}
              {!isSearching && users.length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] p-3 text-xs font-bold text-[#b6b6b6]">No matching users found.</p>
              ) : null}
              {users.slice(0, 6).map((item) => (
                <button
                  className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left transition hover:border-red-300/30 hover:bg-red-500/10 disabled:opacity-60"
                  disabled={isOpening}
                  key={item.id}
                  onClick={() => void startConversation(item.id)}
                  type="button"
                >
                  <Avatar user={item} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-white">{displayUserName(item)}</span>
                    <span className="block text-xs font-semibold text-[#ffb4b4]">Message</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
            <p className="text-xs font-black uppercase text-[#a9a9a9]">Conversations</p>
            {isLoading ? <p className="rounded-2xl bg-white/[0.04] p-3 text-xs font-bold text-[#b6b6b6]">Loading conversations...</p> : null}
            {!isLoading && conversations.length === 0 ? (
              <p className="rounded-2xl bg-white/[0.04] p-3 text-xs font-bold text-[#b6b6b6]">No conversations yet.</p>
            ) : null}
            {conversations.map((conversation) => (
              <button
                className={`focus-ring flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${
                  conversation.id === selectedID
                    ? "border-red-300/40 bg-red-500/15"
                    : "border-white/10 bg-white/[0.04] hover:border-red-300/30 hover:bg-red-500/10"
                }`}
                key={conversation.id}
                onClick={() => void openConversation(conversation.id)}
                type="button"
              >
                <Avatar user={conversation.other_user} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-white">{displayUserName(conversation.other_user)}</span>
                  <span className="block truncate text-xs font-semibold text-[#a9a9a9]">
                    {conversation.last_message?.body ?? "No messages yet"}
                  </span>
                </span>
                {conversation.unread_count > 0 ? (
                  <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-black text-white">{conversation.unread_count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="glass-panel flex min-h-[640px] flex-col rounded-3xl p-4 sm:p-5">
          {selectedConversation ? (
            <>
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <Avatar user={selectedConversation.other_user} />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black text-white">{displayUserName(selectedConversation.other_user)}</h2>
                  <p className="text-xs font-bold uppercase text-[#a9a9a9]">Private conversation</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto py-5">
                {isOpening ? <p className="text-sm font-bold text-[#b6b6b6]">Opening conversation...</p> : null}
                {!isOpening && messages.length === 0 ? (
                  <div className="flex min-h-80 flex-col items-center justify-center text-center">
                    <MessageCircle className="text-[#ff7373]" size={44} aria-hidden />
                    <p className="mt-3 text-lg font-black text-white">No messages yet</p>
                    <p className="mt-1 text-sm font-semibold text-[#a9a9a9]">Send the first message.</p>
                  </div>
                ) : null}
                {messages.map((message) => {
                  const mine = message.sender_id === user?.id;
                  const deleted = Boolean(message.deleted_for_everyone_at);
                  return (
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} key={message.id}>
                      <div className={`group relative flex max-w-[82%] items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold leading-6 ${
                            deleted
                              ? "border border-dashed border-white/15 bg-white/[0.03] text-[#a9a9a9]"
                              : mine
                                ? "bg-red-500 text-white"
                                : "border border-white/10 bg-white/[0.06] text-[#ededed]"
                          }`}
                        >
                          <p className={`whitespace-pre-wrap break-words ${deleted ? "italic" : ""}`}>{message.body}</p>
                        <p className={`mt-1 text-[11px] font-bold ${mine ? "text-red-100" : "text-[#a9a9a9]"}`}>
                          {formatTime(message.created_at)}
                        </p>
                        </div>
                        <div className="relative">
                          <button
                            aria-expanded={actionMessageID === message.id}
                            aria-label="Message actions"
                            className="focus-ring mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#171214] text-[#d8d8d8] opacity-100 transition hover:bg-white/10 sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={() => setActionMessageID((current) => (current === message.id ? null : message.id))}
                            type="button"
                          >
                            <MoreVertical size={16} aria-hidden />
                          </button>
                          {actionMessageID === message.id ? (
                            <div className={`absolute top-10 z-20 w-48 rounded-2xl border border-white/10 bg-[#171214] p-2 shadow-2xl ${mine ? "right-0" : "left-0"}`}>
                              <button
                                className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black uppercase text-[#ededed] hover:bg-white/10 disabled:opacity-50"
                                disabled={isActing}
                                onClick={() => void deleteForMe(message)}
                                type="button"
                              >
                                <Trash2 size={14} aria-hidden />
                                Delete for me
                              </button>
                              <button
                                className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black uppercase text-[#ededed] hover:bg-white/10 disabled:opacity-50"
                                disabled={isActing || !mine || deleted}
                                onClick={() => void deleteForEveryone(message)}
                                type="button"
                              >
                                <Trash2 size={14} aria-hidden />
                                Delete everyone
                              </button>
                              <button
                                className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black uppercase text-[#ededed] hover:bg-white/10 disabled:opacity-50"
                                disabled={isActing || deleted}
                                onClick={() => setForwardingMessage(message)}
                                type="button"
                              >
                                <Send size={14} aria-hidden />
                                Forward
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

              <form className="mt-4 flex gap-2 border-t border-white/10 pt-4" onSubmit={sendMessage}>
                <textarea
                  className="focus-ring min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-[#171214] px-4 py-3 text-sm leading-6 text-white"
                  disabled={isSending || isOpening}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message..."
                  value={draft}
                />
                <button
                  className="focus-ring btn-primary ripple inline-flex h-12 min-w-24 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black disabled:opacity-50"
                  disabled={isSending || isOpening || !draft.trim()}
                  type="submit"
                >
                  <ButtonLoading isLoading={isSending} loadingText="Sending...">
                    <Send size={16} aria-hidden />
                    Send
                  </ButtonLoading>
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <Inbox className="text-[#ff7373]" size={54} aria-hidden />
              <h2 className="mt-4 text-2xl font-black text-white">Select a conversation</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#b6b6b6]">Search for a user or open an existing conversation to start messaging.</p>
              {error ? <div className="mt-5"><FeedbackMessage tone="error">{error}</FeedbackMessage></div> : null}
            </div>
          )}
        </section>
      </section>

      {forwardingMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-[#ff7373]">Forward Message</p>
                <h2 className="mt-1 text-xl font-black text-white">Choose conversation</h2>
              </div>
              <button
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white"
                onClick={() => setForwardingMessage(null)}
                type="button"
              >
                x
              </button>
            </div>
            <p className="mt-4 line-clamp-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm font-semibold text-[#d8d8d8]">
              {forwardingMessage.body}
            </p>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {conversations.filter((conversation) => conversation.id !== forwardingMessage.conversation_id).length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] p-3 text-sm font-bold text-[#b6b6b6]">No other conversations to forward to yet.</p>
              ) : null}
              {conversations
                .filter((conversation) => conversation.id !== forwardingMessage.conversation_id)
                .map((conversation) => (
                  <button
                    className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-red-300/30 hover:bg-red-500/10 disabled:opacity-60"
                    disabled={isActing}
                    key={conversation.id}
                    onClick={() => void forwardToConversation(conversation.id)}
                    type="button"
                  >
                    <Avatar user={conversation.other_user} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-white">{displayUserName(conversation.other_user)}</span>
                      <span className="block text-xs font-semibold text-[#ffb4b4]">{isActing ? "Forwarding..." : "Forward here"}</span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Avatar({ user }: { user: ConversationUser }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#171214] text-[#ff7373]">
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={user.avatar_url} />
      ) : (
        <UserRound size={18} aria-hidden />
      )}
    </span>
  );
}

function displayUserName(user: ConversationUser) {
  return user.full_name || user.name;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(value));
}
