# Mobile App Store Plan

This repository now includes Capacitor scaffolding so the existing web app can be packaged for iPhone and Android while keeping the live web deployment intact.

## Current packaging direction

- Framework: Capacitor
- App name: `Insulin Daily`
- Bundle ID / App ID: `com.insulindaily.app`
- Web source: `public/`

## What still needs to happen before App Store / Play submission

1. Install mobile dependencies locally:

```powershell
npm.cmd install
```

2. Initialize native platforms:

```powershell
npx cap add ios
npx cap add android
```

3. Sync web assets into native shells:

```powershell
npm.cmd run mobile:sync
```

4. Open the native projects:

```powershell
npm.cmd run mobile:open:ios
npm.cmd run mobile:open:android
```

5. In Xcode / Android Studio, add:
- app icons
- splash screens
- permissions copy
- privacy policy URL
- support URL
- store screenshots
- release signing

## Store-readiness gaps

- privacy policy page and URL
- terms/support page
- explicit consent flow for emergency messaging
- stronger medical disclaimers and product positioning review
- app icon assets
- launch screen assets
- real push notification plan if desired
- Apple / Google review metadata

## Pricing

- Apple App Store paid pricing uses Apple price tiers, so the closest standard price point is typically `$1.99`
- Google Play supports a one-time paid app price

## Recommended next build steps

1. Create the privacy policy page
2. Add explicit emergency-contact consent UI
3. Initialize iOS and Android platforms locally
4. Produce store icons and screenshots
5. Test on a real iPhone and Android device
