// Renders the Pacebook icon set (assets/*.png) from the SVG below with a
// headless Chromium, then re-encodes with pngjs (opaque icons as RGB, since
// App Store icons must not have an alpha channel).
//
// Needs Playwright: `npm i -g playwright && npx playwright install chromium`.
// Set CHROMIUM_PATH to use a specific Chromium binary.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, '..', 'assets');
const ORANGE = '#FC4C02';

// The mark: a bold, forward-leaning "P" with three motion streaks, in a 1024 box.
function glyph(color, scale = 1) {
  const t = `translate(512 512) scale(${scale}) translate(-512 -512)`;
  return `
  <g transform="${t}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(560 512) skewX(-14) translate(-560 -512)">
      <path d="M 455 760 L 455 290 L 585 290 C 760 290 760 540 585 540 L 455 540" stroke-width="118"/>
    </g>
    <path d="M 150 420 L 300 420" stroke-width="46" opacity="0.95"/>
    <path d="M 105 520 L 310 520" stroke-width="46" opacity="0.8"/>
    <path d="M 165 620 L 290 620" stroke-width="46" opacity="0.65"/>
  </g>`;
}

const svg = (size, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

const jobs = [
  // iOS / universal icon: opaque, full bleed, no rounded corners (the OS masks it).
  { file: 'icon.png', size: 1024, svg: svg(1024, glyph('#fff', 0.92), ORANGE), opaque: true },
  // Android adaptive: the launcher crops to a circle/squircle, keep the glyph in the 66% safe zone.
  { file: 'android-icon-foreground.png', size: 1024, svg: svg(1024, glyph('#fff', 0.6)) },
  { file: 'android-icon-background.png', size: 1024, svg: svg(1024, '', ORANGE), opaque: true },
  { file: 'android-icon-monochrome.png', size: 1024, svg: svg(1024, glyph('#fff', 0.6)) },
  // Splash: white mark on transparent, shown over the orange splash background.
  { file: 'splash-icon.png', size: 1024, svg: svg(1024, glyph('#fff', 0.95)) },
  { file: 'favicon.png', size: 48, svg: svg(48, glyph('#fff', 1.0), ORANGE), opaque: true },
];

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.setViewportSize({ width: j.size, height: j.size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${j.svg}</body></html>`);
    const buf = await page.screenshot({ omitBackground: !j.opaque, clip: { x: 0, y: 0, width: j.size, height: j.size } });
    const png = PNG.sync.read(buf);
    const out = PNG.sync.write(png, j.opaque ? { colorType: 2, inputHasAlpha: true } : { colorType: 6 });
    fs.writeFileSync(path.join(OUT, j.file), out);
    console.log(j.file, png.width, png.height, j.opaque ? 'RGB' : 'RGBA');
  }
  await browser.close();
})();
