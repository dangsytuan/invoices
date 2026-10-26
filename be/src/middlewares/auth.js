const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function authenticateToken(req, res, next) {
  try {
    const token = req.cookies ? req.cookies['auth-token'] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Bạn chưa đăng nhập.'
      });
    }

    // 2. Giải mã JWT bằng Secret Key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Kiểm tra User trong Database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại trên hệ thống.'
      });
    }

    // 4. Kiểm tra tài khoản đã kích hoạt hay chưa
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.'
      });
    }

    // 5. Gán thông tin user tươi từ DB vào req.user
    req.user = user;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Xác thực không hợp lệ.'
    });
  }
}

module.exports = authenticateToken;