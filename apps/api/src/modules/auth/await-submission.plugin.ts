import type { BetterAuthPlugin } from "better-auth";
// Better Auth 1.7.7's default task helper swallows delivery exceptions. The plugin
// init extension keeps submission synchronous and lets endpoint errors propagate.
// Recheck this version-specific behavior when upgrading Better Auth.
export const awaitSubmission = {
  id: "await-email-submission",
  init: () => ({
    context: {
      async runInBackgroundOrAwait(promise: Promise<unknown> | void) {
        await promise;
      },
    },
  }),
} satisfies BetterAuthPlugin;
