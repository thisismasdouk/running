import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { deliver } from './deliver';
import { gps } from './gps';
import { LOCATION_TASK, toPoint } from './location';

/*
 * Receives fixes from startLocationUpdatesAsync. This module is imported by
 * the app entry (index.ts), not by a screen: when Android restarts the JS
 * headlessly for the location service, no routes are loaded, and a task
 * defined inside a route file would never exist. Keep it free of UI imports.
 */
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      gps.reportError(error.message);
      return;
    }
    if (!data?.locations?.length) return;
    deliver(data.locations.map(toPoint));
  });
}
