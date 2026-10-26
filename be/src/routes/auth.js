const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Cấu hình HttpOnly Cookie
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
};

// [POST] /api/auth/register - Đăng ký tài khoản mới
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ email và mật khẩu.'
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email này đã được sử dụng.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || '',
        role: 'USER',
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công.',
      data: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error('Register Error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống server.' });
  }
});

// [POST] /api/auth/login - Đăng nhập (Lưu JWT vào HttpOnly Cookie)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ email và mật khẩu.'
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị vô hiệu hóa.'
      });
    }

    const payload = { id: user.id, email: user.email, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('auth-token', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống server.' });
  }
});

// [POST] /api/auth/logout - Đăng xuất (Xóa HttpOnly Cookie)
router.post('/logout', (req, res) => {
  res.clearCookie('auth-token', getCookieOptions());
  return res.status(200).json({
    success: true,
    message: 'Đăng xuất thành công.'
  });
});

// [GET] /api/auth/me - Đọc thông tin cá nhân (Read)
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies['auth-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại hoặc đã bị khóa'
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('Lỗi JWT Verify tại /me:', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ'
    });
  }
});

module.exports = router;