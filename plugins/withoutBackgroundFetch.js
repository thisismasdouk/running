// expo-task-manager's config plugin always adds the "fetch" background mode,
// but Stride never uses background fetch. App Review asks about background
// modes an app declares without using, so strip it and keep "location"
// (run tracking) and "audio" (spoken split cues while the phone is locked).
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withoutBackgroundFetch(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) cfg.modResults.UIBackgroundModes = modes.filter((m) => m !== 'fetch');
    return cfg;
  });
};
