import type { Request, Response, NextFunction } from "express";

export function logger(req: Request, _res: Response, next: NextFunction) {
  console.log(`[req] ${req.method} ${req.path}`);
  next();
}
