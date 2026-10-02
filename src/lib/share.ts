import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes `content` to a cache file and opens the share sheet for it. */
export async function shareTextFile(fileName: string, content: string, mimeType: string, uti?: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: fileName });
}

/** Opens the share sheet for an image captured by react-native-view-shot. */
export async function shareImage(uri: string, title: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
}

/** Lets the user pick a file and returns its text, or null if they cancelled. */
export async function pickTextFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}

export const canShare = () => Sharing.isAvailableAsync();
