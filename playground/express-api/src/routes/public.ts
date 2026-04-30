import { Router } from "express";

export const publicRoutes = Router();

publicRoutes.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

publicRoutes.get("/version", (_req, res) => {
  res.json({ version: "1.0.0" });
});
