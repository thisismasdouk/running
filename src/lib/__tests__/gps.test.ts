import { FIRST_FIX_ACCURACY_M, MAX_ACCURACY_M } from '../geo';
import { gpsSignal } from '../gps';

const fix = (acc: number | null) => ({ lat: 0, lon: 0, alt: null, t: 0, acc });

describe('gpsSignal', () => {
  it('is searching before any fix', () => {
    expect(gpsSignal({ fix: null, receivedAt: null }, 1000)).toBe('searching');
  });

  it('is ready for a fresh, accurate fix and weak for a wide one', () => {
    expect(gpsSignal({ fix: fix(8), receivedAt: 1000 }, 2000)).toBe('ready');
    expect(gpsSignal({ fix: fix(null), receivedAt: 1000 }, 2000)).toBe('ready');
    // Approximate location or a cold start: too wide to record.
    expect(gpsSignal({ fix: fix(1500), receivedAt: 1000 }, 2000)).toBe('weak');
  });

  it('is lost when fixes stop arriving', () => {
    expect(gpsSignal({ fix: fix(5), receivedAt: 0 }, 16_000)).toBe('lost');
    expect(gpsSignal({ fix: fix(5), receivedAt: 0 }, 16_000, 60_000)).toBe('ready');
  });

  it('uses the stricter first-fix accuracy when asked, matching what the recorder accepts', () => {
    // 30 m is recordable mid-segment but not as the first point of a segment.
    expect(gpsSignal({ fix: fix(30), receivedAt: 1000 }, 2000)).toBe('ready');
    expect(gpsSignal({ fix: fix(30), receivedAt: 1000 }, 2000, 15_000, FIRST_FIX_ACCURACY_M)).toBe('weak');
    expect(gpsSignal({ fix: fix(FIRST_FIX_ACCURACY_M), receivedAt: 1000 }, 2000, 15_000, FIRST_FIX_ACCURACY_M)).toBe('ready');
    expect(gpsSignal({ fix: fix(MAX_ACCURACY_M + 1), receivedAt: 1000 }, 2000)).toBe('weak');
  });
});
