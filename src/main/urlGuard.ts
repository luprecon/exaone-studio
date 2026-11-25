export const APP_SCHEME = 'app';
export const APP_HOST = 'exaone';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export function isAllowedInAppUrl(targetUrl: string, devUrl?: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (devUrl) {
      return parsed.origin === new URL(devUrl).origin;
    }
    return (
      parsed.protocol === `${APP_SCHEME}:` &&
      parsed.host === APP_HOST &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
