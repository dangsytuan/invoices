const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @route   GET /api/product-aliases
 * @desc    Lấy danh sách tên thay thế (Alias), có thể lọc theo productId
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { productId } = req.query;

    const where = productId ? { productId } : {};

    const aliases = await prisma.productAlias.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            unit: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: aliases
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   POST /api/product-aliases
 * @desc    Thêm mới một tên thay thế (Alias) cho sản phẩm chuẩn
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const { productId, name } = req.body;

    if (!productId || !name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin productId hoặc tên alias' 
      });
    }

    const cleanName = name.trim();

    // 1. Kiểm tra xem sản phẩm chuẩn (productId) có tồn tại không
    const productExists = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!productExists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy sản phẩm chuẩn tương ứng' 
      });
    }

    // 2. Kiểm tra xem tên alias này đã được map cho bất kỳ sản phẩm nào chưa
    const existingAlias = await prisma.productAlias.findFirst({
      where: {
        name: {
          equals: cleanName,
          mode: 'insensitive'
        }
      }
    });

    if (existingAlias) {
      return res.status(400).json({ 
        success: false, 
        message: `Tên thay thế "${cleanName}" đã được ánh xạ trong hệ thống!` 
      });
    }

    // 3. Tạo mới alias
    const newAlias = await prisma.productAlias.create({
      data: {
        productId,
        name: cleanName
      }
    });

    res.status(201).json({ 
      success: true, 
      data: newAlias,
      message: 'Thêm tên thay thế thành công' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   DELETE /api/product-aliases/:id
 * @desc    Xóa một tên thay thế (Alias) theo ID
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingAlias = await prisma.productAlias.findUnique({
      where: { id }
    });

    if (!existingAlias) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy tên thay thế cần xóa' 
      });
    }

    await prisma.productAlias.delete({
      where: { id }
    });

    res.json({ 
      success: true, 
      message: 'Đã xóa tên thay thế thành công' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

module.exports = router;