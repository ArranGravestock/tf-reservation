import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/delete-account.confirm";
import { getDb, confirmAccountDeletionByToken, ACCOUNT_DELETION_GRACE_SECONDS } from "~/lib/db.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Confirm account deletion – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return { confirmed: false, deletionDate: null };

  const db = getDb();
  const userId = confirmAccountDeletionByToken(db, token);
  if (!userId) return { confirmed: false, deletionDate: null };

  const deletionDate = new Date(Date.now() + ACCOUNT_DELETION_GRACE_SECONDS * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return { confirmed: true, deletionDate };
}

export default function DeleteAccountConfirm() {
  const { confirmed, deletionDate } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-800/80 p-8 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 text-center space-y-5">
        <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-white">
          {confirmed ? "Deletion confirmed" : "Link expired or invalid"}
        </h1>
        {confirmed ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Your account is scheduled for deletion on <strong>{deletionDate}</strong>. You
            can sign in and cancel this any time before then from your account settings.
          </p>
        ) : (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            This confirmation link is no longer valid — it may have expired or already been used.
            Start a new deletion request from your account settings if you still want to delete
            your account.
          </p>
        )}
        <Link
          to="/login"
          className="inline-block rounded-xl bg-[#f56772] px-5 py-2.5 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
