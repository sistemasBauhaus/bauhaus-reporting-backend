import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const authMiddleware = (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ ok: false, message: "Token requerido" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "bauhaus_secret");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: "Token inválido" });
  }
};
