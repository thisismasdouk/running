import type { HeartRateSummary } from './heartrate';

export type Units = 'metric' | 'imperial';

/** A single recorded GPS fix. */
export type TrackPoint = {
  lat: number;
  lon: number;
  /** Altitude in metres, if the device reported one. */
  alt: number | null;
  /** Epoch milliseconds. */
  t: number;
  /** Horizontal accuracy in metres, if known. */
  acc: number | null;
};

/**
 * A run's route is a list of segments. A new segment begins every time the
 * run is resumed after a pause, so the distance covered while paused is
 * never counted.
 */
export type Segment = TrackPoint[];

export type Split = {
  /** 1-based split number. */
  index: number;
  /** Distance covered in this split, in metres (the last split may be partial). */
  distanceM: number;
  durationMs: number;
  /** Seconds per kilometre. */
  paceSecPerKm: number;
  elevationDeltaM: number;
};

export type BestEffortKey = '400m' | '1k' | '1mi' | '5k' | '10k' | 'half' | 'marathon';

export type RunType = 'easy' | 'long' | 'tempo' | 'intervals' | 'race' | 'recovery';

/** A manual lap: the distance and moving time covered within it. */
export type Lap = { distanceM: number; movingMs: number };

export type Shoe = {
  id: string;
  name: string;
  /** Retired shoes keep their mileage but aren't offered for new runs. */
  retired: boolean;
  addedAt: number;
};

/*
 * Fields added after the first release (type, laps, shoeId) are optional so
 * runs saved by older versions keep loading.
 */
export type Run = {
  id: string;
  title: string;
  notes: string;
  /** Perceived effort 1–10, or null if not set. */
  effort: number | null;
  startedAt: number;
  /** Time spent moving (excludes pauses). */
  movingMs: number;
  /** Wall-clock time from start to finish. */
  elapsedMs: number;
  distanceM: number;
  elevationGainM: number;
  segments: Segment[];
  /** Fastest time in ms for each standard distance reached during this run. */
  bestEfforts: Partial<Record<BestEffortKey, number>>;
  /** Recorded with the web demo's simulated GPS rather than a real device. */
  simulated?: boolean;
  /** Kind of workout; treated as 'easy' when missing. */
  type?: RunType;
  /** Manual laps, in order. The last one runs from the final Lap press to Finish. */
  laps?: Lap[];
  shoeId?: string;
  /** Set when the run was recorded as a guided workout. */
  workoutId?: string;
  workoutName?: string;
  /** The workout's steps in order; laps[i] is the result of workoutSteps[i]. */
  workoutSteps?: FlatStep[];
  /** Heart rate read from Apple Health for the run's time window. */
  heartRate?: HeartRateSummary;
  /** When the run was written to Apple Health. */
  healthSavedAt?: number;
};

export type StepKind = 'warmup' | 'run' | 'recover' | 'cooldown';

/** How long a workout step lasts: a distance or an amount of moving time. */
export type StepTarget = { type: 'distance'; metres: number } | { type: 'time'; seconds: number };

/** A pace band in seconds per km. `min` is the fast end, `max` the slow end. */
export type PaceTarget = { min: number; max: number };

export type WorkoutStep = { kind: StepKind; target: StepTarget; pace?: PaceTarget };

/** Steps run `repeat` times in a row, e.g. 6 × [400 m run, 90 s recover]. */
export type RepeatBlock = { repeat: number; steps: WorkoutStep[] };

export type WorkoutItem = WorkoutStep | RepeatBlock;

/** One step of a workout once repeats are written out, with its place in its repeat block. */
export type FlatStep = WorkoutStep & { rep?: number; reps?: number };

export type Workout = {
  id: string;
  name: string;
  /** One line shown under the name. */
  description?: string;
  /** The run type a run of this workout is saved with. */
  runType: RunType;
  items: WorkoutItem[];
  /** Part of the built-in library (can't be edited or deleted). */
  builtIn?: boolean;
  createdAt?: number;
};

export type SessionStatus = 'done' | 'skipped';

/** The plan the runner is following and how each session went, keyed by session key. */
export type ActivePlan = {
  planId: string;
  /** Local midnight of the plan's first day. */
  startDate: number;
  /** Local midnight of race day, if the runner set one. */
  raceDate?: number;
  sessions: Record<string, { status: SessionStatus; runId?: string; at: number }>;
};

export type Profile = {
  name: string;
  units: Units;
  /** Weekly distance goal in metres. */
  weeklyGoalM: number;
  /** Announce each km/mile split with a haptic buzz. */
  splitHaptics: boolean;
  /** Speak split times and paces (and pause/resume) aloud. */
  audioCues: boolean;
  /** Stop the clock automatically while standing still. */
  autoPause: boolean;
  /** Count down 3-2-1 before recording starts. */
  countdown: boolean;
  /** Voice identifier for spoken cues, or null to pick the best one automatically. */
  voiceId: string | null;
  /** Speech rate multiplier, 1 = the platform's normal speed. */
  speechRate: number;
  /** Shoe preselected for new runs. */
  defaultShoeId: string | null;
  /** Save runs to Apple Health and read heart rate from it (iOS development/App Store builds). */
  healthSync: boolean;
  /** For heart-rate zones; DEFAULT_MAX_HR when not set. */
  maxHr: number | null;
  /** Body weight in kg, for calorie estimates. */
  weightKg: number | null;
};
