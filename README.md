# Pacebook 🏃

A running tracker for iOS and Android, built with Expo (SDK 57) and Expo Router.

## Features

- **Record runs with GPS**: live time, distance, current pace and average pace on a map, plus the current km/mile split and the last split. Pause and resume without the paused gap counting toward distance or time.
- **Honest GPS status**: the Record screen watches the signal before you start and shows *Finding GPS*, *GPS ready ±5 m*, *Weak GPS*, *Signal lost*, or a clear reason it can't work: no permission, Location Services off, Precise Location off, or GPS unavailable in this browser. Each one comes with the fix (Allow, Open Settings, Try again).
- **Keeps tracking with the screen locked**, using OS-managed location updates. On Android that's a foreground-service notification, with no "Allow all the time" permission needed. On iOS it's the location background mode with the blue indicator, and works with "While Using". "Always" is offered once, at your first Start, and is optional. If background updates aren't available (Expo Go), it falls back to a foreground watcher and tells you to keep the app open.
- **Survives the app being killed**: the in-progress run is saved to disk, and GPS resumes on relaunch. The background task is registered in the app entry, so Android can deliver fixes headlessly.
- **GPS noise filtering**: inaccurate fixes and impossible jumps are dropped, a segment only starts from a good fix, long signal gaps don't become straight lines, and elevation gain uses a hysteresis threshold so altitude jitter doesn't add up to fake climbing.
- **Voice cues** at every km or mile, phrased the way a coach would say them ("One kilometre. Five minutes twenty-nine per kilometre. Total time five minutes twenty-nine."), plus lap, "Paused" and "Resumed" cues (expo-speech). Split haptics too.
- **Natural voice**: picks the best installed voice automatically (Premium/Enhanced first, then Siri, never the novelty voices). The You tab lists the voices for your language with their quality, has a speed control and a *Test voice* button, and explains where to download better voices on iPhone.
- **Manual laps**: a Lap button while recording, with the current lap's time and distance shown live and a "Lap 3" cue. Laps are saved with the run and shown as a table.
- **Structured workouts**: a library of six (easy 5 km, 6 × 400 m, 5 × 1 km, fartlek 4 × 3 min, 20 min tempo, 90 min long run), plus a simple builder for your own: warm-up, repeats of work and recovery by distance or time with an optional target pace band, and cool-down. Built-in workouts can be customised as a copy.
- **Guided workout recording**: *Start workout* opens the Record screen in workout mode. A panel shows the current step, what's left of it (metres or time), step x of y, what's next, and *Speed up / Slow down / On pace* against the step's target. Each step is announced ("Interval two of six. Four hundred metres. Go." / "Recover. Ninety seconds."), with halfway and last-hundred-metres cues and a buzz at every change. Lap becomes *Next step*. A lap is marked at every step boundary, at exactly the step's distance or time, so the saved run's laps are the workout's steps; run details show per-step results.
- **Training plans**: 5K (beginner, 8 weeks), 10K (8 weeks) and half marathon (12 weeks), 3–4 runs a week. Pick a start date or your race date. Home shows *Today's session*; a run saved that day that matches the session ticks it off by itself (or mark it done or skip it by hand). Weekly progress, a week-by-week schedule, and leaving the plan are in *Progress → Training*.
- **Auto-pause** (optional): the clock stops while you stand still at a crossing and restarts when you run off.
- **3-2-1 countdown** before recording (tap to skip), so GPS can lock on while you put the phone away.
- **Activity feed**: run cards with route thumbnails, a weekly-goal progress bar and a weekly streak.
- **Run details**: route map, splits table with pace bars, pace chart (smoothed over 200 m, faster is higher), laps, elevation profile, best efforts, notes and perceived effort (1–10).
- **Run types**: easy, long, tempo, intervals, race or recovery, chosen when saving. Shown as a badge, and the Home feed can be filtered by type.
- **Shoes**: add your shoes in the You tab, pick a default, and choose the pair for each run. Each shoe shows its total distance and warns past 600 km (375 mi). Retire or delete old pairs.
- **Share a run**: the share icon on a run opens a 4:5 image card (route, distance, pace, time, elevation) in orange, dark or light, ready for Instagram, WhatsApp or Messages via the share sheet. On web the image downloads.
- **GPX export and import**: export any run as a GPX file to upload to Strava (*Upload activity → File*), Garmin Connect or Komoot. Import GPX files from Strava, Garmin or a watch in the You tab; long gaps inside a track become pauses, and an already-imported run is flagged.
- **Personal records**: the fastest 400m, 1K, mile, 5K, 10K, half and full marathon found anywhere inside your runs, not only whole-run times.
- **Progress**: 12-week mileage chart, plus month, year and all-time totals.
- **Settings**: km or miles, weekly goal, split alerts, voice cues, voice and speed, auto-pause, countdown, and sample runs to explore the app before your first run.
- **Web demo mode**: in a browser that can't provide a real location (sandboxed previews, desktop without location), the Record screen offers **Simulate a run**. It feeds realistic moving GPS points through the same recorder, so the whole record → pause → resume → finish → save flow can be tried. Simulated runs are labelled as such. This option never appears on iOS or Android.
- Light and dark mode.

All data stays on the device (SQLite key-value store, or `localStorage` on web). There is no account or server. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Run it

```bash
npm install
npm start             # Expo Go (expo start --go)
```

Scan the QR code with **Expo Go** to try it right away. Expo Go can't keep tracking in the background, so keep the app open while you run. For real runs with the phone in your pocket, make a development build:

```bash
npx expo run:ios       # or: npx expo run:android   (local, needs Xcode / Android Studio)
# or in the cloud:
npm run build:dev      # eas build --profile development, then:
npm run start:dev      # expo start --dev-client
```

Android dev and release builds need a Google Maps API key for `react-native-maps`. Set it as the `GOOGLE_MAPS_ANDROID_API_KEY` EAS environment variable (or in your shell for local builds). `app.config.js` passes it to the react-native-maps config plugin. Expo Go and iOS (Apple Maps) work without it.

### Troubleshooting GPS

- **"Precise location off"**: iOS *Settings → Pacebook → Location → Precise Location* or Android *App info → Permissions → Location → Use precise location*. Approximate fixes are hundreds of metres wide and can't measure a run.
- **"Location services off"**: turn on Location Services / Location for the whole device.
- **"GPS unavailable here" on web**: the page is embedded without location access (e.g. an iframe preview). Open it in its own tab, allow location for the site, or use **Simulate a run**.
- **"Weak GPS"**: go outside with a clear view of the sky and wait a few seconds before starting.

## Development

```bash
npm test            # unit tests (GPS math, splits, best efforts, recorder incl. auto-pause, laps and workouts, cues, voices, pace chart, shoes, simulator, workouts, plans)
npm run typecheck
npm run lint
npm run doctor      # expo-doctor
```

## Releasing

Build and submit with EAS. The step-by-step checklist, store listing text, privacy answers and review notes are in **[docs/APP_STORE.md](docs/APP_STORE.md)**.

```bash
npm run build:ios && npm run submit:ios
npm run build:android && npm run submit:android
```

The icon set in `assets/` is generated from an SVG by `npm run icons` (needs Playwright + Chromium).

## Project layout

```
index.ts            app entry: registers the background location task, then Expo Router
src/app/            screens (Expo Router)
  (tabs)/           Home feed, Record launcher, Progress, You
  record.tsx        live run recording
  run/[id].tsx      run details
  edit/[id].tsx     save / edit a run
  privacy.tsx       in-app privacy policy
  workouts/         workout library, detail (Start workout) and builder
  plans/            training plan picker, setup and schedule
src/lib/            logic with no UI
  recorder.ts       run state machine (segments, auto-pause, splits), persisted
  tracking.ts       starts/stops GPS sources, permission checks with timeouts
  location(.web).ts platform location access (expo-location / browser Geolocation)
  tracking-task.ts  background location task
  gps.ts            live GPS signal status
  simulator.ts      web demo GPS
  cues.ts           spoken cue text; feedback.ts speaks it
  voices.ts         ranks speech voices for the picker and Automatic
  laps.ts, pace.ts  manual laps, smoothed pace-over-distance series
  shoes.ts          shoe mileage and wear warnings
  workouts.ts       workout model, library, builder form, step engine
  plans.ts          training plans, schedule, session matching
  runs.ts           builds runs from recordings, run types, normalises old runs
  geo.ts, stats.ts  GPS math, splits, best efforts, records
src/components/     maps, charts, cards, dialogs, theme
src/store/          on-device persistence
plugins/            local config plugins
docs/               release checklist and privacy policy
```
