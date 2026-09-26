import { formatDistance, formatDuration, formatPace } from '../format';

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('formats pace per km and per mile', () => {
    expect(formatPace(300, 'metric')).toBe('5:00 /km');
    expect(formatPace(300, 'imperial')).toBe('8:03 /mi');
    expect(formatPace(0, 'metric')).toBe('–:–– /km');
  });

  it('formats distance', () => {
    expect(formatDistance(5000, 'metric')).toBe('5.00 km');
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
  });
});
