import { Form, Link, useActionData, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;
import type { Route } from "./+types/admin.users";
import { createVerificationToken, requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Users – Admin – Terrible Football Liverpool" }];
}

export type AdminUserRow = {
  id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_emoji: string | null;
  email_verified: number;
  is_admin: number;
  created_at: number;
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const db = getDb();
  const users = db.prepare(
    `SELECT id, username, email, first_name, last_name, profile_emoji, email_verified, is_admin, created_at
     FROM users
     ORDER BY created_at DESC`
  ).all() as AdminUserRow[];
  return { users, currentUserId: user.id };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUser = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const db = getDb();

  if (intent === "resend-verification") {
    const rawIds = formData.getAll("userId");
    const userIds = rawIds
      .map((id) => parseInt(String(id), 10))
      .filter((n) => !Number.isNaN(n));
    let lastLink: string | undefined;
    for (const targetUserId of userIds) {
      const target = db.prepare("SELECT id, email FROM users WHERE id = ?").get(targetUserId) as { id: number; email: string } | undefined;
      if (!target) continue;
      const { token, expires } = createVerificationToken();
      db.prepare(
        "UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?"
      ).run(token, Math.floor(expires / 1000), targetUserId);
      const origin = new URL(request.url).origin;
      lastLink = `${origin}/verify-email?token=${token}`;
      if (process.env.NODE_ENV !== "production") {
        console.log("[admin resend verification] Link for", target.email, ":", lastLink);
      }
    }
    if (userIds.length > 0) {
      return {
        resendOk: true,
        resendCount: userIds.length,
        verificationLink: process.env.NODE_ENV !== "production" ? lastLink : undefined,
      };
    }
    return null;
  }

  if (intent === "set-admin") {
    const isAdmin = formData.get("isAdmin");
    if (isAdmin !== "0" && isAdmin !== "1") return null;
    const rawIds = formData.getAll("userId");
    const userIds = rawIds
      .map((id) => parseInt(String(id), 10))
      .filter((n) => !Number.isNaN(n));
    for (const targetUserId of userIds) {
      if (targetUserId === currentUser.id && isAdmin === "0") continue;
      db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(Number(isAdmin), targetUserId);
    }
    return null;
  }

  return null;
}

function displayName(u: AdminUserRow): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || u.username;
}

function formatCreatedAt(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsers() {
  const { users, currentUserId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterVerified, setFilterVerified] = useState<"all" | "yes" | "no">("all");
  const [filterAdmin, setFilterAdmin] = useState<"all" | "yes" | "no">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showResendToast, setShowResendToast] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filterVerified, filterAdmin]);

  useEffect(() => {
    if (actionData?.resendOk) setShowResendToast(true);
  }, [actionData?.resendOk]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const name = displayName(u).toLowerCase();
        const matchName = name.includes(q);
        const matchUsername = u.username.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        if (!matchName && !matchUsername && !matchEmail) return false;
      }
      if (filterVerified === "yes" && !u.email_verified) return false;
      if (filterVerified === "no" && u.email_verified) return false;
      if (filterAdmin === "yes" && !u.is_admin) return false;
      if (filterAdmin === "no" && u.is_admin) return false;
      return true;
    });
  }, [users, search, filterVerified, filterAdmin]);

  const pageSize = useMemo(() => {
    const n = parseInt(searchParams.get("pageSize") ?? "", 10);
    return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])
      ? n
      : DEFAULT_PAGE_SIZE;
  }, [searchParams]);
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = useMemo(() => {
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    if (Number.isNaN(p) || p < 1) return 1;
    return Math.min(p, totalPages);
  }, [searchParams, totalPages]);
  const paginatedUsers = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );
  const startItem = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalFiltered);

  const selectedInPage = useMemo(
    () => paginatedUsers.filter((u) => selectedIds.has(u.id)),
    [paginatedUsers, selectedIds]
  );
  const allOnPageSelected =
    paginatedUsers.length > 0 && selectedInPage.length === paginatedUsers.length;
  const selectedUnverified = useMemo(
    () => selectedInPage.filter((u) => !u.email_verified),
    [selectedInPage]
  );
  const selectedNonAdmin = useMemo(
    () => selectedInPage.filter((u) => !u.is_admin),
    [selectedInPage]
  );
  const selectedAdmin = useMemo(
    () => selectedInPage.filter((u) => u.is_admin && u.id !== currentUserId),
    [selectedInPage, currentUserId]
  );

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedUsers.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedUsers.forEach((u) => next.add(u.id));
        return next;
      });
    }
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  function setPage(newPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(Math.max(1, Math.min(newPage, totalPages))));
    setSearchParams(next, { replace: true });
  }
  function setPageSize(size: number) {
    const next = new URLSearchParams(searchParams);
    next.set("pageSize", String(size));
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(totalPages));
      setSearchParams(next, { replace: true });
    }
  }, [page, totalPages, searchParams, setSearchParams]);

  return (
    <main className="h-[calc(100vh-3.5rem-1px)] flex flex-col overflow-hidden bg-[#f5f5f7] dark:bg-[#1c1c1e]">
      <div className="flex-1 flex flex-col min-h-0 max-w-2xl lg:max-w-5xl w-full mx-auto p-6 overflow-hidden">
        <div className="shrink-0 mb-4">
          <Link to="/events" className="text-[15px] text-[#0A84FF] hover:opacity-80 inline-block">
            ← Back to sessions
          </Link>
        </div>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Users
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-4">
          All registered users. Search and filter below.
        </p>

        {actionData?.error && (
          <p className="mb-4 rounded-xl bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-[15px] text-amber-800 dark:text-amber-200">
            {actionData.error}
          </p>
        )}
        <div className="shrink-0 flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="search"
            placeholder="Search by name, username or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 px-4 py-2.5 text-[15px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
            aria-label="Search users"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={filterVerified}
              onChange={(e) => setFilterVerified(e.target.value as "all" | "yes" | "no")}
              className="rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 px-3 py-2.5 text-[14px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
              aria-label="Filter by email verified"
            >
              <option value="all">Verified: All</option>
              <option value="yes">Verified: Yes</option>
              <option value="no">Verified: No</option>
            </select>
            <select
              value={filterAdmin}
              onChange={(e) => setFilterAdmin(e.target.value as "all" | "yes" | "no")}
              className="rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 px-3 py-2.5 text-[14px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
              aria-label="Filter by admin"
            >
              <option value="all">Admin: All</option>
              <option value="yes">Admin: Yes</option>
              <option value="no">Admin: No</option>
            </select>
          </div>
        </div>

        <p className="shrink-0 text-[13px] text-neutral-500 dark:text-neutral-400 mb-2">
          {totalFiltered === 0
            ? "No users match."
            : `Showing ${startItem}–${endItem} of ${totalFiltered} users (${users.length} total)`}
        </p>

        <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200/80 dark:border-neutral-700/50">
                  <th className="sticky top-0 left-0 z-30 w-12 min-w-[3rem] px-2 py-3 bg-white dark:bg-neutral-800/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]">
                    <span className="sr-only">Select</span>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all on page"
                        className="rounded border-neutral-300 dark:border-neutral-600 text-[#0A84FF] focus:ring-[#0A84FF]"
                      />
                    </div>
                  </th>
                  <th className="sticky top-0 left-12 z-20 w-14 min-w-[3.5rem] px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]">
                    Emoji
                  </th>
                  <th className="sticky top-0 left-[112px] z-20 min-w-[8rem] px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]">
                    Name
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    Username
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    First name
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    Last name
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    Email
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    Verified
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800/80">
                    Admin
                  </th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 hidden md:table-cell bg-white dark:bg-neutral-800/80">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((u) => {
                  const isSelected = selectedIds.has(u.id);
                  const rowBg = isSelected
                    ? "bg-[rgb(231,243,255)] dark:bg-[rgb(34,52,71)]"
                    : "bg-white dark:bg-neutral-800/80";
                  const stickyShadow =
                    "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]";
                  const rowHover = isSelected
                    ? "hover:bg-[rgb(218,237,255)] dark:hover:bg-[rgb(32,57,81)]"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-700/40";
                  // When selected, sticky cells use opaque blue (no alpha) so nothing shows through when scrolling
                  const stickyCellHover = isSelected
                    ? "group-hover:!bg-[rgb(218,237,255)] dark:group-hover:!bg-[rgb(32,57,81)]"
                    : "group-hover:bg-neutral-50 dark:group-hover:bg-neutral-700/40";
                  const stickyCellBg = isSelected
                    ? "!bg-[rgb(231,243,255)] dark:!bg-[rgb(34,52,71)]"
                    : stickyShadow + " " + rowBg;
                  const stickyCell = stickyCellHover + " " + stickyCellBg;
                  return (
                  <tr
                    key={u.id}
                    onClick={() => toggleSelection(u.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelection(u.id);
                      }
                    }}
                    className={`group border-b border-neutral-100 dark:border-neutral-700/50 last:border-0 ${rowHover} cursor-pointer ${rowBg}`}
                  >
                    <td
                      className={`sticky left-0 z-[6] w-12 min-w-[3rem] px-2 py-3 ${stickyCell}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(u.id);
                      }}
                    >
                      <div className="flex items-center justify-center pointer-events-none">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          tabIndex={-1}
                          aria-label={`Select ${displayName(u)}`}
                          className="rounded border-neutral-300 dark:border-neutral-600 text-[#0A84FF] focus:ring-[#0A84FF]"
                        />
                      </div>
                    </td>
                    <td className={`sticky left-12 z-[5] w-14 min-w-[3.5rem] px-4 py-3 ${stickyCell}`}>
                      <span className="text-xl leading-none" aria-hidden>
                        {u.profile_emoji || "👤"}
                      </span>
                    </td>
                    <td className={`sticky left-[112px] z-[5] min-w-[8rem] px-4 py-3 ${stickyCell}`}>
                      <span className="text-[15px] text-neutral-900 dark:text-white font-medium">
                        {displayName(u)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[15px] text-neutral-700 dark:text-neutral-300">
                      {u.username}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-neutral-600 dark:text-neutral-400">
                      {u.first_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-neutral-600 dark:text-neutral-400">
                      {u.last_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-neutral-600 dark:text-neutral-400 break-all">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      {u.email_verified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_admin ? (
                        <span className="inline-flex items-center rounded-full bg-[#0A84FF]/15 px-2 py-0.5 text-[12px] font-medium text-[#0A84FF]">
                          Admin
                        </span>
                      ) : (
                        <span className="text-[13px] text-neutral-400 dark:text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-500 dark:text-neutral-400 hidden md:table-cell whitespace-nowrap">
                      {formatCreatedAt(u.created_at)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalFiltered === 0 && (
            <p className="px-4 py-8 text-center text-[15px] text-neutral-500 dark:text-neutral-400">
              No users match your search or filters.
            </p>
          )}

          {selectedIds.size > 0 && (
            <div className="sticky bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-800/80 px-4 py-3 shadow-[0_-2px_4px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_4px_-2px_rgba(0,0,0,0.25)]">
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-neutral-700 dark:text-neutral-300 font-medium">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[14px] text-[#0A84FF] hover:opacity-80"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedUnverified.length > 0 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="resend-verification" />
                    {selectedUnverified.map((u) => (
                      <input key={u.id} type="hidden" name="userId" value={u.id} />
                    ))}
                    <button
                      type="submit"
                      className="rounded-lg bg-[#0A84FF]/15 px-3 py-1.5 text-[13px] font-medium text-[#0A84FF] hover:bg-[#0A84FF]/25 transition-colors"
                    >
                      Resend verification ({selectedUnverified.length})
                    </button>
                  </Form>
                )}
                {selectedNonAdmin.length > 0 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="set-admin" />
                    <input type="hidden" name="isAdmin" value="1" />
                    {selectedNonAdmin.map((u) => (
                      <input key={u.id} type="hidden" name="userId" value={u.id} />
                    ))}
                    <button
                      type="submit"
                      className="rounded-lg bg-[#0A84FF]/15 px-3 py-1.5 text-[13px] font-medium text-[#0A84FF] hover:bg-[#0A84FF]/25 transition-colors"
                    >
                      Make admin ({selectedNonAdmin.length})
                    </button>
                  </Form>
                )}
                {selectedAdmin.length > 0 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="set-admin" />
                    <input type="hidden" name="isAdmin" value="0" />
                    {selectedAdmin.map((u) => (
                      <input key={u.id} type="hidden" name="userId" value={u.id} />
                    ))}
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Remove admin ({selectedAdmin.length})
                    </button>
                  </Form>
                )}
              </div>
            </div>
          )}
        </div>

        {totalFiltered > 0 && (
          <div className="shrink-0 mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg bg-neutral-100 dark:bg-neutral-700/50 border-0 px-3 py-1.5 text-[14px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700/50 hover:bg-neutral-200 dark:hover:bg-neutral-600/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700/50 hover:bg-neutral-200 dark:hover:bg-neutral-600/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showResendToast && actionData?.resendOk && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] w-full max-w-md rounded-2xl bg-neutral-700 dark:bg-neutral-600 text-white px-4 py-3 shadow-lg border border-neutral-600 dark:border-neutral-500 flex items-center justify-between gap-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-[15px] font-medium">
            {(actionData.resendCount ?? 1) > 1
              ? `Verification email sent to ${actionData.resendCount} users.`
              : "Verification email sent to them."}
          </p>
          <button
            type="button"
            onClick={() => setShowResendToast(false)}
            className="shrink-0 rounded-lg p-1.5 bg-white/20 hover:bg-white/30 text-white transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}
