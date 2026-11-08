# Local admin credential reset

Admin authorization uses the Auth.js credentials provider, bcryptjs password verification and JWT sessions carrying role `ADMIN`. It reads credentials from environment variables, not the Prisma User table. No seed, database edit, TOTP or customer authentication is needed.

Required names: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET` (fallback: `NEXTAUTH_SECRET`). `TEST_MODE` no longer provides alternate credentials. `ADMIN_TOTP_SECRET` is obsolete and should be deleted manually from your environment.

1. Open an interactive PowerShell terminal in the project directory. Avoid an active transcript or screen recording while handling credentials. Do not paste the password into chat, commands, or a repository file.
2. Run `powershell -NoProfile -File .\scripts\prepare-admin-credentials.ps1`.
3. Enter the new login and enter/confirm a new password at the hidden prompts. Use at least 12 characters and at most 72 UTF-8 bytes (bcrypt's limit).
4. The helper hashes with bcrypt cost 12 and generates a new session secret. It copies prepared env lines to your local clipboard. It does not print the password/hash/secret, write credentials to disk, or edit `.env`.
5. Open your local `.env` privately and **replace**, rather than append duplicate, lines for `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, and `TEST_MODE`. Paste the helper's prepared lines. The password hash contains escaped dollar signs required by Next.js env expansion; keep those escapes. Never store the plaintext password there.
6. Delete `ADMIN_TOTP_SECRET`. Keep other integration configuration unchanged. Clear the clipboard: `Set-Clipboard -Value ""`.
7. Stop/restart the local Next server so it loads the new values. Existing process environment overrides take precedence over `.env`; remove any old overrides from that terminal first or use a fresh terminal.
8. Visit `/login`: the new login/password should work without an OTP. Verify a wrong password and the old login/password fail; verify `/admin` redirects when logged out; verify logout. Rotating both session-secret names to the same new value invalidates old JWT sessions as well.

No real credential reset is performed by Batch 1.4. The user performs the final secret update manually. Do not commit `.env` or clipboard contents, run a seed, or update deployment secrets as part of this local procedure.
