export const minimumPasswordLength = 12;

export function passwordFits(password: string) {
  return password.length <= 72 && new TextEncoder().encode(password).byteLength <= 72 && !password.includes("\0");
}

export function passwordCreationError(password: unknown, confirmation: unknown) {
  if (typeof password !== "string" || password.length < minimumPasswordLength || password.includes("\0")) {
    return "passwordRequirements";
  }
  if (!passwordFits(password)) return "passwordLengthLimit";
  if (password !== confirmation) return "passwordMismatch";
  return null;
}
