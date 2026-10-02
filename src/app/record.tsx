import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/RouteMap';
import { useColors, type Colors } from '@/components/theme';
import { Button, Stat } from '@/components/ui';
import { WorkoutPanel, WorkoutPreview } from '@/components/WorkoutPanel';
import { confirm, notice, showDialog } from '@/lib/confirm';
import { stepAnnouncement } from '@/lib/cues';
import { buzz, say } from '@/lib/feedback';
import { distanceUnit, formatDistanceValue, formatDuration, formatPaceValue, paceUnit } from '@/lib/format';
import { FIRST_FIX_ACCURACY_M, MAX_ACCURACY_M } from '@/lib/geo';
import { gps, gpsSignal, useGps } from '@/lib/gps';
import { syncRunToHealth } from '@/lib/healthSync';
import { goBack } from '@/lib/nav';
import { resolveWorkout } from '@/lib/plans';
import { currentLap, currentPace, currentSplit, movingMs, recorder, useRecorder, type RecorderWorkout } from '@/lib/recorder';
import { buildRun } from '@/lib/runs';
import { paceSecPerKm } from '@/lib/stats';
import {
  canOpenSettings,
  checkAccess,
  lastKnownPosition,
  openSettings,
  startPreview,
  startTracking,
  stopTracking,
  trackingMode,
  type AccessResult,
} from '@/lib/tracking';
import type { TrackPoint } from '@/lib/types';
import { flattenWorkout } from '@/lib/workouts';
import { getProfile, recordRunInPlan, saveRun, useActivePlan, useProfile, useShoes, useWorkouts } from '@/store';

const KEEP_AWAKE_TAG = 'run';
const IS_WEB = Platform.OS === 'web';
/** On web, offer the simulator when no fix has arrived this long after opening the screen. */
const SIMULATE_OFFER_AFTER_MS = 10_000;
/** On web, a location prompt that is still unanswered after this long is probably ignored or hidden. */
const PROMPT_WAIT_MS = 4_500;
/** Access results that mean fixes have stopped for good until the user changes a setting. */
const ACCESS_LOST = new Set(['denied', 'services-off', 'approximate']);
/** Desktop browsers only report a new position when it changes, so allow longer silences there. */
const LOST_AFTER_MS = IS_WEB ? 60_000 : 15_000;
const COUNTDOWN_S = 3;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Screen Wake Lock is blocked by Permissions Policy in some embeds; asking there only logs console errors. */
function keepAwakeAllowed(): boolean {
  if (!IS_WEB) return true;
  const doc = globalThis.document as unknown as { featurePolicy?: { allowsFeature?: (f: string) => boolean } } | undefined;
  try {
    return doc?.featurePolicy?.allowsFeature?.('screen-wake-lock') !== false;
  } catch {
    return true;
  }
}

export default function Record() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const rec = useRecorder();
  const g = useGps();
  const profile = useProfile();
  const shoes = useShoes();
  const units = profile.units;
  // Opened from a workout or plan session: /record?workout=<id>&session=<key>.
  const params = useLocalSearchParams<{ workout?: string; session?: string }>();
  const custom = useWorkouts();
  const active = useActivePlan();
  const planned = useMemo((): RecorderWorkout | null => {
    const w = resolveWorkout(params.workout, custom, active);
    if (!w) return null;
    const steps = flattenWorkout(w);
    if (steps.length === 0) return null;
    return { id: w.id, name: w.name, runType: w.runType, steps, ...(params.session ? { sessionKey: params.session } : {}) };
  }, [params.workout, params.session, custom, active]);
  const [access, setAccess] = useState<AccessResult | null>(null);
  const [lastKnown, setLastKnown] = useState<TrackPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const simulateNext = useRef(false);
  const alive = useRef(true);
  /** Set while Finish/Discard tear tracking down, so the restart effect doesn't bring it back. */
  const stopping = useRef(false);

  const idle = rec.status === 'idle';
  const canTrack = access?.access === 'granted' || access?.access === 'approximate';

  const refresh = useCallback(async (ask: boolean) => {
    const r = await checkAccess(ask);
    if (alive.current) setAccess(r);
    return r;
  }, []);

  // Ask for location when the screen opens (the user came here to record), and
  // re-check when returning from Settings.
  useEffect(() => {
    alive.current = true;
    refresh(true);
    // Also during a run: access may have been granted (or revoked) in Settings meanwhile.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh(false);
    });
    return () => {
      alive.current = false;
      sub.remove();
      // Leaving before Start (e.g. during the countdown) shouldn't leave GPS running.
      if (recorder.get().status === 'idle') stopTracking();
    };
  }, [refresh]);

  useEffect(() => {
    if (!canTrack) return;
    lastKnownPosition().then((p) => alive.current && p && setLastKnown(p));
  }, [canTrack]);

  // A live watcher while idle, so the pill reports a real fix and its accuracy before Start.
  useEffect(() => {
    if (!idle || !canTrack || countdown != null) return;
    return startPreview();
  }, [idle, canTrack, countdown]);

  // A run whose GPS source isn't running (access was lost and then granted again, a
  // failed restart, a relaunch before access was re-granted) would silently record
  // nothing. Start it again as soon as it can run.
  const recording = rec.status === 'recording';
  const sourceMissing = g.mode == null;
  useEffect(() => {
    if (!recording || !sourceMissing || stopping.current) return;
    if (!rec.simulated && access?.access !== 'granted') return;
    const segs = recorder.get().segments.flat();
    startTracking({ simulate: rec.simulated, origin: segs[segs.length - 1] ?? lastKnown }).catch((e) =>
      gps.reportError(errorText(e)),
    );
  }, [recording, sourceMissing, rec.simulated, access, lastKnown]);

  // A provider error may mean access was revoked. If so, drop the stale fix and stop the
  // dead source, so the pill says why and the effect above restarts it once access is back.
  useEffect(() => {
    if (!g.error || rec.simulated) return;
    let cancelled = false;
    checkAccess(false).then((r) => {
      if (cancelled || !alive.current || !ACCESS_LOST.has(r.access)) return;
      setAccess(r);
      gps.reset();
      if (recorder.get().status !== 'idle' && trackingMode() !== 'simulated') stopTracking();
    });
    return () => {
      cancelled = true;
    };
  }, [g.error, rec.simulated]);

  // Re-render every second so the clock and signal age keep moving between fixes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (idle || !keepAwakeAllowed()) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [idle]);

  // Android back / browser back would unmount the screen mid-run. Finish and
  // Discard make the recorder idle first, so their navigation goes through.
  usePreventRemove(!idle, ({ data }) => {
    if (recorder.get().status === 'idle') {
      navigation.dispatch(data.action);
      return;
    }
    // Browser Back already moved the URL to the previous entry while the run screen
    // stays. Step forward again so the address bar (and a reload) match the screen.
    if (IS_WEB && typeof window !== 'undefined' && !window.location.pathname.endsWith('/record')) {
      window.history.forward();
    }
  });

  const go = useCallback(() => {
    setCountdown(null);
    recorder.start(Date.now(), simulateNext.current, planned);
    say(planned ? `${planned.name}. ${stepAnnouncement(planned.steps[0], getProfile().units)}` : 'Run started.');
  }, [planned]);

  useEffect(() => {
    if (countdown == null) return;
    buzz('tick');
    say(String(countdown));
    const id = setTimeout(() => (countdown <= 1 ? go() : setCountdown(countdown - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, go]);

  const here = g.fix ?? lastKnown;

  const begin = async (simulate: boolean) => {
    if (busy || countdown != null) return;
    setBusy(true);
    try {
      if (!simulate) {
        const ask = access?.access === 'undetermined' || (access?.access === 'denied' && !!access.canAskAgain);
        const r = await refresh(ask);
        if (r.access !== 'granted') return;
      }
      // GPS starts before the countdown so it has a few seconds to lock on.
      await startTracking({ simulate, origin: here });
    } catch (e) {
      await stopTracking();
      await notice(
        "Couldn't start GPS",
        `${errorText(e)}\n\n${IS_WEB ? 'Check that this site may use your location.' : 'Check that Location Services are on and Pacebook is allowed to use your location.'}`,
      );
      return;
    } finally {
      if (alive.current) setBusy(false);
    }
    simulateNext.current = simulate;
    if (profile.countdown) setCountdown(COUNTDOWN_S);
    else go();
  };

  const cancelCountdown = () => {
    setCountdown(null);
    stopTracking();
  };

  // The "Lap N" cue (or, in a workout, the next step's) is spoken by useRunFeedback from the recorder's event.
  const lap = () => {
    recorder.lap();
  };

  const pause = () => {
    recorder.pause();
    say('Paused.');
  };

  const resume = async () => {
    recorder.resume();
    say('Resumed.');
    // Tracking keeps running while paused; restart it only if it isn't (e.g. it failed earlier).
    if (!trackingMode()) {
      try {
        await startTracking({ simulate: rec.simulated, origin: here });
      } catch (e) {
        notice("Couldn't restart GPS", errorText(e));
      }
    }
  };

  const finish = async () => {
    const s = recorder.get();
    const points = s.segments.reduce((n, seg) => n + seg.length, 0);
    if (points < 2 || s.distanceM < 10) {
      const noGps = points < 2;
      const choice = await showDialog(
        noGps ? 'No GPS points recorded' : 'Run too short to save',
        noGps
          ? "Pacebook didn't receive any usable GPS fixes during this run, so there's no route or distance to save."
          : 'Runs shorter than 10 metres are not saved.',
        [
          { text: 'Back to run', style: 'cancel' },
          { text: 'Discard', style: 'destructive' },
        ],
      );
      if (choice !== 1) return;
      stopping.current = true;
      await stopTracking();
      recorder.discard();
      goBack();
      return;
    }
    stopping.current = true;
    await stopTracking();
    const result = recorder.finish();
    const run = buildRun(result);
    // The default shoe is preselected; the save screen can change it.
    const shoe = shoes.find((x) => x.id === profile.defaultShoeId && !x.retired);
    const saved = shoe ? { ...run, shoeId: shoe.id } : run;
    saveRun(saved);
    void syncRunToHealth(saved.id);
    // Tick off the plan session it was started from, or one it matches that day.
    recordRunInPlan(saved, result.workout?.sessionKey);
    router.replace({ pathname: '/edit/[id]', params: { id: run.id, fresh: '1' } });
  };

  const discard = async () => {
    if (!(await confirm('Discard run?', 'This run will be deleted and cannot be recovered.', 'Discard', true))) return;
    stopping.current = true;
    await stopTracking();
    recorder.discard();
    goBack();
  };

  const moving = movingMs(rec, now);
  const livePace = currentPace(rec);
  const avgPace = paceSecPerKm(rec.distanceM, moving);
  const split = currentSplit(rec, now);
  // In a workout, laps are the steps and the workout panel shows them.
  const liveLap = rec.lapMarks.length > 0 && !rec.workout ? currentLap(rec, now) : null;
  const workoutView = idle ? planned : rec.workout;
  const stepsLeft = rec.workout != null && rec.lapMarks.length < rec.workout.steps.length;
  // The first fix of a segment must meet the recorder's stricter first-fix accuracy, so only call
  // the signal "ready" at that accuracy until the current segment has its first point.
  const lastSeg = rec.segments[rec.segments.length - 1];
  const needsFirstFix = idle || !lastSeg || lastSeg.length === 0;
  const signal = gpsSignal(g, now, LOST_AFTER_MS, needsFirstFix ? FIRST_FIX_ACCURACY_M : MAX_ACCURACY_M);
  const status = pillStatus(c, rec.simulated || g.mode === 'simulated', access, signal, g.fix?.acc ?? null, g.error);
  const waitingOnPrompt = IS_WEB && access == null && now - openedAt > PROMPT_WAIT_MS;
  const offerSimulation =
    IS_WEB &&
    idle &&
    (waitingOnPrompt ||
      access?.access === 'denied' ||
      access?.access === 'unavailable' ||
      (canTrack && signal !== 'ready' && signal !== 'weak' && now - openedAt > SIMULATE_OFFER_AFTER_MS));
  // Approximate location still runs the preview (so the pill shows the wide accuracy) but can't record.
  const blocked = idle && access?.access !== 'granted';
  // During a real run, lost access gets an inline panel (Allow / Open Settings) above the stats.
  const runBlocked = !idle && !rec.simulated && access != null && access.access !== 'granted';

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <RouteMap segments={rec.segments} live initial={here} style={styles.map} status={blocked ? '' : mapStatus(access, rec.simulated, signal, idle)} />

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        {idle && (
          <Pressable accessibilityLabel="Close" onPress={() => goBack()} style={[styles.close, { backgroundColor: c.card }]}>
            <Ionicons name="chevron-down" size={24} color={c.text} />
          </Pressable>
        )}
        <View style={[styles.gps, { backgroundColor: c.card }]} accessibilityLabel={`GPS status: ${status.text}`}>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{status.text}</Text>
        </View>
      </View>

      <View style={[styles.panel, { backgroundColor: c.card, paddingBottom: insets.bottom + 16 }]}>
        {blocked ? (
          <AccessPanel
            access={access}
            waiting={waitingOnPrompt}
            onAsk={() => refresh(true)}
            onRetry={() => refresh(false)}
            onSimulate={offerSimulation ? () => begin(true) : undefined}
          />
        ) : (
          <>
            {runBlocked && <AccessPanel access={access} onAsk={() => refresh(true)} onRetry={() => refresh(false)} />}
            {idle && planned && <WorkoutPreview workout={planned} />}
            {!idle && <WorkoutPanel rec={rec} now={now} units={units} livePace={livePace} />}
            <View style={styles.bigStat}>
              {rec.status === 'paused' && <Text style={[styles.state, { color: c.muted }]}>PAUSED</Text>}
              {rec.autoPaused && <Text style={[styles.state, { color: c.warn }]}>AUTO-PAUSED</Text>}
              <Stat label="Time" value={formatDuration(moving)} size={workoutView ? 'lg' : 'xl'} align="center" />
            </View>
            <View style={styles.statRow}>
              <Stat label="Distance" value={formatDistanceValue(rec.distanceM, units)} unit={distanceUnit(units)} size="lg" align="center" />
              <Stat label="Pace" value={formatPaceValue(livePace, units)} unit={paceUnit(units)} size="lg" align="center" />
              <Stat label="Avg pace" value={formatPaceValue(avgPace, units)} unit={paceUnit(units)} size="lg" align="center" />
            </View>
            {!idle && (
              <View style={styles.splitRow}>
                <Text style={[styles.split, { color: c.muted }]}>
                  {distanceUnit(units).toUpperCase()} {split.index} · {formatDuration(split.ms)} ·{' '}
                  {formatPaceValue(split.distanceM >= 50 ? paceSecPerKm(split.distanceM, split.ms) : 0, units)}
                  {paceUnit(units)}
                </Text>
                {rec.lastSplit && (
                  <Text style={[styles.split, { color: c.muted }]}>
                    Last {distanceUnit(units)} {formatDuration(rec.lastSplit.ms)}
                  </Text>
                )}
                {liveLap && (
                  <Text style={[styles.split, { color: c.accent }]} accessibilityLabel={`Lap ${liveLap.index} in progress`}>
                    LAP {liveLap.index} · {formatDuration(liveLap.ms)} · {formatDistanceValue(liveLap.distanceM, units)} {distanceUnit(units)}
                  </Text>
                )}
              </View>
            )}
            <Hint
              c={c}
              text={hintText({
                idle,
                simulated: rec.simulated,
                mode: g.mode,
                signal,
                approximate: access?.access === 'approximate',
                hasPoints: rec.segments.some((s) => s.length > 0),
              })}
            />
            <View style={styles.controls}>
              {idle && (
                <RoundButton
                  label={busy ? 'Starting…' : 'Start'}
                  onPress={() => begin(false)}
                  color={c.accent}
                  icon="play"
                  disabled={busy || countdown != null || access?.access !== 'granted'}
                />
              )}
              {rec.status === 'recording' && (
                <>
                  <RoundButton
                    label={stepsLeft ? 'Next step' : 'Lap'}
                    onPress={lap}
                    color={c.accent}
                    icon={stepsLeft ? 'play-skip-forward' : 'timer-outline'}
                    small
                  />
                  <RoundButton label="Pause" onPress={pause} color={c.text} icon="pause" />
                  {/* Keeps Pause centred. */}
                  <View style={styles.spacer} />
                </>
              )}
              {rec.status === 'paused' && (
                <>
                  <RoundButton label="Discard" onPress={discard} color={c.danger} icon="trash" small />
                  <RoundButton label="Resume" onPress={resume} color={c.accent} icon="play" />
                  <RoundButton label="Finish" onPress={finish} color={c.good} icon="flag" small />
                </>
              )}
            </View>
            {offerSimulation && <SimulateButton onPress={() => begin(true)} disabled={busy || countdown != null} />}
          </>
        )}
      </View>

      {countdown != null && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.countdown, { backgroundColor: c.accent }]}
          onPress={go}
          accessibilityLabel={`Starting in ${countdown}. Tap to start now.`}
        >
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownHint}>Tap to start now</Text>
          <Pressable onPress={cancelCountdown} style={[styles.cancel, { bottom: insets.bottom + 32 }]} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

type PillStatus = { color: string; text: string };

function pillStatus(
  c: Colors,
  simulated: boolean,
  access: AccessResult | null,
  signal: ReturnType<typeof gpsSignal>,
  acc: number | null,
  error: string | null,
): PillStatus {
  if (simulated) return { color: c.accent, text: 'Simulated GPS' };
  switch (access?.access) {
    case undefined:
      return { color: c.muted, text: 'Checking location…' };
    case 'undetermined':
      return { color: c.muted, text: 'Location permission needed' };
    case 'denied':
      return { color: c.danger, text: 'No location access' };
    case 'services-off':
      return { color: c.danger, text: 'Location services off' };
    case 'unavailable':
      return { color: c.danger, text: 'GPS unavailable here' };
    case 'approximate':
      return { color: c.warn, text: 'Precise location off' };
  }
  const plusMinus = acc != null ? ` ±${Math.round(acc)} m` : '';
  if (signal === 'ready') return { color: c.good, text: `GPS ready${plusMinus}` };
  if (signal === 'weak') return { color: c.warn, text: `Weak GPS${plusMinus}` };
  if (signal === 'lost') return { color: c.warn, text: 'GPS signal lost' };
  if (error) return { color: c.danger, text: 'GPS error' };
  return { color: c.muted, text: 'Finding GPS…' };
}

function mapStatus(access: AccessResult | null, simulated: boolean, signal: ReturnType<typeof gpsSignal>, idle: boolean): string {
  if (simulated) return 'Simulated route will appear here';
  if (access?.access === 'denied') return 'No location access';
  if (access?.access === 'unavailable') return 'Location unavailable';
  if (signal === 'ready') return idle ? 'Ready – press Start to record your route' : 'Your route will appear here';
  if (signal === 'weak') return 'GPS found – waiting for better accuracy…';
  if (signal === 'lost') return 'GPS signal lost';
  return 'Waiting for GPS…';
}

function hintText(o: {
  idle: boolean;
  simulated: boolean;
  mode: string | null;
  signal: ReturnType<typeof gpsSignal>;
  approximate: boolean;
  hasPoints: boolean;
}): string | null {
  if (o.simulated) return o.idle ? null : 'Demo mode: these GPS points are simulated, not real.';
  if (o.approximate) return 'Precise location is off, so no GPS points can be recorded. Turn it on in Settings.';
  if (!o.idle && !o.hasPoints && o.signal !== 'ready') return 'No usable GPS fix yet. Distance starts counting once one arrives.';
  if (o.idle && o.signal === 'weak') return 'Weak signal. Head outside with a clear view of the sky for the best accuracy.';
  if (!o.idle && o.signal === 'lost') return 'GPS signal lost. Recording continues when it returns.';
  if (!o.idle && o.mode === 'foreground' && !IS_WEB) return 'Background tracking isn’t available in this build. Keep Pacebook open while you run.';
  return null;
}

function Hint({ c, text }: { c: Colors; text: string | null }) {
  if (!text) return null;
  return <Text style={[styles.hint, { color: c.muted }]}>{text}</Text>;
}

function AccessPanel({
  access,
  waiting,
  onAsk,
  onRetry,
  onSimulate,
}: {
  access: AccessResult | null;
  /** Web: the browser's location prompt has gone unanswered for a while. */
  waiting?: boolean;
  onAsk: () => void;
  onRetry: () => void;
  onSimulate?: () => void;
}) {
  const c = useColors();
  let title = waiting ? 'Waiting for the browser’s location prompt…' : 'Checking location access…';
  let body = waiting
    ? 'Answer the location prompt near your browser’s address bar. If none appears, this page may not be allowed to ask.'
    : '';
  let action: { title: string; onPress: () => void } | null = null;
  // In a web preview that can't provide location, the demo is the only thing that works.
  const simulateFirst = IS_WEB && !!onSimulate && access?.access === 'unavailable';

  switch (access?.access) {
    case 'undetermined':
      title = 'Allow location to record runs';
      body = 'Pacebook uses your location while you record to map your route and measure distance and pace.';
      action = { title: 'Allow location', onPress: onAsk };
      break;
    case 'denied':
      title = 'Location access is off';
      body = IS_WEB
        ? "Allow location for this site (the icon in your browser's address bar), then try again."
        : 'Pacebook needs location access to track your route, distance and pace.';
      action = access.canAskAgain
        ? { title: 'Allow location', onPress: onAsk }
        : canOpenSettings
          ? { title: 'Open Settings', onPress: openSettings }
          : { title: IS_WEB ? 'I’ve allowed it – check again' : 'Try again', onPress: onAsk };
      break;
    case 'services-off':
      title = 'Location Services are off';
      body = 'Turn on Location Services for this device to record runs.';
      action = canOpenSettings ? { title: 'Open Settings', onPress: openSettings } : { title: 'Try again', onPress: onRetry };
      break;
    case 'approximate':
      title = 'Precise location is off';
      body = 'With approximate location your position is only known to within hundreds of metres, so Pacebook can’t measure a run. Turn on Precise Location for Pacebook in Settings.';
      action = { title: 'Open Settings', onPress: openSettings };
      break;
    case 'unavailable':
      title = 'GPS is unavailable here';
      body = access.message ?? 'This device or browser can’t provide a location.';
      if (IS_WEB) body += ' Open the app in its own browser tab or on your phone to use real GPS.';
      action = { title: 'Try again', onPress: onAsk };
      break;
  }

  return (
    <View style={styles.access}>
      <Text style={[styles.accessTitle, { color: c.text }]}>{title}</Text>
      {body ? <Text style={[styles.accessBody, { color: c.muted }]}>{body}</Text> : null}
      {simulateFirst && onSimulate && <SimulateButton onPress={onSimulate} primary />}
      {action && <Button title={action.title} onPress={action.onPress} variant={simulateFirst ? 'secondary' : undefined} />}
      {access?.access === 'services-off' || access?.access === 'approximate' ? (
        <Button title="Try again" onPress={onRetry} variant="secondary" />
      ) : null}
      {!simulateFirst && onSimulate && <SimulateButton onPress={onSimulate} />}
    </View>
  );
}

/** Web-only demo entry point; the parent decides when to show it and it never renders on native. */
function SimulateButton({ onPress, disabled, primary }: { onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const c = useColors();
  if (!IS_WEB) return null;
  return (
    <View style={{ gap: 6 }}>
      <Button
        title="Simulate a run (demo, no real GPS)"
        onPress={onPress}
        variant={primary ? undefined : 'secondary'}
        disabled={disabled}
      />
      <Text style={[styles.hint, { color: c.muted }]}>Feeds made-up GPS points so you can try recording in this preview.</Text>
    </View>
  );
}

type RoundProps = {
  label: string;
  onPress: () => void;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  small?: boolean;
  disabled?: boolean;
};

function RoundButton({ label, onPress, color, icon, small, disabled }: RoundProps) {
  const c = useColors();
  const size = small ? 64 : 84;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name={icon} size={small ? 26 : 36} color={color === c.text ? c.card : '#fff'} />
      </Pressable>
      <Text style={{ color: c.muted, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  map: { flex: 1 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16, marginTop: -24 },
  bigStat: { alignItems: 'center' },
  state: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  splitRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: -6 },
  split: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 4 },
  spacer: { width: 64 },
  hint: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
  access: { gap: 12 },
  accessTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  accessBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  countdown: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  countdownNumber: { color: '#fff', fontSize: 160, fontWeight: '900', fontVariant: ['tabular-nums'] },
  countdownHint: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.85 },
  cancel: { position: 'absolute', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.25)' },
  cancelText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
