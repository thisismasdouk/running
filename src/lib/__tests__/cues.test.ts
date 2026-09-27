import { splitAnnouncement, spokenDuration, spokenPace } from '../cues';

describe('cues', () => {
  it('speaks durations in words', () => {
    expect(spokenDuration(342_000)).toBe('5 minutes 42 seconds');
    expect(spokenDuration(3_725_000)).toBe('1 hour 2 minutes 5 seconds');
    expect(spokenDuration(60_000)).toBe('1 minute');
    expect(spokenDuration(0)).toBe('0 seconds');
  });

  it('speaks pace per km or per mile', () => {
    expect(spokenPace(351, 'metric')).toBe('5 minutes 51 seconds per kilometre');
    // 300 s/km is 8:03 per mile.
    expect(spokenPace(300, 'imperial')).toBe('8 minutes 3 seconds per mile');
    expect(spokenPace(0, 'metric')).toBe('unknown');
  });

  it('announces a split with total time, split pace and average pace', () => {
    const text = splitAnnouncement({ index: 3, distanceM: 3000, movingMs: 1_062_000, splitMs: 351_000, splitM: 1000 }, 'metric');
    expect(text).toBe(
      '3 kilometres. Time 17 minutes 42 seconds. Split pace 5 minutes 51 seconds per kilometre. Average pace 5 minutes 54 seconds per kilometre.',
    );
    expect(splitAnnouncement({ index: 1, distanceM: 1609.344, movingMs: 480_000, splitMs: 480_000, splitM: 1609.344 }, 'imperial')).toMatch(
      /^1 mile\. Time 8 minutes\. Split pace 8 minutes per mile\./,
    );
  });
});
