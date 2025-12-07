import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/connection";

// ===============================
// LOGIN CON PERMISOS INCLUIDOS
// ===============================
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const startTotal = Date.now();
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ ok: false, message: "Faltan email o password" });
      return;
    }

    const startQuery = Date.now();
    // Consulta usuario, empresa, rol y permisos en una sola query
    const userFullQuery = `
      SELECT u.user_id, u.email, u.password_hash, u.nombre_usuario, u.activo,
             ue.empresa_id, e.nombre AS empresa, r.rol_id, r.nombre AS rol,
             array_agg(p.nombre) AS permisos
      FROM usuarios u
      LEFT JOIN usuario_empresa ue ON ue.user_id = u.user_id
      LEFT JOIN empresas e ON e.empresa_id = ue.empresa_id
      LEFT JOIN roles r ON r.rol_id = ue.rol_id
      LEFT JOIN usuario_permiso up ON up.user_id = u.user_id AND up.empresa_id = ue.empresa_id
      LEFT JOIN permisos p ON p.id = up.permiso_id
      WHERE u.email = $1
      GROUP BY u.user_id, u.email, u.password_hash, u.nombre_usuario, u.activo, ue.empresa_id, e.nombre, r.rol_id, r.nombre
      LIMIT 1
    `;
    const result = await pool.query(userFullQuery, [email]);
    const endQuery = Date.now();
    console.log(`[LOGIN][${email}] Tiempo consulta SQL: ${endQuery - startQuery} ms`);
    if (result.rowCount === 0) {
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }
    const user = result.rows[0];
    if (!user.activo) {
      res.status(403).json({ ok: false, message: "Usuario inactivo" });
      return;
    }

    const startBcrypt = Date.now();
    // Validar password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    const endBcrypt = Date.now();
    console.log(`[LOGIN][${email}] Tiempo bcrypt: ${endBcrypt - startBcrypt} ms`);
    if (!validPassword) {
      res.status(401).json({ ok: false, message: "Contraseña incorrecta" });
      return;
    }

    const startJWT = Date.now();
    // Generar JWT y responder
    const token = jwt.sign(
      {
        id: user.user_id,
        email: user.email,
        nombre: user.nombre_usuario,
        empresa: user.empresa || null,
        empresaId: user.empresa_id || null,
        rol: user.rol || null,
        permisos: user.permisos ? user.permisos.filter(Boolean) : [],
      },
      process.env.JWT_SECRET || "bauhaus_secret",
      { expiresIn: "12h" }
    );
    const endJWT = Date.now();
    console.log(`[LOGIN][${email}] Tiempo generación JWT: ${endJWT - startJWT} ms`);

    res.status(200).json({
      ok: true,
      user: {
        id: user.user_id,
        email: user.email,
        nombre: user.nombre_usuario,
        empresa: user.empresa || null,
        empresaId: user.empresa_id || null,
        rol: user.rol || null,
        permisos: user.permisos ? user.permisos.filter(Boolean) : [],
      },
      token,
    });
    const endTotal = Date.now();
    console.log(`[LOGIN][${email}] Tiempo total login: ${endTotal - startTotal} ms`);
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
};
