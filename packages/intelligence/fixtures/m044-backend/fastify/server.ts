import Fastify from "fastify";

const app = Fastify();

app.get("/v1/status", async () => ({ ok: true }));

app.route({
  method: "POST",
  url: "/v1/items",
  handler: async () => ({ created: true }),
});

export default app;
