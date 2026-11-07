import { z } from "zod";
import { remoteRecordSchema } from "../domain/model.ts";
import type { Repository } from "./repository.ts";

const responseSchema = z.object({
  records: z.array(remoteRecordSchema),
  acknowledged: z.array(z.string()),
  conflicts: z.array(remoteRecordSchema),
  next: z.string().nullable(),
});
export type Transport = (body: unknown) => Promise<unknown>;
export async function synchronize(repo: Repository, transport: Transport) {
  // One flight per repository; acknowledgements only clear the exact submitted op.
  if (flights.has(repo)) return flights.get(repo)!;
  const run = (async () => {
    const attempted = new Set<string>();
    let pulled = false;
    while (true) {
      const pending = repo
        .pending()
        .filter(
          (op) =>
            !attempted.has(op.opId) &&
            !repo
              .conflicts()
              .some(
                (c) => c.entity === op.entity && c.entityId === op.entityId,
              ),
        );
      if (!pending.length && pulled) break;
      const operations = pending.slice(0, 100);
      operations.forEach((op) => attempted.add(op.opId));
      pulled = true;
      const response = responseSchema.parse(
        await transport({ operations, cursor: null }),
      );
      repo.receive(
        [...response.records, ...response.conflicts],
        response.acknowledged,
        operations,
      );
      let cursor = response.next;
      while (cursor) {
        const page = responseSchema.parse(
          await transport({ operations: [], cursor }),
        );
        repo.receive(page.records, response.acknowledged, operations);
        cursor = page.next;
      }
    }
  })();
  flights.set(repo, run);
  try {
    await run;
  } finally {
    flights.delete(repo);
  }
}
const flights = new WeakMap<Repository, Promise<void>>();
