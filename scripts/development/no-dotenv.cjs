// Keep guarded tooling from reading the workspace's existing environment files.
/* eslint-disable @typescript-eslint/no-require-imports -- Node preloads this file. */
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const Module = require("node:module");
function dotenvPath(file) {
  const value = file instanceof URL ? fileURLToPath(file) : Buffer.isBuffer(file) ? file.toString() : file;
  return typeof value === "string" && /^\.env(?:\.|$)/i.test(path.basename(value));
}
function deny(file) {
  if (dotenvPath(file)) {
    throw Object.assign(new Error("Guarded tooling does not read dotenv files"), { code: "ENOENT" });
  }
}
const exists = fs.existsSync;
fs.existsSync = function (file) { return !dotenvPath(file) && exists.call(this, file); };
for (const api of ["readFile", "readFileSync", "open", "openSync"]) {
  const original = fs[api];
  fs[api] = function (file, ...args) { deny(file); return original.call(this, file, ...args); };
}
for (const api of ["readFile", "open"]) {
  const original = fs.promises[api];
  fs.promises[api] = async function (file, ...args) { deny(file); return original.call(this, file, ...args); };
}
Module.syncBuiltinESMExports();
const load = Module._load;
Module._load = function (name, parent, isMain) {
  const result = load.call(this, name, parent, isMain);
  if (name === "@next/env") return { ...result, loadEnvConfig: () => ({ combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] }) };
  return result;
};
