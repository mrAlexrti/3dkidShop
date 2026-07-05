export function readServerEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

export function isTestModeEnabled() {
  return readServerEnv("TEST_MODE") === "1";
}

export function getAuthSecret() {
  return readServerEnv("AUTH_SECRET") || readServerEnv("NEXTAUTH_SECRET");
}

export function getAuthDiagnostics() {
  const testMode = readServerEnv("TEST_MODE") || "0";

  return {
    testMode,
    testModeEnabled: testMode === "1",
    hasAdminUsername: Boolean(readServerEnv("ADMIN_USERNAME")),
    hasAdminPasswordHash: Boolean(readServerEnv("ADMIN_PASSWORD_HASH")),
    hasAdminTotpSecret: Boolean(readServerEnv("ADMIN_TOTP_SECRET")),
    hasAuthSecret: Boolean(readServerEnv("AUTH_SECRET")),
    hasNextAuthSecret: Boolean(readServerEnv("NEXTAUTH_SECRET")),
    hasAnyAuthSecret: Boolean(getAuthSecret()),
    hasNextAuthUrl: Boolean(readServerEnv("NEXTAUTH_URL")),
    hasAuthUrl: Boolean(readServerEnv("AUTH_URL")),
    authDebugEnabled: readServerEnv("AUTH_DEBUG") === "1",
  };
}