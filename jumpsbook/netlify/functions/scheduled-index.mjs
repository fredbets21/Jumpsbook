// Runs at 07:00 and 17:00 UTC to pick up new declarations and entries for the search index.
import { refreshIndex } from "../lib/store.mjs";

export default async () => {
  const r = await refreshIndex();
  console.log(`Index refresh: ${r.added} horses from ${r.pages} pages`);
};

export const config = { schedule: "0 7,17 * * *" };
