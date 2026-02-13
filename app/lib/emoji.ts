/** Animal emojis only for profile. First is the default. */
export const ANIMAL_EMOJIS = [
  "🦁",
  "🐐",
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦅",
  "🦉",
  "🦇",
  "🐺",
  "🐗",
  "🐴",
  "🦄",
  "🐢",
  "🐍",
  "🦎",
  "🐠",
  "🐟",
  "🐬",
  "🐳",
  "🐋",
  "🦈",
  "🐊",
] as const;

export const DEFAULT_PROFILE_EMOJI = ANIMAL_EMOJIS[0];

export function isAllowedProfileEmoji(emoji: string | null | undefined): boolean {
  if (!emoji || typeof emoji !== "string") return false;
  const trimmed = emoji.trim().slice(0, 8);
  return ANIMAL_EMOJIS.includes(trimmed as (typeof ANIMAL_EMOJIS)[number]);
}
