import { useEffect, useLayoutEffect, useRef, useState } from "react";

const MAX_ROWS_HEIGHT = 120; // px, ~5 lines before the textarea itself scrolls

/** Messenger-style composer: pill input with an inline circular send button. */
export function MessageComposer({
  placeholder,
  maxLength,
  disabled,
}: {
  placeholder: string;
  maxLength: number;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasText, setHasText] = useState(false);

  // Auto-grow the textarea to fit its content, up to MAX_ROWS_HEIGHT.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`;
  }, [hasText]);

  // The parent form calls formRef.current.reset() after a successful send —
  // pick that up to clear our own tracked state and collapse the textarea.
  useEffect(() => {
    const form = textareaRef.current?.form;
    if (!form) return;
    const handleReset = () => {
      setHasText(false);
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    };
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex items-end gap-2 rounded-full bg-neutral-100 dark:bg-neutral-700/50 pl-4 pr-1.5 py-1.5">
      <textarea
        ref={textareaRef}
        name="message"
        required
        rows={1}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setHasText(e.currentTarget.value.trim().length > 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="flex-1 resize-none bg-transparent border-0 py-1.5 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none disabled:opacity-60"
        style={{ maxHeight: MAX_ROWS_HEIGHT, overflowY: "auto" }}
      />
      <button
        type="submit"
        disabled={disabled || !hasText}
        aria-label="Send"
        className="shrink-0 inline-grid place-items-center w-9 h-9 rounded-full bg-[#f56772] text-white hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 -mr-0.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l16-7.5-16-7.5 0 6 11 1.5-11 1.5z" />
        </svg>
      </button>
    </div>
  );
}
