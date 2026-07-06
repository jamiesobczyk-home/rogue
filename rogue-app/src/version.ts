// Single runtime source of the app version. app.json (expo.version) is the
// canonical value — it is what store builds and `expo export` embed. The
// package.json version is kept in lock-step by __tests__/version.test.ts.
import appJson from '../app.json';

export const APP_VERSION: string = appJson.expo.version;
