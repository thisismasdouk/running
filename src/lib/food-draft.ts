import type { MealPhoto } from './food-photo';

/**
 * The photo just taken on the Food tab, handed to the add screen. It's too
 * big for route params, and only one meal is added at a time.
 */
let pending: MealPhoto | null = null;

export const setPendingPhoto = (photo: MealPhoto | null) => {
  pending = photo;
};

export const getPendingPhoto = () => pending;
