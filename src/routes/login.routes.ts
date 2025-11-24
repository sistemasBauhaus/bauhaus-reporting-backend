import express from "express";
import { loginUser, registerUser, updateUser, getAllUsers, getAllEmpresas, getAllRoles } from "../controllers/auth.controller";


const router = express.Router();


router.get("/users", getAllUsers);
router.get("/empresas", getAllEmpresas);
router.get("/roles", getAllRoles);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.put("/users/:id", updateUser);

export default router;
