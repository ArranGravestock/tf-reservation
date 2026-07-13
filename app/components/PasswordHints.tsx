/** Password guidance shown near password fields (NIST-aligned policy). */
export function PasswordHints() {
  return (
    <div className="rounded-xl bg-neutral-100 dark:bg-neutral-700/40 border border-neutral-200/70 dark:border-neutral-600/40 px-3.5 py-3 text-[13px] text-neutral-600 dark:text-neutral-400">
      <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
        Choosing a password
      </p>
      <ul className="space-y-1 list-disc pl-4">
        <li>Use 8–64 characters — a longer passphrase beats a short, complex one.</li>
        <li>No need for symbols, numbers, or capital letters.</li>
        <li>Avoid common passwords and simple sequences like <span className="tabular-nums">12345678</span>.</li>
        <li>Don’t include your username or email.</li>
      </ul>
    </div>
  );
}
