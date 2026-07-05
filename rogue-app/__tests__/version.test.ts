// Version identification: app.json is the canonical version; package.json
// must stay in lock-step, and the value must be valid semver. This test is
// the "version control" guard — a mismatched bump fails CI.

import { APP_VERSION } from '../src/version';
import pkg from '../package.json';
import appJson from '../app.json';

describe('app version', () => {
  it('is valid semver', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('app.json, package.json, and the runtime constant agree', () => {
    expect(APP_VERSION).toBe(appJson.expo.version);
    expect(pkg.version).toBe(appJson.expo.version);
  });
});
