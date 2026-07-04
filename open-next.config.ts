import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// LiftLog is fully static (all data lives client-side in IndexedDB), so no
// incremental cache is configured. If ISR/SSG revalidation is ever added,
// switch to the R2 incremental cache per
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
