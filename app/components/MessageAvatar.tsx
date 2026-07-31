import { DEFAULT_PROFILE_EMOJI } from "~/lib/emoji";

/** Small round avatar for a chat message sender — their profile emoji, or a default. */
export function MessageAvatar({ emoji }: { emoji: string | null }) {
  return (
    <span
      className="inline-grid place-items-center w-8 h-8 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700/60 text-lg leading-none"
      aria-hidden
    >
      {emoji || DEFAULT_PROFILE_EMOJI}
    </span>
  );
}
