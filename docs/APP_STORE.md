# Releasing Pacebook to the App Store (and Google Play)

This is the step-by-step checklist for shipping Pacebook with EAS. Everything that can live in the repo is already configured: `app.json`, `app.config.js`, `eas.json`, the icon set, the splash screen, the iOS privacy manifest, permission strings and export-compliance flag. The steps marked **(you)** need your own accounts, so only you can do them.

## 0. What's already set up

| Item | Where |
| --- | --- |
| Bundle ID / package `com.thisismasdouk.pacebook` | `app.json` → `ios.bundleIdentifier`, `android.package` |
| Build numbers owned by EAS remote versioning and auto-incremented on production builds (set a starting value with `npx eas-cli@latest build:version:set`); `app.json` deliberately has no `buildNumber`/`versionCode` | `eas.json` (`appVersionSource: remote`, `autoIncrement`) |
| Build profiles: `development`, `development-simulator`, `preview`, `production` | `eas.json` |
| Submit profile `production` (Android goes to the internal track as a draft) | `eas.json` |
| `ITSAppUsesNonExemptEncryption = NO` (no export compliance question on each upload) | `ios.config.usesNonExemptEncryption: false` |
| Privacy manifest (`PrivacyInfo.xcprivacy`): no tracking, no collected data, required-reason APIs declared | `ios.privacyManifests` |
| Location purpose strings; the unused motion permission string is removed | `expo-location` plugin options |
| Background modes: `location` (run recording), `audio` (voice cues while locked). The unused `fetch` mode is stripped | `ios.infoPlist`, `plugins/withoutBackgroundFetch.js` |
| Android: no `ACCESS_BACKGROUND_LOCATION` (a foreground service with a notification is used instead), and unused template permissions are blocked | `android.blockedPermissions`, `expo-location` plugin |
| App icon, Android adaptive icon (foreground, background, monochrome), splash, favicon | `assets/`, regenerate with `npm run icons` |
| Google Maps key for Android read from an environment variable | `app.config.js` |
| HealthKit: capability and entitlement, purpose strings for reading heart rate and saving workouts, no background delivery. HealthKit isn't in Expo Go, so the app loads it only in development and App Store builds | `@kingstinct/react-native-healthkit` plugin in `app.json`, `src/lib/health.ios.ts` |
| In-app privacy policy | `src/app/privacy.tsx` (and `docs/PRIVACY.md` to host) |

## 1. One-time setup

1. **(you)** Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year). For Android, create a [Google Play Console](https://play.google.com/console) account ($25 once).
2. **(you)** Check the bundle identifier `com.thisismasdouk.pacebook` (based on the GitHub account, since there's no domain yet). If you'd rather use a domain you own, change `ios.bundleIdentifier` and `android.package` in `app.json` **before the first build**. They can't be changed after the app is published.
3. Log in and link the project to EAS (this adds `owner` and `extra.eas.projectId` to `app.json`; commit that change):

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

4. **(you)** Android maps: create a Google Maps SDK for Android key in Google Cloud Console. Restrict it to the package name and the SHA-1 fingerprints of the EAS upload key (`npx eas-cli@latest credentials -p android`) and the Play app-signing key. Then store it as an EAS environment variable for every environment:

   ```bash
   npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> \
     --environment production --environment preview --environment development --visibility sensitive
   ```

   Without the key, the map is blank in Android builds (Expo Go and iOS don't need it).
5. **(you)** Host the privacy policy: publish `docs/PRIVACY.md` (with your support email filled in) at a public URL, e.g. GitHub Pages or a Notion page. Apple and Google both require the URL.
6. **(you)** Reserve the app name in App Store Connect: **Apps → + → New App**, platform iOS, name "Pacebook" (names are unique, so have a fallback like "Pacebook: Run Tracker"), primary language, bundle ID from step 2, SKU `pacebook`. Note the numeric **Apple ID** of the app. To make `eas submit` fully non-interactive, add it to `eas.json` under `submit.production.ios.ascAppId`.

## 2. Test on real devices first

```bash
npm run build:dev            # development build with the dev client (install it on your phone)
npm run start:dev            # then start the dev server for it
npm run build:preview        # or a standalone internal build (APK on Android, ad hoc on iOS)
```

Background tracking does **not** work in Expo Go, so test a real run with the phone locked in a development or preview build. For iOS internal builds, register the device first with `npx eas-cli@latest device:create`.

Checklist:

- [ ] First launch → Record: the location prompt appears (While Using). Start → "Change to Always Allow" is offered once. Choosing "Keep Only While Using" still records with the screen locked (blue indicator).
- [ ] Lock the phone for 5+ minutes during a run: the route has no straight-line gap.
- [ ] Android: a "Pacebook is recording your run" notification is shown during the run and goes away after Finish.
- [ ] Turn Precise Location off for Pacebook: the Record screen says so and offers Open Settings.
- [ ] Voice cues at each km, auto-pause at a stop, 3-2-1 countdown.
- [ ] Kill the app mid-run and reopen it: the Home banner shows the run, and recording continues.

## 3. Build and submit

```bash
npm run build:ios            # eas build -p ios --profile production
npm run submit:ios           # eas submit -p ios --profile production --latest
```

The first iOS build asks to create a distribution certificate and provisioning profile; let EAS manage them. The first submit asks for your Apple ID and creates an App Store Connect API key.

Android:

```bash
npm run build:android        # .aab
npm run submit:android       # to the internal testing track as a draft
```

The very first Android upload must be done by hand in Play Console (Google requires it before the API can upload). Download the `.aab` from the EAS build page, then upload it under **Testing → Internal testing**. After that, `submit:android` works. You also need a Google service account key for `eas submit` (see the EAS docs: "Creating a Google Service Account").

The build appears in TestFlight after processing (about 10–30 minutes). Test it there before submitting for review.

## 4. App Store Connect listing (you)

Suggested text. Avoid naming other apps or brands (e.g. "Strava") anywhere in the metadata.

- **Name:** Pacebook
- **Subtitle (30 chars):** GPS run tracker, no account
- **Category:** Health & Fitness (secondary: Sports)
- **Promotional text:** Record your runs with GPS, hear your splits, and watch your weekly mileage grow. Everything stays on your phone.
- **Description:**

  > Pacebook is a simple, private running tracker.
  >
  > • Record runs with GPS: live time, distance, current and average pace on a map
  > • Keeps recording with your phone locked or in your pocket
  > • Voice cues at every kilometre or mile with your split and average pace
  > • Auto-pause at traffic lights, plus a 3-2-1 countdown
  > • Splits, elevation profile and best efforts (400 m to marathon) for every run
  > • Personal records found anywhere inside your runs
  > • Weekly goal, streaks, and 12-week mileage chart
  > • Kilometres or miles, light and dark mode
  >
  > No account, no ads, no tracking. Your runs are stored only on your device.

- **Keywords (100 chars):** running,run tracker,gps,jogging,pace,splits,marathon,5k,training,workout,fitness,distance
- **Support URL / Marketing URL:** a page you control (a GitHub repo page is fine)
- **Privacy Policy URL:** the URL from step 1.5
- **Age rating:** answer "None" to everything, which gives 4+
- **Copyright:** `2026 <your name>`

### App Privacy ("nutrition label")

Choose **"No, we do not collect data from this app."** This is accurate because:

- Location and run data are processed and stored only on the device (on-device processing is not "collection" under Apple's definition).
- There is no account, analytics, crash reporting SDK, advertising or server.
- Apple Health data (heart rate read, workouts written) stays on the device too.

The privacy manifest already declares no tracking and no collected data types. If you add analytics or crash reporting later, update both the label and `ios.privacyManifests`.

### Screenshots

Required: **6.9" iPhone** screenshots (1320 × 2868 or 1290 × 2796). Apple scales these for smaller phones. The iPad isn't needed because `supportsTablet` is false. Take them on an iPhone 16 Pro Max / 17 Pro Max simulator with a development build:

1. Home feed with runs (You → **Load sample runs**)
2. Record screen mid-run (Simulator → Features → Location → **City Run**)
3. Run detail: map and splits
4. Run detail: elevation and best efforts
5. Progress: weekly chart and records

Remove the sample runs afterwards if you like. They're clearly labelled as optional demo data.

### App Review notes

Paste something like:

> Pacebook records runs using GPS. There is no login.
>
> Background location: location is used only while the user is actively recording a run that they started with the Start button, so the run keeps recording when the phone is locked or in a pocket. The blue location indicator is shown the whole time, and tracking stops when the run is finished or discarded. The app works fully with "While Using the App" permission; "Always" is offered once, at the first Start, and is optional.
>
> Background audio: used only to speak split times ("3 kilometres, time 17 minutes…") during a run while the phone is locked. It can be turned off under You → Voice cues.
>
> To see populated screens without running, open the **You** tab and tap **Load sample runs**. To test recording in the Simulator, use Features → Location → City Run and press Start on the Record tab.
>
> HealthKit: optional, off by default (You → Apple Health). When on, each run is saved to Health as a running workout with its route, and heart rate for the run's time window is read to show average/max heart rate and zones on the run screen. Health data is stored only on the device and never used for advertising.
>
> All data is stored on the device only; nothing is sent to any server.

Attaching a short screen recording of a run with the phone locked helps with the background-location question.

## 5. Google Play listing (you)

- **Data safety:** "No data collected" and "No data shared". Location is processed on-device only. Answer "Yes" to "Is all user data encrypted in transit?" if asked (there is no transfer), and point to the privacy policy URL.
- **Permissions:** the app does not request background location, so no background-location declaration or video is needed. The foreground service type is `location`, used for "user-initiated run recording".
- **Content rating:** complete the questionnaire (all "No").
- **Target audience:** 13+ (not designed for children).
- Store listing text: reuse the App Store text above.

## 6. Every later release

1. Bump `version` in `app.json` for user-visible releases (e.g. 1.0.1). Build numbers increment automatically.
2. `npm run typecheck && npm run lint && npm test && npm run doctor`
3. `npm run build:ios && npm run submit:ios` (and the Android equivalents)
4. In App Store Connect: add "What's New" text, pick the build, and submit for review.

## Only you can do these

- [ ] Enroll in the Apple Developer Program / create a Google Play Console account
- [ ] Choose a bundle ID you own (step 1.2) and reserve the app name
- [ ] `eas login` + `eas init` and commit the resulting `projectId`
- [ ] Create the Google Maps Android API key and store it as `GOOGLE_MAPS_ANDROID_API_KEY` in EAS
- [ ] Publish the privacy policy (fill in your support email) and enter its URL
- [ ] Add `ascAppId` to `eas.json` (optional, for non-interactive submits)
- [ ] Take screenshots, fill in the listing, age rating and App Privacy answers
- [ ] Do the first manual Play upload and create a Google service account key for `eas submit`
- [ ] Be aware that the name "Pacebook" plays on "Facebook". Meta has objected to other "-book" names before, so there is some risk of a rename request after launch
- [ ] Review the brand: the accent colour `#FC4C02` is very close to Strava's trademark orange. Consider a distinct colour if you want to reduce trademark or copycat (Guideline 4.1) risk
