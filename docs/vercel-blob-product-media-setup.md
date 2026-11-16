# Product media uploads — manual Vercel Blob setup

This is an operator guide. No store, deployment, environment variable or Production resource was created or changed during Stage 1.5.

## Provisioning

1. Open the existing Vercel project, then **Storage → Create Storage → Blob**.
2. Choose **Public** access and a product-media store name. Public access is required for storefront URLs.
3. Select **Add a read-write token env var to this connection**. Keep the standard `BLOB_READ_WRITE_TOKEN` variable name; do not expose it with `NEXT_PUBLIC_` or paste it into source/browser settings.
4. Review connected environments deliberately. Use a separate Development/Preview store for future live testing rather than Production storage. Connect Production only through the normal authorized release procedure.
5. Confirm the project uses Node.js **20 or newer**, required by the installed `@vercel/blob@2.9.0`; isolated checks used Node 24.16.0. No Vercel runtime setting was changed here.
6. A future authorized deployment must receive the server-only token. For local work, use a nonproduction store and a gitignored local environment file. Never copy Production credentials into tests.

These dashboard connection and credential steps follow the [official Blob SDK setup documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk#getting-started).

## Token flow and OIDC

This implementation uses `upload()` and `handleUpload()` from `@vercel/blob/client`. The server needs `BLOB_READ_WRITE_TOKEN` to sign narrow client grants and verify completion callbacks. Each browser grant is limited to one server-generated path, one MIME type, an upper byte bound, no overwrite and a five-minute expiry.

OIDC alone does **not** configure this particular flow. Vercel supports OIDC through the distinct `uploadPresigned()` / `handleUploadPresigned()` flow; adopting it would be a separate implementation change. See the [official authentication and client-upload reference](https://vercel.com/docs/vercel-blob/using-blob-sdk#authentication).

No other application environment variable is required for uploads. Batch 1.7.5A cleanup is separately disabled by default and requires both the server-only `PRODUCT_MEDIA_CLEANUP_ENABLED=true` opt-in and a matching `PRODUCT_MEDIA_CLEANUP_SCOPE` approval **after** the [safe activation checks](batch-1.7.5a-media-cleanup.md#safe-activation-in-a-future-release). A shared Production/Preview connection is not isolation evidence: do not approve or enable cleanup while another environment might reference the store. Do not enable uploads by putting a persistent storage token into client code.

## Callback reachability

The endpoint is `/api/product-media/upload`, outside the browser-protected `/admin` route namespace. Browser preparation/token requests require the existing Admin session and matching Origin. Completion requests require the SDK-verified `x-vercel-signature`, without a browser session. The callback URL is derived from the same origin used for token issuance.

For a future live integration check, the callback endpoint must be reachable by Vercel Blob. If Preview deployment protection or a proxy blocks provider requests, arrange approved callback reachability without removing application Admin authorization or SDK signature verification. Localhost is not a publicly reachable callback destination.

Completion callbacks deliberately perform no database attachment, deletion, notification or other business mutation. Provider retries are therefore harmless, and product Save remains independent of callback arrival.

## Admin operation

- Main image: JPG, PNG or WebP; maximum **5,000,000 bytes**.
- Hover animation: GIF or animated WebP; maximum **12,000,000 bytes**.
- Choose a file, inspect its displayed name/size, then select Upload. The URL changes only after a successful upload result is validated.
- Save the product explicitly to persist the URL. A selected/uploaded file alone does not save product data. Save is disabled while either upload is active.
- Manual URL entry, replacement and clearing remain available. An upload failure keeps the previous URL.
- Missing storage configuration disables upload controls with a localized explanation while manual URL entry remains usable.

The file input has no form field name: product Save receives URLs and ordinary text fields, not file bytes or Base64.

## Lifecycle and operational limits

Files use immutable collision-resistant paths under `3dkid/product-media/image/` or `3dkid/product-media/animation/`. Batch 1.7.5A adds deferred cleanup of replaced or cleared **previously saved** managed media: successful mutation, **at least 30 days** of durable retention, a fresh global reference check and a committed retirement marker are required. Reuse cancels pending retirement, and later removal starts a fresh window. Shared assets and external URLs remain protected. Current cart clients use verified images or local placeholders; indefinitely cached pages and external links may eventually lose old URLs. Permanent historical URLs would require keeping previous assets forever. See the [retention guarantee, cleanup protocol and operational limits](batch-1.7.5a-media-cleanup.md). No store-wide expiry policy is set.

Unsaved uploads remain orphan files. A safe future orphan cleanup process should list only this prefix, compare against **all** saved main/gallery/hover URLs and other content references, report old unreferenced candidates, and require operator review plus the same retirement/locking protocol before explicit deletion. Do not delete merely because one product stopped using a URL. No orphan cleanup job or media library is implemented here.

The first 32 bytes are checked in the browser and verified as bounded header metadata by the server before authorizing an object path. MIME and byte limits are also included in the Blob grant. This lightweight preflight is not full binary decoding, malware scanning or cryptographic attestation of bytes sent directly by a deliberately modified Admin client. No arbitrary remote URL is fetched for validation.

Abuse control allows 40 preparation/token requests per minute per warm server instance, in addition to Admin checks and provider constraints. It is not a distributed quota; larger deployments can add shared limiting or approved platform controls later.

## Dependencies and isolated checks

The official SDK is pinned to `2.9.0`. Its new CLI helper's Zod dependency is narrowly overridden to patched `4.6.7`; the application's existing Zod 3 and other existing dependency versions remain unchanged. Installation used `--legacy-peer-deps` because of the repository's existing React release-candidate/Framer Motion peer constraint. No global npm configuration was changed.

Tests use mocked SDK storage operations and fixture credentials only. The callback verification probe uses the installed SDK locally without a storage request. The production-build runner blanks Blob credentials and forbids provider fetches. Do not run these tests with real storage uploads enabled.
