import { NextResponse } from "next/server";
import { parseMonoSnapshot, verifyMonoSignature, queryMonoInvoice } from "@/lib/payments/mono";
import { monoEvidence } from "@/lib/payments/mono-state";
import { applyPaymentEvidence } from "@/lib/payments/transitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 32768;

export async function POST(request: Request) {
  const reply = (status: number) => NextResponse.json({ success: status === 200 }, { status });
  if (Number(request.headers.get("content-length")) > MAX_BODY) return reply(413);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return reply(413); }
      chunks.push(chunk.value);
    }
  } catch { return reply(400); }
  const raw = Buffer.concat(chunks);
  try {
    if (!await verifyMonoSignature(raw, request.headers.get("x-sign"))) return reply(401);
  } catch { return reply(503); }
  let evidence;
  try { evidence = monoEvidence(parseMonoSnapshot(JSON.parse(raw.toString("utf8")))); }
  catch { return reply(400); }
  try {
    let outcome = await applyPaymentEvidence(evidence);
    if (outcome === "unbound") {
      // Early delivery / lost create response: verify merchant ownership through
      // the authenticated API before conditional first-invoice binding.
      const current = await queryMonoInvoice(evidence.invoiceId);
      if (current.invoiceId !== evidence.invoiceId || current.reference !== evidence.reference || current.amount !== evidence.amount || current.ccy !== evidence.currency) return reply(400);
      outcome = await applyPaymentEvidence(monoEvidence(current), { authenticatedInvoiceBinding: true });
    }
    if (outcome === "not_found") return reply(404);
    if (outcome === "mismatch") return reply(400);
    if (outcome === "conflict") return reply(409);
    return reply(200);
  } catch { return reply(503); }
}
