// Isolated transactional model for payment regressions. No PrismaClient/DB access.
// Serial transactions model row-lock exclusion and rollback; this is not a substitute
// for a separately approved PostgreSQL integration test.
export type Row = Record<string, unknown>;
export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "AND") return (value as Row[]).every((part) => matches(row, part));
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
    const actual = row[key];
    if (value instanceof Date) return actual instanceof Date && actual.getTime() === value.getTime();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const filter = value as Row;
      if ("gte" in filter && (actual == null || !(Number(actual) >= Number(filter.gte)))) return false;
      if ("lte" in filter && (actual == null || !(Number(actual) <= Number(filter.lte)))) return false;
      if ("not" in filter && actual === filter.not) return false;
      if ("in" in filter && !(filter.in as unknown[]).includes(actual)) return false;
      return true;
    }
    return actual === value;
  });
}
function assign(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = structuredClone(value);
  }
}

export class PaymentMemory {
  orders: Row[] = [];
  products: Row[] = [];
  events: string[] = [];
  collisions = 0;
  lockReads = 0;
  productReads = 0;
  productWrites = 0;
  numberLocks = 0;
  private allocating = false;
  private queue: Promise<unknown> = Promise.resolve();
  order = {
    findUnique: async ({ where }: { where: Row }) => structuredClone(this.orders.find((row) => matches(row, where)) ?? null),
    findUniqueOrThrow: async ({ where }: { where: Row }) => {
      const found = this.orders.find((row) => matches(row, where)); if (!found) throw new Error("NOT_FOUND"); return structuredClone(found);
    },
    findMany: async ({ where, take }: { where: Row; take?: number }) => structuredClone(this.orders.filter((row) => matches(row, where)).sort((a, b) => Number(a.paymentNextCheckAt) - Number(b.paymentNextCheckAt)).slice(0, take)),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const found = this.orders.filter((row) => matches(row, where));
      for (const row of found) assign(row, data);
      return { count: found.length };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const before = this.orders.length; this.orders = this.orders.filter((row) => !matches(row, where));
      return { count: before - this.orders.length }; // Embedded items model FK cascade.
    },
    create: async ({ data }: { data: Row }) => {
      if (this.collisions-- > 0 || this.orders.some((row) => row.number === data.number)) throw { code: "P2002", meta: { target: ["number"] } };
      const items = (data.items as { create: Row[] }).create.map((item, index) => ({ id: `item-${index}`, ...item }));
      const row = {
        id: `order-${this.orders.length}`, createdAt: new Date(), paymentProvider: null, paymentMode: null, paymentStatus: null, paidAt: null,
        paymentInvoiceId: null, paymentProviderStatus: null, paymentModifiedAt: null, paymentExpiresAt: null, paymentNextCheckAt: null,
        paymentErrorCode: null, novaPoshtaTtn: null, novaPoshtaDeliveredAt: null, novaPoshtaCreatedAt: null, novaPoshtaSyncedAt: null,
        ...data, items,
      };
      this.orders.push(row); return structuredClone(row);
    },
  };
  product = {
    findMany: async ({ where }: { where: Row }) => {
      this.productReads++; return structuredClone(this.products.filter((row) => matches(row, where)));
    },
    updateMany: async () => { this.productWrites++; throw new Error("PRODUCT_WRITE_FORBIDDEN"); },
    update: async () => { this.productWrites++; throw new Error("PRODUCT_WRITE_FORBIDDEN"); },
  };
  $transaction = async <T>(callback: (tx: { order: PaymentMemory["order"]; product: PaymentMemory["product"]; $queryRaw: PaymentMemory["$queryRaw"] }) => Promise<T>): Promise<T> => {
    const run = this.queue.then(async () => {
      this.allocating = false;
      const beforeOrders = structuredClone(this.orders); const beforeProducts = structuredClone(this.products);
      try { return await callback({ order: this.order, product: this.product, $queryRaw: this.$queryRaw }); }
      catch (error) { this.orders = beforeOrders; this.products = beforeProducts; throw error; }
    });
    this.queue = run.catch(() => {}); return run;
  };
  $queryRaw = async (query: { sql: string; values: unknown[] }) => {
    if (query.sql.includes("pg_advisory_xact_lock(334354, 173)::text")) { this.allocating = true; this.numberLocks++; return [{ locked: "" }]; }
    if (query.sql.includes('MAX("number"::numeric)') && query.sql.includes("'^[0-9]+$'")) {
      if (!this.allocating) throw new Error("UNLOCKED_ORDER_NUMBER_READ");
      const maximum = this.orders.reduce((max, row) => typeof row.number === "string" && /^[0-9]+$/.test(row.number) && BigInt(row.number) > max ? BigInt(row.number) : max, BigInt(0));
      return [{ maximum: String(maximum) }];
    }
    if (!query.sql.includes('ORDER BY "id" FOR SHARE') || query.values.some((value) => typeof value !== "string")) throw new Error("INVALID_LOCK_READ");
    this.lockReads++;
    return this.products.filter((row) => query.values.includes(row.id)).map((row) => ({ id: row.id }));
  };
}
