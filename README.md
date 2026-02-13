# Terrible Football Liverpool

A Remix/React Router app for Terrible Football Liverpool—booking Saturday football sessions. New Saturday events are created automatically; users sign up with an account (username, password, email) and verify their email before they can book.

## Features

- **Accounts**: Sign up with username, password, and email
- **Email verification**: Verification link sent (in dev the link is logged to the console)
- **Saturday events**: Events are created automatically for the next 12 Saturdays
- **Sign up for sessions**: Verified users can sign up for any Saturday session and see who else is attending

## Getting Started

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You’ll be redirected to login; use “Sign up” to create an account.

### Email verification

After signup, the app sends a verification email and redirects to “Check your email”. Open the link in the email to verify, then sign in. In development, set `SMTP_USER` and `SMTP_PASS` in `.env` to receive the email (no auto-verify).

### Production

- Set **`SESSION_SECRET`** to a long random string (e.g. `openssl rand -hex 32`).
- Optionally set **`DATABASE_PATH`** (default: `./data/reservation.db`).
- For real email (verification + password reset), set **SMTP** env vars. Example: **Proton Mail** direct SMTP (paid plan with custom domain)—create an SMTP token in Settings → Proton Mail → IMAP/SMTP → SMTP tokens, then set `SMTP_USER` (your custom-domain address), `SMTP_PASS` (the token). Defaults: `SMTP_HOST=smtp.protonmail.ch`, `SMTP_PORT=587`. See `.env.example`.

## Tech

- **React Router v7** (Remix-style loaders/actions)
- **SQLite** (better-sqlite3) for users, events, and signups
- **Cookie sessions** for auth
- **bcrypt** for password hashing
- **Tailwind CSS** for styling

## Scripts

- `npm run dev` – Start dev server with HMR
- `npm run build` – Production build
- `npm run start` – Run production server
- `npm run typecheck` – TypeScript + route typegen
