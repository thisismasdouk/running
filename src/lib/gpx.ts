import { GAP_MS } from './geo';
import { buildRun } from './runs';
import type { Run, Segment, TrackPoint } from './types';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** GPX 1.1 for a run: one track, one track segment per pause-separated segment. */
export function toGpx(run: Run): string {
  const segs = run.segments
    .filter((s) => s.length > 0)
    .map((seg) => {
      const pts = seg
        .map((p) => {
          const ele = p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '';
          return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`;
        })
        .join('\n');
      return `    <trkseg>\n${pts}\n    </trkseg>`;
    })
    .join('\n');
  const desc = run.notes ? `\n    <desc>${escapeXml(run.notes)}</desc>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pacebook" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(run.title)}</name>
    <time>${new Date(run.startedAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(run.title)}</name>${desc}
    <type>running</type>
${segs}
  </trk>
</gpx>
`;
}

/** "Morning Run" → "pacebook-2026-10-02-morning-run.gpx". */
export function gpxFileName(run: Run): string {
  const d = new Date(run.startedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slug = run.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `pacebook-${date}${slug ? `-${slug}` : ''}.gpx`;
}

const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`));
  return m ? Number(m[1]) : NaN;
};

export type ParsedGpx = { name: string | null; notes: string | null; segments: Segment[] };

/**
 * Reads the track points of a GPX file (as exported by Strava, Garmin,
 * Apple Workout apps and others). Points without a timestamp are dropped,
 * since pace can't be computed without them. Route-only files (`<rtept>`)
 * have no times and come back empty.
 */
export function parseGpx(xml: string): ParsedGpx {
  const trk = xml.match(/<trk\b[\s\S]*?<\/trk>/)?.[0] ?? xml;
  const name = trk.match(/<name>([\s\S]*?)<\/name>/)?.[1];
  const desc = trk.match(/<desc>([\s\S]*?)<\/desc>/)?.[1];
  const segBodies = trk.match(/<trkseg\b[\s\S]*?<\/trkseg>/g) ?? [trk];
  const segments: Segment[] = [];
  for (const body of segBodies) {
    const seg: TrackPoint[] = [];
    const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const lat = attr(m[1], 'lat');
      const lon = attr(m[1], 'lon');
      const inner = m[2] ?? '';
      const time = inner.match(/<time>([^<]+)<\/time>/)?.[1];
      const t = time ? Date.parse(time.trim()) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
      const eleRaw = inner.match(/<ele>([^<]+)<\/ele>/)?.[1];
      const ele = eleRaw != null ? Number(eleRaw) : NaN;
      seg.push({ lat, lon, alt: Number.isFinite(ele) ? ele : null, t, acc: null });
    }
    seg.sort((a, b) => a.t - b.t);
    // Long gaps inside a segment are pauses (watches often don't split segments).
    let cur: Segment = [];
    for (const p of seg) {
      const prev = cur[cur.length - 1];
      if (prev && p.t - prev.t > GAP_MS) {
        segments.push(cur);
        cur = [];
      }
      cur.push(p);
    }
    if (cur.length) segments.push(cur);
  }
  return {
    name: name ? unescapeXml(name).trim() || null : null,
    notes: desc ? unescapeXml(desc).trim() || null : null,
    segments: segments.filter((s) => s.length > 1),
  };
}

/** Turns a GPX file into a Run, or null if it holds no timed track. */
export function runFromGpx(xml: string): Run | null {
  const { name, notes, segments } = parseGpx(xml);
  if (segments.length === 0) return null;
  const first = segments[0][0];
  const lastSeg = segments[segments.length - 1];
  const last = lastSeg[lastSeg.length - 1];
  const movingMs = segments.reduce((sum, s) => sum + (s[s.length - 1].t - s[0].t), 0);
  const run = buildRun({ startedAt: first.t, segments, movingMs, elapsedMs: last.t - first.t });
  return { ...run, ...(name ? { title: name } : {}), ...(notes ? { notes } : {}) };
}
