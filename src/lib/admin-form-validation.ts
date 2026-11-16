import type { z } from "zod";

export type AdminFieldError = "required" | "invalid" | "tooLong" | "slugInvalid" | "slugDuplicate" | "galleryLimit" | "galleryOwnership" | "parentInvalid";
export type AdminFormResult = { error: "validation" | "saveFailed" | "notFound" | "mediaRetired" | "slugInvalid" | "slugDuplicate"; fieldErrors?: Record<string, AdminFieldError> } | void;
export type AdminDeleteResult = { error: "orderHistory" | "referenced" | "deleteFailed" | "notFound" | "forbidden" } | void;

export function validationResult(error: z.ZodError): AdminFormResult {
  const fieldErrors: Record<string, AdminFieldError> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!fieldErrors[field]) {
      const required = issue.code === "invalid_type" && issue.received === "undefined" ||
        issue.code === "too_small" && issue.type === "string" && issue.minimum === 1 ||
        issue.code === "custom" && issue.message === "required";
      fieldErrors[field] = required ? "required" : issue.code === "too_big" && issue.type === "string" ? "tooLong" : "invalid";
    }
  }
  return { error: "validation", fieldErrors };
}

// Never let malformed JSON escape Zod as an unstructured SyntaxError.
export function boundedJson(value: unknown, maxLength = 50000): unknown {
  if (typeof value !== "string") return value;
  if (value.length > maxLength) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export class AdminInputError extends Error {
  constructor(public field: string, public reason: AdminFieldError) { super("ADMIN_INPUT_INVALID"); }
}
export function isUniqueFieldError(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const target = "meta" in error ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.toLowerCase().includes(field.toLowerCase());
}
