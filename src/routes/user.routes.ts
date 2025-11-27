import express from "express";
import {
  getAllEmpresas,
  getAllRoles,
  getAllUsers,
  registerUser,
  updateUser,
  getUserPermisos,
  addPermisoToUser,
  removePermisoFromUser,
  getAllPermisos
} from "../controllers/usuarios.controller";

const router = express.Router();

router.get("/empresas", getAllEmpresas);
router.get("/roles", getAllRoles);
router.get("/users", getAllUsers);

router.post("/create", registerUser);
router.put("/update/:id", updateUser);

router.get("/permisos/:user_id", getUserPermisos);
router.post("/permisos/add", addPermisoToUser);
router.post("/permisos/remove", removePermisoFromUser);
router.get("/permisos", getAllPermisos);

export default router;
