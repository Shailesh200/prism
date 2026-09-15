import express from "express";

export function healthHandler(app: express.Express): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
}
