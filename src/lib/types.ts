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
};
