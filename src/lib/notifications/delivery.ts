export type DeliveryResult =
  | { sent: true; providerMessageId?: string }
  | { sent: false; reason: string; outcome?: "retry" | "permanent" | "unknown" };
