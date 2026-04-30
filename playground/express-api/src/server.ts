import express from "express";
import { logger } from "./logger.js";
import { requireAuth } from "./auth.js";
import { publicRoutes } from "./routes/public.js";
import { privateRoutes } from "./routes/private.js";

const app = express();

// BROKEN ORDER:
// 1. privateRoutes registered BEFORE requireAuth → private routes skip auth
// 2. express.json() after routes → POST handlers see undefined req.body
// 3. publicRoutes after requireAuth → public routes get gated
app.use(logger);
app.use("/api", privateRoutes);          // <-- before requireAuth
app.use(requireAuth);                    // <-- registered too late
app.use("/api/public", publicRoutes);    // <-- caught by requireAuth (also wrong)
app.use(express.json());                 // <-- after routes

export { app };
