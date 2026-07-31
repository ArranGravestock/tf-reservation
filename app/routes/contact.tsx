import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import type { Route } from "./+types/contact";
import { requireVerifiedUser } from "~/lib/auth.server";
import { isEmailConfigured, sendAdminContactEmail } from "~/lib/email.server";
import {
  addConversationMessage,
  getAdminRecipients,
  getConversationMessages,
  getDb,
  getOrCreateConversation,
  isMessageBanned,
} from "~/lib/db";
import { MessageAvatar } from "~/components/MessageAvatar";
import { MessageComposer } from "~/components/MessageComposer";

const MAX_MESSAGE_LENGTH = 4000;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Contact – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireVerifiedUser(request);
  const db = getDb();
  const conversation = getOrCreateConversation(db, user.id);
  const messages = getConversationMessages(db, conversation.id);
  return { messages, currentUserId: user.id, banned: isMessageBanned(user) };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireVerifiedUser(request);
  if (isMessageBanned(user)) {
    return { error: "You've been banned from sending messages to the organisers." };
  }
  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Please enter a message." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }

  const db = getDb();
  const conversation = getOrCreateConversation(db, user.id);
  addConversationMessage(db, { conversationId: conversation.id, senderId: user.id, message });

  const admins = getAdminRecipients(db);
  if (isEmailConfigured()) {
    const baseUrl = process.env.ORIGIN ?? "http://localhost:5173";
    const conversationUrl = `${baseUrl}/admin/messages/${conversation.id}`;
    await Promise.allSettled(
      admins.map((admin) =>
        sendAdminContactEmail(admin.email, {
          fromUsername: user.username,
          fromEmail: user.email,
          message,
          conversationUrl,
        }).catch((err) => {
          console.error(`[contact] Failed to email admin ${admin.email}:`, err);
        })
      )
    );
  } else {
    console.log(`[dev] Message from ${user.username} to organisers:`, message);
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

export default function Contact() {
  const { messages, currentUserId, banned } = useLoaderData<typeof loader>();
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

  // Poll for new messages (e.g. an admin reply) while this page is open.
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
          <Link to="/events" className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
            ← Back
          </Link>
          <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
            Contact
          </h1>
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-6">
            Send a message to all the organisers at once — replies show up here.
          </p>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto space-y-3 p-4 mb-3 rounded-3xl border border-neutral-200/60 dark:border-neutral-700/60 bg-[#fbfbfc] dark:bg-[#141416] bg-[radial-gradient(circle,rgba(0,0,0,0.045)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px]"
        >
          {messages.map((m) => {
            const fromMe = m.sender_id === currentUserId;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${fromMe ? "justify-end" : "justify-start"}`}>
                {!fromMe && <MessageAvatar emoji={m.profile_emoji} />}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    fromMe
                      ? "bg-[#f56772] text-white"
                      : "bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-neutral-900 dark:text-white"
                  }`}
                >
                  {!fromMe && (
                    <p className="text-[13px] font-medium text-[#f56772] mb-0.5">{m.username}</p>
                  )}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  <p
                    className={`text-[11px] mt-1 ${
                      fromMe ? "text-white/70" : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {formatCreatedAt(m.created_at)}
                  </p>
                </div>
                {fromMe && <MessageAvatar emoji={m.profile_emoji} />}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {banned ? (
          <div className="shrink-0 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 text-center">
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
              You've been banned from sending messages to the organisers.
            </p>
          </div>
        ) : (
          <Form
            ref={formRef}
            method="post"
            className="shrink-0 space-y-2 rounded-3xl bg-white dark:bg-neutral-800/80 p-3 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
          >
            {actionData?.error && (
              <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
                {actionData.error}
              </div>
            )}
            <MessageComposer
              placeholder="What's on your mind?"
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isSubmitting}
            />
          </Form>
        )}
      </div>
    </main>
  );
}
