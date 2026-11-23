// Server-only decision; never infer safety from NODE_ENV, Preview or TEST_MODE.
// Separately authorized activation follows schema/role/isolation/writer preflight.
export function nativeVariantWritesEnabled() {
  return process.env.PRODUCT_VARIANTS_ENABLED === "true";
}
