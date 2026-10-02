// Photos picked in a browser are temporary blob URLs, so the web log keeps no photos.
export async function keepMealPhoto(_uri: string, _id: string): Promise<string | undefined> {
  return undefined;
}

export function deleteMealPhoto(_uri: string | undefined) {}
