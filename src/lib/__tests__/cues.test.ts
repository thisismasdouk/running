import { lapAnnouncement, numberToWords, SAMPLE_CUE, splitAnnouncement, spokenDuration, spokenPace } from '../cues';

describe('cues', () => {
  it('writes numbers as words', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(29)).toBe('twenty-nine');
    expect(numberToWords(40)).toBe('forty');
    expect(numberToWords(342)).toBe('three hundred and forty-two');
    expect(numberToWords(1005)).toBe('one thousand and five');
    expect(numberToWords(2300)).toBe('two thousand three hundred');
  });

  it('speaks durations the way a runner would say them', () => {
    expect(spokenDuration(329_000)).toBe('five minutes twenty-nine');
    expect(spokenDuration(305_000)).toBe('five minutes and five seconds');
    expect(spokenDuration(60_000)).toBe('one minute');
    expect(spokenDuration(42_000)).toBe('forty-two seconds');
    expect(spokenDuration(0)).toBe('zero seconds');
    expect(spokenDuration(3_725_000)).toBe('one hour, two minutes and five seconds');
    expect(spokenDuration(3_600_000)).toBe('one hour');
    expect(spokenDuration(5_400_000)).toBe('one hour and thirty minutes');
  });

  it('never produces clock-style or digit tokens', () => {
    for (const ms of [1_000, 59_000, 329_000, 3_725_000, 9_999_000]) expect(spokenDuration(ms)).not.toMatch(/\d|:/);
  });

  it('speaks pace per km or per mile', () => {
    expect(spokenPace(351, 'metric')).toBe('five minutes fifty-one per kilometre');
    // 300 s/km is 8:03 per mile.
    expect(spokenPace(300, 'imperial')).toBe('eight minutes and three seconds per mile');
    expect(spokenPace(0, 'metric')).toBe('unknown');
  });

  it('announces the first split with its pace and the total time', () => {
    expect(splitAnnouncement(SAMPLE_CUE, 'metric')).toBe(
      'One kilometre. Five minutes twenty-nine per kilometre. Total time five minutes twenty-nine.',
    );
    expect(splitAnnouncement({ index: 1, distanceM: 1609.344, movingMs: 480_000, splitMs: 480_000, splitM: 1609.344 }, 'imperial')).toBe(
      'One mile. Eight minutes per mile. Total time eight minutes.',
    );
  });

  it('announces later splits with the last split, average pace and total time', () => {
    const text = splitAnnouncement({ index: 3, distanceM: 3000, movingMs: 1_062_000, splitMs: 351_000, splitM: 1000 }, 'metric');
    expect(text).toBe(
      'Three kilometres. Last kilometre five minutes fifty-one. Average five minutes fifty-four per kilometre. Total time seventeen minutes forty-two.',
    );
  });

  it('announces a lap', () => {
    expect(lapAnnouncement(3, 112_000)).toBe('Lap three. One minute fifty-two.');
  });
});
