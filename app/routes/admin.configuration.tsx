import { useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/admin.configuration";
import { requireAdmin } from "~/lib/auth.server";
import { ALL_WEEKDAYS, getAutoCreateSettings, setAutoCreateConfig, getDb } from "~/lib/db.server";
import type { RecurringDay } from "~/lib/db.server";

// Duplicated (not imported) so this component doesn't pull the server-only
// db.server module into the client bundle — loader/action are the only
// exports allowed to depend on it.
const DAY_ORDER: { key: RecurringDay; name: string }[] = [
  { key: "monday", name: "Monday" },
  { key: "tuesday", name: "Tuesday" },
  { key: "wednesday", name: "Wednesday" },
  { key: "thursday", name: "Thursday" },
  { key: "friday", name: "Friday" },
  { key: "saturday", name: "Saturday" },
  { key: "sunday", name: "Sunday" },
];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Configuration – Admin – Terrible Football Liverpool" }];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const autoCreate = getAutoCreateSettings(getDb());
  return { autoCreate };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const day = formData.get("day");
  const enabled = formData.get("enabled");
  const fromDate = String(formData.get("fromDate") ?? "").trim();
  const isValidDay = ALL_WEEKDAYS.some((cfg) => cfg.label === day);
  if (!isValidDay || (enabled !== "0" && enabled !== "1")) return null;
  if (enabled === "0" && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return null;
  setAutoCreateConfig(getDb(), day as RecurringDay, enabled === "1", fromDate || todayIso());
  return null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminConfiguration({ loaderData }: Route.ComponentProps) {
  const { autoCreate } = loaderData;
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const today = todayIso();
  const [disableDay, setDisableDay] = useState<{ key: RecurringDay; name: string } | null>(null);
  const [disableDate, setDisableDate] = useState(today);

  function openDisableModal(day: { key: RecurringDay; name: string }) {
    setDisableDate(today);
    setDisableDay(day);
  }

  function confirmDisable() {
    if (!disableDay) return;
    fetcher.submit({ day: disableDay.key, enabled: "0", fromDate: disableDate }, { method: "post" });
    setDisableDay(null);
  }

  function toggleOn(day: RecurringDay) {
    fetcher.submit({ day, enabled: "1" }, { method: "post" });
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Configuration
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          Control automatic creation of upcoming events, per day of the week. Only Saturday and
          Wednesday currently have a schedule configured, so enabling another day has no effect yet.
        </p>

        <div className="rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 divide-y divide-neutral-100 dark:divide-neutral-700/50">
          {DAY_ORDER.map((day) => {
            const setting = autoCreate[day.key];
            return (
              <div key={day.key} className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-[15px] font-medium text-neutral-900 dark:text-white">
                    {day.name} events
                  </p>
                  <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {setting.enabled
                      ? `Auto-creating upcoming ${day.name} events.`
                      : setting.pausedFrom
                      ? `Disabled from ${formatDate(setting.pausedFrom)} onwards.`
                      : `Auto-creation disabled.`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => (setting.enabled ? openDisableModal(day) : toggleOn(day.key))}
                  role="switch"
                  aria-checked={setting.enabled}
                  aria-label={`Auto-create ${day.name} events`}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    setting.enabled ? "bg-[#f56772]" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      setting.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {disableDay && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disable-auto-create-title"
        >
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-xl max-w-sm w-full p-6 border border-neutral-200/80 dark:border-neutral-700/60">
            <h3
              id="disable-auto-create-title"
              className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-2"
            >
              Disable {disableDay.name} events
            </h3>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-4">
              Choose the date to stop auto-creating {disableDay.name} events from. Any already-created{" "}
              {disableDay.name} events on or after that date will be deleted.
            </p>
            <label className="block mb-5">
              <span className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                From date
              </span>
              <input
                type="date"
                value={disableDate}
                min={today}
                onChange={(e) => setDisableDate(e.target.value)}
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-2.5 text-[15px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f56772]"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDisableDay(null)}
                className="flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-700 px-4 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white hover:opacity-90 active:opacity-80 transition-opacity"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDisable}
                disabled={!disableDate}
                className="flex-1 rounded-xl bg-[#f56772] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50"
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
