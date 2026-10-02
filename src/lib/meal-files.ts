import { Directory, File, Paths } from 'expo-file-system';

/** Copies a meal photo out of the cache into the app's documents so it survives cache clean-up. */
export async function keepMealPhoto(uri: string, id: string): Promise<string | undefined> {
  try {
    const dir = new Directory(Paths.document, 'meals');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, `${id}.jpg`);
    if (dest.exists) dest.delete();
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return undefined;
  }
}

export function deleteMealPhoto(uri: string | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
