# App store packaging (PWABuilder)

This app ships as a PWA (`vite-plugin-pwa`, manifest in `vite.config.ts`).
PWABuilder wraps the **deployed** PWA — https://terriblefootball.net — into
an Android package (TWA) and an iOS package. There's no CLI for this
anymore; packaging happens on pwabuilder.com and you download a zip per
platform. Run `npm run store:report` to jump straight to the scan (or open
it manually) once your build with the manifest changes below is deployed.

Deploy the app first — PWABuilder reads the live manifest at
`https://terriblefootball.net/manifest.webmanifest`, not local files.

## Android (Trusted Web Activity)

1. https://www.pwabuilder.com/reportcard?site=https://terriblefootball.net
   → fix anything flagged red/yellow, then "Package for stores" → Android.
2. Set package ID, e.g. `net.terriblefootball.app`. Either let PWABuilder
   generate a signing key or upload your own — **save the keystore and its
   passwords somewhere durable** (password manager / secrets vault), losing
   it means you can never update the app on Play again.
3. Download the zip, unzip into `store/android/` (gitignored below — it's a
   generated artifact, not source).
4. PWABuilder gives you a SHA-256 cert fingerprint during step 2. Put the
   real `package_name` and `sha256_cert_fingerprints` into
   `public/.well-known/assetlinks.json` (currently placeholders), then
   redeploy. Without this, the Android app opens with a browser URL bar
   instead of fullscreen.
5. Open the project in Android Studio to build the AAB, or use the
   `gradlew bundleRelease` PWABuilder includes.
6. Google Play Console → create app → upload AAB to an internal testing
   track first, fill in store listing (screenshots, description,
   categories), then promote to production once it passes review.

## iOS

1. Same report card page → "Package for stores" → iOS.
2. Set your Bundle ID (must match an App ID registered in your Apple
   Developer account) and provide your Apple Team ID.
3. Download the zip, unzip into `store/ios/`.
4. Requires a paid Apple Developer Program membership ($99/yr) and a Mac
   with Xcode to open the project, set signing (your team), and archive.
5. App Store Connect → create the app record (same Bundle ID) → upload the
   archive via Xcode Organizer or Transporter → fill in store listing
   (screenshots per device size, description, privacy details) → submit
   for review.

## Notes

- Both stores require real device screenshots for the listing — these are
  separate from anything PWABuilder generates and aren't scriptable; take
  them from the running app (or Xcode/Android Studio simulators).
- Re-run the PWABuilder packaging step whenever the manifest (name, icons,
  theme colors) changes; app *content* updates happen automatically through
  the normal web deploy since both wrappers just load the live site.
- iOS review guideline 4.2 (minimum functionality) can be a snag for thin
  web wrappers — this app's has real logged-in functionality (sign-ups,
  QR codes, admin views) so it should clear that bar, but be ready to point
  reviewers at native-feeling flows if asked.
