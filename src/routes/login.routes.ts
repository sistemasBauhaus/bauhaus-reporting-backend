import express from 'express';
import { pool } from '../db/connection';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/login', (req, res) => {
  // Login ficticio: acepta cualquier email y password
  const { email } = req.body;
  const token = 'fake-token-for-deploy';

  res.json({
    message: 'Login exitoso (ficticio)',
    usuario: email || 'demo',
    rol: 1,
    token,
  });
});

export default router;