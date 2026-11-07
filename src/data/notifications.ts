import { requireOptionalNativeModule } from "expo-modules-core";
import { z } from "zod";
import type { Database } from "./database";
export const notificationModule = requireOptionalNativeModule<{
  openSettings: () => void;
  isEnabled: () => boolean;
  setPackages: (packages: string[]) => void;
  sources: () => { id: string; name: string }[];
  peek: () => string;
  acknowledge: (ids: string[]) => void;
}>("CaxeNotifications");
export const captureSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().max(8000),
  source: z.string().max(200),
  receivedAt: z.iso.datetime(),
});
export function drainNotifications(db: Database) {
  if (!notificationModule) return;
  const messages = z
    .array(captureSchema)
    .parse(JSON.parse(notificationModule.peek()));
  db.withTransactionSync(() => {
    for (const m of messages)
      db.runSync(
        "INSERT OR IGNORE INTO capture_inbox VALUES (?,?,?,?)",
        m.id,
        m.text,
        m.source,
        m.receivedAt,
      );
  });
  notificationModule.acknowledge(messages.map((m) => m.id));
}
