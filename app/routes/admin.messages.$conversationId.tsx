import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import type { Route } from "./+types/admin.messages.$conversationId";
import { requireAdmin } from "~/lib/auth.server";
import { isEmailConfigured, sendOrganiserReplyEmail } from "~/lib/email.server";
import {
  addConversationMessage,
  getConversationById,
  getConversationMessages,
  getDb,
  isMessageBanned,
  setUserMessageBanned,
} from "~/lib/db";
import { MessageAvatar } from "~/components/MessageAvatar";
import { MessageComposer } from "~/components/MessageComposer";

const MAX_MESSAGE_LENGTH = 4000;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Message – Terrible Football Liverpool" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const conversationId = parseInt(params.conversationId, 10);
  const db = getDb();
  const conversation = getConversationById(db, conversationId);
  if (!conversation) throw new Response("Not found", { status: 404 });
  const member = db
    .prepare("SELECT username, email, profile_emoji, message_banned FROM users WHERE id = ?")
    .get(conversation.user_id) as
    | { username: string; email: string; profile_emoji: string | null; message_banned: number }
    | undefined;
  const messages = getConversationMessages(db, conversationId);
  return {
    conversationId,
    memberUserId: conversation.user_id,
    member,
    banned: member ? isMessageBanned(member) : false,
    messages,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const conversationId = parseInt(params.conversationId, 10);
  const db = getDb();
  const conversation = getConversationById(db, conversationId);
  if (!conversation) throw new Response("Not found", { status: 404 });

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "reply");

  if (intent === "set-banned") {
    const banned = formData.get("banned");
    if (banned !== "0" && banned !== "1") return null;
    setUserMessageBanned(db, conversation.user_id, banned === "1");
    return { success: true };
  }

  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Please enter a message." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }

  addConversationMessage(db, { conversationId, senderId: admin.id, message });

  const member = db.prepare("SELECT email FROM users WHERE id = ?").get(conversation.user_id) as
    | { email: string }
    | undefined;
  if (member && isEmailConfigured()) {
    const baseUrl = process.env.ORIGIN ?? "http://localhost:5173";
    await sendOrganiserReplyEmail(member.email, {
      replierUsername: admin.username,
      message,
      conversationUrl: `${baseUrl}/contact`,
    }).catch((err) => {
      console.error(`[admin.messages] Failed to email member ${member.email}:`, err);
    });
  } else if (member) {
    console.log(`[dev] Reply from ${admin.username} to ${member.email}:`, message);
  }

  return { success: true };
}

function formatCreatedAt(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminMessageThread() {
  const { member, banned, messages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const revalidator = useRevalidator();

  useEffect(() => {
    if (actionData?.success) formRef.current?.reset();
  }, [actionData]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Poll for new messages (e.g. a follow-up from the member) while this page is open.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [revalidator]);

  return (
    <main className="h-[calc(100dvh-3.5rem)] bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 flex flex-col overflow-hidden">
      <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="shrink-0">
          <Link to="/admin/messages" className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
            ← Back to messages
          </Link>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
                {member?.username ?? "Unknown member"}
              </h1>
              <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
                {member?.email}
                {banned && (
                  <span className="ml-2 inline-block rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[12px] font-medium align-middle">
                    Banned
                  </span>
                )}
              </p>
            </div>
            <Form method="post" className="shrink-0">
              <input type="hidden" name="intent" value="set-banned" />
              <input type="hidden" name="banned" value={banned ? "0" : "1"} />
              <button
                type="submit"
                className={`rounded-xl px-4 py-2 text-[14px] font-medium transition-opacity hover:opacity-90 active:opacity-80 ${
                  banned
                    ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}
              >
                {banned ? "Unban" : "Ban from messaging"}
              </button>
            </Form>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto space-y-3 p-4 mb-3 rounded-3xl border border-neutral-200/60 dark:border-neutral-700/60 bg-[#fbfbfc] dark:bg-[#141416] bg-[radial-gradient(circle,rgba(0,0,0,0.045)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px]"
        >
          {messages.map((m) => {
            const isAdminReply = !!m.is_admin;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${isAdminReply ? "justify-end" : "justify-start"}`}>
                {!isAdminReply && <MessageAvatar emoji={m.profile_emoji} />}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isAdminReply
                      ? "bg-[#f56772] text-white"
                      : "bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-neutral-900 dark:text-white"
                  }`}
                >
                  <p
                    className={`text-[13px] font-medium mb-0.5 ${
                      isAdminReply ? "text-white/90" : "text-[#f56772]"
                    }`}
                  >
                    {m.username}
                  </p>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  <p
                    className={`text-[11px] mt-1 ${
                      isAdminReply ? "text-white/70" : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {formatCreatedAt(m.created_at)}
                  </p>
                </div>
                {isAdminReply && <MessageAvatar emoji={m.profile_emoji} />}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <Form
          ref={formRef}
          method="post"
          className="shrink-0 space-y-2 rounded-3xl bg-white dark:bg-neutral-800/80 p-3 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          <input type="hidden" name="intent" value="reply" />
          {actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}
          <MessageComposer placeholder="Write a reply…" maxLength={MAX_MESSAGE_LENGTH} disabled={isSubmitting} />
        </Form>
      </div>
    </main>
  );
}
