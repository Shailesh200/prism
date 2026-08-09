import express from "express";
import usersRouter from "./users.js";

const app = express();
app.use("/api", usersRouter);
app.get("/health", (_req, res) => res.json({ ok: true }));

export default app;
