// Extends app.json with values that must not be committed. The Google Maps
// key for Android comes from an EAS environment variable (see docs/APP_STORE.md).
// Without it the map renders blank in Android dev/production builds; Expo Go
// and iOS (Apple Maps) work without a key.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
  ],
});
