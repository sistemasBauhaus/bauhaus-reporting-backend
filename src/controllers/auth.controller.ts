export const getAllEmpresas = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query("SELECT empresa_id, nombre FROM empresas ORDER BY nombre");
    res.status(200).json({ ok: true, empresas: result.rows });
  } catch (error) {
    console.error("❌ Error en getAllEmpresas:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error al obtener empresas" });
  }
};

export const getAllRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query("SELECT rol_id, nombre FROM roles ORDER BY nombre");
    res.status(200).json({ ok: true, roles: result.rows });
  } catch (error) {
    console.error("❌ Error en getAllRoles:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error al obtener roles" });
  }
};
import jwt from "jsonwebtoken";
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.email, u.nombre_usuario, u.dni, u.activo,
              e.nombre AS empresa, r.nombre AS rol
       FROM usuarios u
       LEFT JOIN usuario_empresa ue ON ue.user_id = u.user_id
       LEFT JOIN empresas e ON e.empresa_id = ue.empresa_id
       LEFT JOIN roles r ON r.rol_id = ue.rol_id
       ORDER BY u.user_id`
    );
    res.status(200).json({ ok: true, usuarios: result.rows });
  } catch (error) {
    console.error("❌ Error en getAllUsers:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error al obtener usuarios" });
  }
};
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, nombre_usuario, dni, activo, rol_id, empresa_id } = req.body;
    if (!id) {
      res.status(400).json({ ok: false, message: "Falta user_id" });
      return;
    }
    // Actualizar usuario
    await pool.query(
      `UPDATE usuarios SET
        email = COALESCE($1, email),
        nombre_usuario = COALESCE($2, nombre_usuario),
        dni = COALESCE($3, dni),
        activo = COALESCE($4, activo),
        rol_id = COALESCE($5, rol_id)
      WHERE user_id = $6`,
      [email, nombre_usuario, dni, activo, rol_id, id]
    );
    // Actualizar relación usuario_empresa si se pasa empresa_id o rol_id
    if (empresa_id || rol_id) {
      // Si ya existe, actualiza; si no, inserta
      const rel = await pool.query(
        `SELECT 1 FROM usuario_empresa WHERE user_id = $1 AND empresa_id = $2`,
        [id, empresa_id]
      );
      if ((rel.rowCount ?? 0) > 0) {
        await pool.query(
          `UPDATE usuario_empresa SET rol_id = COALESCE($1, rol_id) WHERE user_id = $2 AND empresa_id = $3`,
          [rol_id, id, empresa_id]
        );
      } else if (empresa_id && rol_id) {
        await pool.query(
          `INSERT INTO usuario_empresa (user_id, empresa_id, rol_id) VALUES ($1, $2, $3)`,
          [id, empresa_id, rol_id]
        );
      }
    }
    res.status(200).json({ ok: true, message: "Usuario actualizado" });
  } catch (error) {
    console.error("❌ Error en updateUser:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error al actualizar usuario" });
  }
};
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
  const { email, password, nombre_usuario, empresa_id, rol_id } = req.body;
    console.log("➡️ Registrando usuario:", req.body);
    if (!email || !password || !nombre_usuario) {
      res.status(400).json({ ok: false, message: "Faltan datos" });
      return;
    }
    // Verifica si ya existe el usuario
    const exists = await pool.query("SELECT 1 FROM usuarios WHERE email = $1", [email]);
    if ((exists.rowCount ?? 0) > 0) {
      res.status(409).json({ ok: false, message: "El email ya está registrado" });
      return;
    }
    const password_hash = await bcrypt.hash(password, 10);
    const userInsert = await pool.query(
      "INSERT INTO usuarios (email, password_hash, nombre_usuario, activo) VALUES ($1, $2, $3, true) RETURNING user_id",
      [email, password_hash, nombre_usuario]
    );
    const user_id = userInsert.rows[0]?.user_id;
    if (user_id && empresa_id && rol_id) {
      await pool.query(
        "INSERT INTO usuario_empresa (user_id, empresa_id, rol_id) VALUES ($1, $2, $3)",
        [user_id, empresa_id, rol_id]
      );
    }
    res.status(201).json({ ok: true, message: "Usuario registrado" });
  } catch (error) {
    console.error("❌ Error en registerUser:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error al registrar usuario" });
  }
};
import { Request, Response } from "express";
import { pool } from "../db/connection";
import bcrypt from "bcrypt";

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ ok: false, message: "Faltan email o password" });
      return;
    }

    // Buscar usuario activo
    const userQuery = `
      SELECT user_id, email, password_hash, nombre_usuario, activo
      FROM usuarios
      WHERE email = $1
    `;
    const userResult = await pool.query(userQuery, [email]);
    if (userResult.rowCount === 0) {
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    const user = userResult.rows[0];
    if (!user.activo) {
      res.status(403).json({ ok: false, message: "Usuario inactivo" });
      return;
    }

    // Validar password (usa bcrypt si los guardás encriptados)
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ ok: false, message: "Contraseña incorrecta" });
      return;
    }

    // Buscar empresa y rol asociado
    const empRolQuery = `
      SELECT e.empresa_id, e.nombre AS empresa, r.rol_id, r.nombre AS rol
      FROM usuario_empresa ue
      JOIN empresas e ON e.empresa_id = ue.empresa_id
      JOIN roles r ON r.rol_id = ue.rol_id
      WHERE ue.user_id = $1
      LIMIT 1
    `;
    const empRolResult = await pool.query(empRolQuery, [user.user_id]);
    const empRol = empRolResult.rows[0] || {};

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.user_id,
        email: user.email,
        nombre: user.nombre_usuario,
        empresa: empRol.empresa || null,
        rol: empRol.rol || null,
      },
      process.env.JWT_SECRET || "bauhaus_secret",
      { expiresIn: "12h" }
    );

    // Respuesta final
    res.status(200).json({
      ok: true,
      user: {
        id: user.user_id,
        nombre: user.nombre_usuario,
        email: user.email,
        empresa: empRol.empresa || null,
        rol: empRol.rol || null,
      },
      token
    });
  } catch (error) {
    console.error("❌ Error en loginUser:", (error as Error).message);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
};
