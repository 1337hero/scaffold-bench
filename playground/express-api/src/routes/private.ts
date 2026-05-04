import { Router } from "express";

export const privateRoutes = Router();

privateRoutes.get("/me", (_req, res) => {
  res.json({ user: "authenticated-user" });
});

privateRoutes.get("/admin", (_req, res) => {
  res.json({ admin: true });
});
