// Print-on-demand order acceptance is verified with actual source and isolated
// transaction fixtures by the Batch 1.7 suite. The old real-DB rollback runner
// depended on finished-unit stock and is retired. This entry point never loads
// .env, instantiates PrismaClient or connects to a database.
import "./verify-batch17-payments";
