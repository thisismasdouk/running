# Stride 🏃

A Strava-style running tracker for iOS and Android, built with Expo (SDK 57) and Expo Router.

## Features

- **Record runs with GPS**: live time, distance, current pace and average pace on a map. Pause and resume without the paused gap counting toward distance or time.
- **Keeps tracking in the background** when the screen is locked, using background location with an Android foreground-service notification. The in-progress run is saved to disk, so it survives the app being killed.
- **GPS noise filtering**: inaccurate fixes and impossible jumps are dropped, and elevation gain uses a hysteresis threshold so altitude jitter doesn't add up to fake climbing.
- **Split alerts**: a haptic buzz at every km or mile.
- **Activity feed**: run cards with route thumbnails, a weekly-goal progress bar and a weekly streak.
- **Run details**: route map, splits table with pace bars, elevation profile, best efforts, notes and perceived effort (1–10).
- **Personal records**: the fastest 400m, 1K, mile, 5K, 10K, half and full marathon found anywhere inside your runs, not only whole-run times.
- **Progress**: 12-week mileage chart, plus month, year and all-time totals.
- **Settings**: km or miles, weekly goal, split alerts. You can also load sample runs to explore the app before your first run.
- Light and dark mode.

All data stays on the device (SQLite key-value store). There is no account or server.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** to try it right away. Expo Go can't keep tracking in the background, so keep the app open while you run. For real runs with the phone in your pocket, make a development build:

```bash
npx expo run:ios       # or: npx expo run:android
# or in the cloud:
npx eas-cli@latest build --profile development
```

Android release builds need a Google Maps API key for `react-native-maps` (set `android.config.googleMaps.apiKey` in `app.json`).

## Development

```bash
npm test            # unit tests (GPS math, splits, best efforts, recorder)
npm run typecheck
npm run lint
```

## Project layout

```
src/app/            screens (Expo Router)
  (tabs)/           Home feed, Record launcher, Progress, You
  record.tsx        live run recording
  run/[id].tsx      run details
  edit/[id].tsx     save / edit a run
src/lib/            logic with no UI: geo math, stats, recorder, GPS tracking
src/components/     maps, charts, cards, theme
src/store/          on-device persistence
```
