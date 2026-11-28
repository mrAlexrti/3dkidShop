// The DEV hostname allowlist is shared by the CLI and Preview runtime.
export const neonDev = Object.freeze({
  direct: "ep-old-star-bbhtqk3v.c-15.us-east-1.aws.neon.tech",
  pooled: "ep-old-star-bbhtqk3v-pooler.c-15.us-east-1.aws.neon.tech",
  database: "neondb",
  marker: "3dkid-dev:twilight-fire-25655316:ep-old-star-bbhtqk3v",
});
export const localMarker = "3dkid-local:ops02";

/** @param {string | undefined} value @param {"owner" | "app"} role */
export function devConnection(value, role) {
  let url;
  try { url = new URL(value ?? ""); } catch { throw new Error("OPS02_DATABASE_TARGET_REJECTED"); }
  const user = role === "owner" ? "neondb_owner" : "app_3dkid";
  const host = role === "owner" ? neonDev.direct : neonDev.pooled;
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== host ||
      (url.port && url.port !== "5432") || url.pathname !== "/neondb" || url.username !== user ||
      !url.password || url.hash) throw new Error("OPS02_DATABASE_TARGET_REJECTED");
  const allowed = new Set(["sslmode", "sslrootcert", "channel_binding", "pgbouncer", "schema", "sslaccept", "sslcert", "connect_timeout", "connection_limit"]);
  const seen = new Set();
  for (const [key, setting] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || (key === "schema" && setting !== "public") ||
        (key === "sslmode" && !["require", "verify-full"].includes(setting)) ||
        (key === "sslaccept" && setting !== "strict")) throw new Error("OPS02_DATABASE_OPTIONS_REJECTED");
    seen.add(key);
  }
  let password;
  try { password = decodeURIComponent(url.password); } catch { throw new Error("OPS02_INVALID_CREDENTIAL_ENCODING"); }
  if (password.includes("\0") || /[\r\n]/.test(password)) throw new Error("OPS02_INVALID_CREDENTIAL_ENCODING");
  return { host, user, database: neonDev.database, port: "5432", password };
}

/** @param {string | undefined} value */
export function localAppConnection(value) {
  let url;
  try { url = new URL(value ?? ""); } catch { throw new Error("OPS02_LOCAL_TARGET_REJECTED"); }
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || !/^\d+$/.test(url.port) ||
      Number(url.port) < 1 || Number(url.port) > 65535 ||
      !/^\/(?:ops02_|batch18_review_)[a-f0-9]{32}$/.test(url.pathname) || url.username !== "app_3dkid" ||
      url.password || url.hash ||
      (url.search && url.search !== "?schema=public&connection_limit=6")) throw new Error("OPS02_LOCAL_TARGET_REJECTED");
  return url.pathname.slice(1);
}

/** @param {ReturnType<typeof devConnection>} target @param {string} [ca] */
export function prismaDevUrl(target, ca) {
  const url = new URL("postgresql://" + target.host + "/neondb");
  url.username = target.user;
  url.password = encodeURIComponent(target.password);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  if (ca) url.searchParams.set("sslcert", ca.replaceAll("\\", "/"));
  url.searchParams.set("connection_limit", "3");
  return url.href;
}
