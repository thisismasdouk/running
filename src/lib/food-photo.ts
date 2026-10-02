import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type MealPhoto = { uri: string; base64: string };

/** Long edge sent to the AI: enough to recognise food, small enough to upload quickly. */
const MAX_EDGE = 1024;

/**
 * Takes or picks a meal photo and shrinks it to a JPEG ready to send.
 * Resolves null if the user cancelled, 'denied' without camera permission.
 */
export async function getMealPhoto(source: 'camera' | 'library'): Promise<MealPhoto | null | 'denied'> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width ?? 0, asset.height ?? 0) > MAX_EDGE) ctx.resize(landscape ? { width: MAX_EDGE } : { height: MAX_EDGE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Couldn’t read the photo.');
  return { uri: saved.uri, base64: saved.base64 };
}
