import { gpxFileName, parseGpx, runFromGpx, toGpx } from '../gpx';
import { buildRun } from '../runs';
import { straightRun } from '@/test/helpers';

const START = Date.UTC(2026, 9, 2, 7, 0, 0);

describe('gpx', () => {
  it('round-trips a run through GPX', () => {
    const a = straightRun(2000, 300, { start: START, alt: (d) => 10 + d / 100 });
    const b = straightRun(1000, 300, { start: START + 700_000 });
    const run = { ...buildRun({ startedAt: START, segments: [a, b], movingMs: 900_000, elapsedMs: 1_000_000 }), title: 'Tempo & <hills>', notes: 'Felt "good"' };
    const xml = toGpx(run);
    expect(xml).toContain('<name>Tempo &amp; &lt;hills&gt;</name>');
    expect((xml.match(/<trkseg>/g) ?? []).length).toBe(2);

    const back = runFromGpx(xml)!;
    expect(back.title).toBe('Tempo & <hills>');
    expect(back.notes).toBe('Felt "good"');
    expect(back.startedAt).toBe(START);
    expect(back.segments).toHaveLength(2);
    expect(Math.abs(back.distanceM - run.distanceM)).toBeLessThan(1);
    expect(back.segments[0][0].alt).toBeCloseTo(10, 1);
  });

  it('splits long gaps inside a segment and drops untimed points', () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>Watch run</name><trkseg>
      <trkpt lat="51.5" lon="-0.1"><time>2026-10-02T07:00:00Z</time></trkpt>
      <trkpt lat="51.5001" lon="-0.1"><time>2026-10-02T07:00:05Z</time></trkpt>
      <trkpt lat="51.5002" lon="-0.1"></trkpt>
      <trkpt lat="51.5010" lon="-0.1"><time>2026-10-02T07:05:00Z</time></trkpt>
      <trkpt lat='51.5011' lon='-0.1'><time>2026-10-02T07:05:05Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.name).toBe('Watch run');
    expect(parsed.segments.map((s) => s.length)).toEqual([2, 2]);
    const run = runFromGpx(xml)!;
    expect(run.movingMs).toBe(10_000);
    expect(run.elapsedMs).toBe(305_000);
  });

  it('rejects files without a timed track', () => {
    expect(runFromGpx('<gpx><rte><rtept lat="1" lon="1"/></rte></gpx>')).toBeNull();
    expect(runFromGpx('not xml')).toBeNull();
  });

  it('names files after the date and title', () => {
    const run = buildRun({ startedAt: new Date(2026, 9, 2, 7).getTime(), segments: [], movingMs: 0, elapsedMs: 0 });
    expect(gpxFileName({ ...run, title: 'Morning Run!' })).toBe('pacebook-2026-10-02-morning-run.gpx');
  });
});
