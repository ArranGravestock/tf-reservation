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

After signup, the app redirects to “Check your email”. In development the verification URL is printed in the terminal, e.g.:

```
[DEV] Email verification link: http://localhost:5173/verify-email?token=...
```

Open that URL in the browser to verify, then sign in.

### Production

- Set **`SESSION_SECRET`** to a long random string (e.g. `openssl rand -hex 32`).
- Optionally set **`DATABASE_PATH`** (default: `./data/reservation.db`).
- For real email verification, integrate an email provider (e.g. Resend, SendGrid) and send the verification link from the signup action instead of logging it.

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
