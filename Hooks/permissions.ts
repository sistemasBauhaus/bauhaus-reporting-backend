import { Request, Response, NextFunction } from "express";

export function requirePermission(permiso: string) {
  return (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    if (!req.user?.permisos?.includes(permiso)) {
      return res.status(403).json({ ok: false, message: "No autorizado" });
    }
    next();
  };
}
