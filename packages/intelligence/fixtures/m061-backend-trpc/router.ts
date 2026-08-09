import { initTRPC } from "@trpc/server";

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;

export const appRouter = router({
  user: router({
    getById: publicProcedure.query(async () => ({ id: "1" })),
    create: publicProcedure.mutation(async () => ({ id: "2" })),
  }),
  health: publicProcedure.query(async () => ({ ok: true })),
});
