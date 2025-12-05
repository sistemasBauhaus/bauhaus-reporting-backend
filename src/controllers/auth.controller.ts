import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/connection";

// ===============================
// LOGIN CON PERMISOS INCLUIDOS
// ===============================
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const t0 = Date.now();
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ ok: false, message: "Faltan email o password" });
      return;
    }

    // 1. Buscar usuario
    const t1 = Date.now();
    const userQuery = `
      SELECT user_id, email, password_hash, nombre_usuario, activo
      FROM usuarios
      WHERE email = $1
    `;
    const userResult = await pool.query(userQuery, [email]);
    const t2 = Date.now();
    console.log(`[LOGIN] Consulta usuario: ${t2 - t1} ms`);

    if (userResult.rowCount === 0) {
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    const user = userResult.rows[0];

    if (!user.activo) {
      res.status(403).json({ ok: false, message: "Usuario inactivo" });
      return;
    }

    // 2. Validar password
    const t3 = Date.now();
    const validPassword = await bcrypt.compare(password, user.password_hash);
    const t4 = Date.now();
    console.log(`[LOGIN] Validación password: ${t4 - t3} ms`);
    if (!validPassword) {
      res.status(401).json({ ok: false, message: "Contraseña incorrecta" });
      return;
    }

    // 3. Obtener empresa + rol del usuario
    const t5 = Date.now();
    const empRolQuery = `
      SELECT ue.empresa_id, e.nombre AS empresa, r.rol_id, r.nombre AS rol
      FROM usuario_empresa ue
      JOIN empresas e ON e.empresa_id = ue.empresa_id
      JOIN roles r ON r.rol_id = ue.rol_id
      WHERE ue.user_id = $1
      LIMIT 1
    `;
    const empRolResult = await pool.query(empRolQuery, [user.user_id]);
    const t6 = Date.now();
    console.log(`[LOGIN] Consulta empresa/rol: ${t6 - t5} ms`);
    const empRol = empRolResult.rows[0] || null;

    const empresaId = empRol?.empresa_id || null;

    // 4. OBTENER LOS PERMISOS REALES DEL USUARIO
    let permisos: string[] = [];
    let t7 = Date.now();
    if (empresaId) {
      const permisosQuery = `
        SELECT p.nombre
        FROM usuario_permiso up
        JOIN permisos p ON p.id = up.permiso_id
        WHERE up.user_id = $1 AND up.empresa_id = $2
      `;

      const permisosResult = await pool.query(permisosQuery, [
        user.user_id,
        empresaId,
      ]);
      let t8 = Date.now();
      console.log(`[LOGIN] Consulta permisos: ${t8 - t7} ms`);

      permisos = permisosResult.rows.map((row) => row.nombre);
      console.log("Permisos del usuario logueado:", permisos);
    }

    // 5. GENERAR JWT CON PERMISOS
    const t9 = Date.now();
    const token = jwt.sign(
      {
        id: user.user_id,
        email: user.email,
        nombre: user.nombre_usuario,
        empresa: empRol?.empresa || null,
        empresaId,
        rol: empRol?.rol || null,
        permisos, // 🔥 agregado
      },
      process.env.JWT_SECRET || "bauhaus_secret",
      { expiresIn: "12h" }
    );
    const t10 = Date.now();
    console.log(`[LOGIN] Generación JWT: ${t10 - t9} ms`);

    // 6. RESPUESTA FINAL
    const t11 = Date.now();
    res.status(200).json({
      ok: true,
      user: {
        id: user.user_id,
        email: user.email,
        nombre: user.nombre_usuario,
        empresa: empRol?.empresa || null,
        empresaId,
        rol: empRol?.rol || null,
        permisos, // 🔥 agregado
      },
      token,
    });
    const t12 = Date.now();
    console.log(`[LOGIN] Respuesta final: ${t12 - t11} ms`);
    console.log(`[LOGIN] Tiempo total login: ${t12 - t0} ms`);
  } catch (error) {
    console.error("❌ Error en loginUser:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
};
