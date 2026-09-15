import express from "express";
import { fetchUser } from "../users/fetchUser.js";

export function usersHandler(app: express.Express): void {
  app.get("/users/:id", async (req, res) => {
    res.json(await fetchUser(String(req.params.id)));
  });
}
