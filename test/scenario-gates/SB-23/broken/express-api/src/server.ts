import express from "express";
import { logger } from "./logger.js";
import { requireAuth } from "./auth.js";
import { publicRoutes } from "./routes/public.js";
import { privateRoutes } from "./routes/private.js";

const app = express();

app.use(logger);
app.use("/api", privateRoutes);
app.use(requireAuth);
app.use("/api/public", publicRoutes);
app.use(express.json());

export { app };
