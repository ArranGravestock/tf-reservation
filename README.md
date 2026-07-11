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

### Email verification (development)

There are two ways to run the email flows locally.

**Without email (default `npm run dev`)** – the app skips sending and prints the
link to the terminal, e.g.:

```
[dev] Password reset link: http://localhost:5173/reset-password?token=...
```

Signup verifies you automatically in dev, so you can create an account and sign
in without any mail setup.

**With Mailpit (test real emails)** – Mailpit is a local SMTP server with a web
inbox, so verification, password-reset, and admin resend emails are actually
sent and viewable in the browser:

```bash
npm run mail:up    # start Mailpit (SMTP :1025, web UI http://localhost:8025)
npm run dev:mail   # dev server with SMTP_HOST=localhost SMTP_PORT=1025
```

Sign up (or request a password reset), then open
[http://localhost:8025](http://localhost:8025) to read the email and click the
link. Stop Mailpit with `npm run mail:down`.

Email is controlled by SMTP env vars (see `.env.example`). When `SMTP_HOST` is
set the app sends via SMTP; otherwise it logs links to the console.

### Production

- Set **`SESSION_SECRET`** to a long random string (e.g. `openssl rand -hex 32`).
- Optionally set **`DATABASE_PATH`** (default: `./data/reservation.db`).
- For real email, set the **`SMTP_*`** / **`MAIL_FROM`** env vars (see `.env.example`)
  to point at your provider (e.g. Resend, SendGrid, Postmark, SES). The same code
  path used with Mailpit sends the production emails.

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
- `npm run mail:up` / `npm run mail:down` – Start/stop local Mailpit
- `npm run dev:mail` – Dev server wired to Mailpit for email testing
