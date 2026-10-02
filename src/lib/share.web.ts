// expo-file-system doesn't run on web, so files are downloaded instead of shared.

function download(href: string, fileName: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function shareTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  download(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** On web the capture is a data URI. */
export async function shareImage(uri: string, title: string): Promise<void> {
  download(uri, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'run'}.png`);
}

export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const canShare = async () => true;
