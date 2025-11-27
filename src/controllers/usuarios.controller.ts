import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db/connection";
/* ===========================================================
   AGREGAR PERMISO A UN USUARIO
   =========================================================== */
export const addPermisoToUser = async (req: Request, res: Response) => {
  try {
    const { user_id, permiso_id } = req.body;
    await pool.query(
      `INSERT INTO usuario_permiso (user_id, permiso_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user_id, permiso_id]
    );
    res.status(201).json({ ok: true, message: "Permiso asignado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al asignar permiso" });
  }
};
export const getAllEmpresas = async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      "SELECT empresa_id, nombre FROM empresas ORDER BY nombre"
    );
    console.log("getAllEmpresas ejecutado. Empresas:", r.rows);
    res.status(200).json({ ok: true, empresas: r.rows });
  } catch (err) {
    console.log("Error en getAllEmpresas:", err);
    res.status(500).json({ ok: false, message: "Error al obtener empresas" });
  }
};

/* ===========================================================
   OBTENER ROLES (para select de frontend)
   =========================================================== */
export const getAllRoles = async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      "SELECT rol_id, nombre FROM roles ORDER BY nombre"
    );
    console.log("getAllRoles ejecutado. Roles:", r.rows);
    res.status(200).json({ ok: true, roles: r.rows });
  } catch (err) {
    console.log("Error en getAllRoles:", err);
    res.status(500).json({ ok: false, message: "Error al obtener roles" });
  }
};

/* ===========================================================
   OBTENER TODOS LOS USUARIOS
   =========================================================== */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const sql = `
      SELECT u.user_id, u.email, u.nombre_usuario, u.dni, u.activo,
             e.nombre AS empresa, r.nombre AS rol,
             ue.empresa_id, ue.rol_id
      FROM usuarios u
      LEFT JOIN usuario_empresa ue ON ue.user_id = u.user_id
      LEFT JOIN empresas e ON e.empresa_id = ue.empresa_id
      LEFT JOIN roles r ON r.rol_id = ue.rol_id
      ORDER BY u.user_id
    `;
    const r = await pool.query(sql);
    console.log("getAllUsers ejecutado. Usuarios:", r.rows);
    res.status(200).json({ ok: true, usuarios: r.rows });
  } catch (err) {
    console.log("Error en getAllUsers:", err);
    res.status(500).json({ ok: false, message: "Error al obtener usuarios" });
  }
};

/* ===========================================================
   REGISTRAR USUARIO (crea usuario + empresa + rol + SP permisos)
   =========================================================== */
export const registerUser = async (req: Request, res: Response) => {
  console.log('[DEBUG] Body recibido en registerUser:', req.body);

  try {
    const { email, password, nombre_usuario, empresa_id, rol_id, permisos_ids } = req.body;

    if (!email || !password || !nombre_usuario)
      return res.status(400).json({ ok: false, message: "Faltan datos" });

    // 0️⃣ Validar si existe email
    const exists = await pool.query(
      "SELECT 1 FROM usuarios WHERE email = $1",
      [email]
    );

    if (exists.rowCount! > 0)
      return res.status(409).json({ ok: false, message: "Email ya registrado" });

    const password_hash = await bcrypt.hash(password, 10);

    // 1️⃣ Crear usuario
    const result = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre_usuario, rol_id, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING user_id`,
      [email, password_hash, nombre_usuario, rol_id]
    );

    const user_id = result.rows[0].user_id;

    // 2️⃣ Registrar empresa & rol del usuario
    await pool.query(
      `INSERT INTO usuario_empresa (user_id, empresa_id, rol_id)
       VALUES ($1, $2, $3)`,
      [user_id, empresa_id, rol_id]
    );

    // 3️⃣ Registrar permisos personalizados
    console.log('Permisos recibidos en registerUser:', permisos_ids);

    if (Array.isArray(permisos_ids) && permisos_ids.length > 0) {
      for (const permiso_id of permisos_ids) {
        console.log(
          `Insertando permiso ${permiso_id} para user_id ${user_id} en empresa_id ${empresa_id}`
        );

        await pool.query(
          `INSERT INTO usuario_permiso (user_id, empresa_id, permiso_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [user_id, empresa_id, permiso_id]
        );
      }
    } else {
      // Si no se enviaron permisos → asignar desde el rol automáticamente (SP)
      await pool.query(
        `CALL asignar_permisos_iniciales($1, $2)`,
        [user_id, empresa_id]
      );
    }

    res.status(201).json({ ok: true, message: "Usuario creado correctamente" });

  } catch (err) {
    console.error('[ERROR registerUser]', err);
    res.status(500).json({ ok: false, message: "Error al crear usuario" });
  }
};

/* ===========================================================
   ACTUALIZAR USUARIO (datos + cambiar rol + reset permisos)
   =========================================================== */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, nombre_usuario, dni, activo, rol_id, empresa_id, permisos_ids } = req.body;

    // 1️⃣ Actualizar datos del usuario
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

    // 2️⃣ Actualizar usuario_empresa
    if (empresa_id && rol_id) {
      const exists = await pool.query(
        `SELECT 1 FROM usuario_empresa WHERE user_id = $1 AND empresa_id = $2`,
        [id, empresa_id]
      );

      if (exists.rowCount! > 0) {
        await pool.query(
          `UPDATE usuario_empresa SET rol_id = $1 WHERE user_id = $2 AND empresa_id = $3`,
          [rol_id, id, empresa_id]
        );
      } else {
        await pool.query(
          `INSERT INTO usuario_empresa (user_id, empresa_id, rol_id)
           VALUES ($1, $2, $3)`,
          [id, empresa_id, rol_id]
        );
      }

      // 3️⃣ Reset permisos SOLO de esa empresa
      await pool.query(
        `DELETE FROM usuario_permiso WHERE user_id = $1 AND empresa_id = $2`,
        [id, empresa_id]
      );

      console.log('Permisos recibidos en updateUser:', permisos_ids);

      // 4️⃣ Insertar nuevos permisos
      if (Array.isArray(permisos_ids) && permisos_ids.length > 0) {

        for (const permiso_id of permisos_ids) {
          console.log(`Insertando permiso ${permiso_id} para user_id ${id}`);

          await pool.query(
            `INSERT INTO usuario_permiso (user_id, empresa_id, permiso_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [id, empresa_id, permiso_id]
          );
        }

      } else {
        // Si no se envían permisos → usar SP que asigna según rol
        await pool.query(
          `CALL asignar_permisos_iniciales($1, $2)`,
          [id, empresa_id]
        );
      }
    }

    res.status(200).json({ ok: true, message: "Usuario actualizado" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar usuario" });
  }
};

/* ===========================================================
   OBTENER PERMISOS DE UN USUARIO
   =========================================================== */
export const getUserPermisos = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const r = await pool.query(
      `SELECT p.id, p.nombre, p.descripcion
       FROM usuario_permiso up
       JOIN permisos p ON p.id = up.permiso_id
       WHERE up.user_id = $1`,
      [user_id]
    );
    const permisos_ids = r.rows.map((permiso: any) => permiso.id);
    res.status(200).json({ ok: true, permisos: r.rows, permisos_ids });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener permisos" });
  }
};

/* ===========================================================
   ELIMINAR PERMISO A UN USUARIO
   =========================================================== */
export const removePermisoFromUser = async (req: Request, res: Response) => {
  try {
    const { user_id, empresa_id, permiso_id } = req.body;

    await pool.query(
      `DELETE FROM usuario_permiso 
       WHERE user_id = $1 AND empresa_id = $2 AND permiso_id = $3`,
      [user_id, empresa_id, permiso_id]
    );

    res.status(200).json({ ok: true, message: "Permiso eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar permiso" });
  }
};

/* ===========================================================
   OBTENER TODOS LOS PERMISOS
   =========================================================== */
export const getAllPermisos = async (req: Request, res: Response) => {
  try {
    const r = await pool.query("SELECT id, nombre, descripcion FROM permisos ORDER BY id");
    res.status(200).json({ ok: true, permisos: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener permisos" });
  }
};
