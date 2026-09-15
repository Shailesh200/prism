import express from "express";
import { usersHandler } from "./routes/users/handler.js";
import { healthHandler } from "./routes/health/handler.js";

const app = express();
usersHandler(app);
healthHandler(app);
export default app;
