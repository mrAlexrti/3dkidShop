# Batch 1.7 provider and baseline audit

Audited 2026-11-13 from accepted HEAD `9f03f97f467e0de3b9abc9d04a65f6ec309da50b`.
The original finished-unit inventory interpretation was superseded by the user's
print-on-demand correction. The authoritative availability/migration design is
[the revised gate](BATCH_1_7_PRINT_ON_DEMAND_SCHEMA_GATE.md), with implementation and
verification recorded in [the final report](BATCH_1_7_REPORT.md).

## Baseline findings retained

- Checkout used a truncated timestamp number, signed LiqPay sandbox handoff,
  server-side product/size pricing, and a transactional numeric stock decrement.
  The final implementation replaces numeric inventory behavior with orderability.
- Existing Order fields already separated provider/mode/payment status/paidAt from
  delivery snapshots and the legacy order enum. Batch 1.6 normalized statuses and
  semantic notification events remain the application source of truth.
- Result access already used a signed, expiring, status-only capability. Browser
  redirect flags were not proof of payment; that protection is retained.
- Nova Poshta save already used BackwardDeliveryData with Recipient/Money and
  server Order.total. Broad payment-method substring detection and non-provider
  COD eligibility needed explicit method checks. Payload field assumptions remain
  unchanged; no separate NovaPay internet acquiring is introduced.
- Existing TTN protection returns an already-stored TTN and conditionally persists
  shipment fields once. It does not prevent two concurrent outbound carrier calls.
- Notifications use semantic transitions, Admin channel/event toggles and
  post-commit winner dispatch. They are best effort, without a durable outbox.
- Existing scheduling is a GitHub workflow calling the protected NP cron every
  30 minutes. No production schedule or Vercel configuration was changed.

## Official documentation checked

- [Acquiring overview](https://monobank.ua/api-docs/acquiring)
- [Internet acquiring](https://monobank.ua/api-docs/acquiring/methods/ia)
- [Create invoice](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create)
- [Invoice status](https://monobank.ua/api-docs/acquiring/methods/ia/get--api--merchant--invoice--status)
- [Webhook verification](https://monobank.ua/api-docs/acquiring/dev/webhooks/verify)
- [Public key](https://monobank.ua/api-docs/acquiring/dev/webhooks/get--api--merchant--pubkey)
- [Official complete acquiring specification](https://api.monobank.ua/docs/acquiring.html)

Verified: integer kopecks, UAH ISO 980, debit, merchant reference and customer email,
hosted pageUrl, raw-body ECDSA/SHA-256 and base64 signature/public key. Keys may be
cached and refreshed when verification fails. Events can arrive out of order;
larger modifiedDate wins. Expiration has no webhook; explicit validity is needed
alongside authenticated status reconciliation. The implementation uses one hour.

| Provider evidence | Internal payment |
| --- | --- |
| created / processing | PENDING |
| hold | PENDING with unexpected-hold review; new invoices use debit |
| validated success | PAID |
| failure | FAILED |
| failure with documented customer-cancel error 8002 | CANCELLED |
| expired | CANCELLED; localized result can distinguish expiration |
| completed reversed payment | REFUNDED |
| unknown/partial/inconsistent evidence | UNKNOWN or retained prior financial fact with review metadata |

There is no documented generic cancelled/refunded invoice enum string. A pending
cancel request is not a completed refund. No financial state changes any Product.

## Nova Poshta / NovaPay documentation boundary

[NP COD service](https://novaposhta.ua/financial-services/money-transfer/to-sender/)
and [NovaPay COD](https://novapay.ua/pisljaplata/) describe carrier collection and
contractual settlement. These do not establish a need for separate internet acquiring.

The [official developer portal](https://developers.novaposhta.ua/documentation)
returned HTTP 403 through browser retrieval and a direct public-document request.
Exact current backward-money/tracking schemas therefore remain unverified.
No third-party schema or WMS API was substituted, no new carrier fields/status codes
were added, and no contract credentials were requested. Existing API assumptions
must receive official contract verification before changing the carrier payload.

## Baseline checks

The original 69 NP cases and Batch 1.6 notification/status tests passed with mocked
effects before implementation. Updated final runs and their scope/limitations are
listed in the final report. No baseline test contacted a database, payment provider,
carrier, email or Telegram service.
