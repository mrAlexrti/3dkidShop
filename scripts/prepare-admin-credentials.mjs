// stdin -> prepared env lines, consumed privately by the interactive PowerShell wrapper.
import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

(async () => {
  const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
  if (typeof input.username !== "string" || !input.username.trim() || /[\r\n"\x00]/.test(input.username)) throw new Error();
  if (typeof input.password !== "string" || input.password.length < 12 || Buffer.byteLength(input.password, "utf8") > 72) throw new Error();
  const hash = (await bcrypt.hash(input.password, 12)).replaceAll("$", "\\$");
  const secret = crypto.randomBytes(48).toString("base64url");
  process.stdout.write(`ADMIN_USERNAME="${input.username.trim()}"\nADMIN_PASSWORD_HASH="${hash}"\nAUTH_SECRET="${secret}"\nNEXTAUTH_SECRET="${secret}"\nTEST_MODE=0\n`);
})().catch(() => { process.stderr.write("Credential preparation failed."); process.exitCode = 1; });
