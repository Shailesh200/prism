import express from "express";
import { requireAuth } from "./auth.js";

const app = express();

app.get("/api/ping", (_req, res) => {
  res.json({ pong: true });
});

app.post("/api/orders", requireAuth, (_req, res) => {
  res.status(201).json({ id: "1" });
});

export default app;
