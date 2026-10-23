const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @route   GET /api/products/list
 * @desc    Lấy danh sách sản phẩm kèm theo danh sách Alias (Tên thay thế)
 * @access  Public
 */
router.get('/list', async (req, res) => {
  try {
    const { search, page = 1, limit = 20, sortBy = 'name', order = 'asc' } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = search
      ? {
          name: {
            contains: search,
            mode: 'insensitive'
          }
        }
      : {};

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          aliases: true // <--- BỔ SUNG DÒNG NÀY ĐỂ KÉO THEO DANH SÁCH ALIAS
        },
        orderBy: {
          [sortBy]: order.toLowerCase() === 'desc' ? 'desc' : 'asc'
        }
      })
    ]);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   GET /api/products/:id
 * @desc    Lấy chi tiết 1 sản phẩm theo ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   POST /api/products
 * @desc    Thêm mới một sản phẩm
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const { name, unit, totalImported = 0, totalExported = 0 } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
    }

    const cleanName = name.trim();

    // Kiểm tra trùng tên (không phân biệt hoa/thường)
    const existing = await prisma.product.findFirst({
      where: {
        name: {
          equals: cleanName,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Sản phẩm này đã tồn tại trong hệ thống' });
    }

    const imported = parseFloat(totalImported) || 0;
    const exported = parseFloat(totalExported) || 0;

    const newProduct = await prisma.product.create({
      data: {
        name: cleanName,
        unit: unit ? unit.trim() : null,
        totalImported: imported,
        totalExported: exported,
        stockBalance: imported - exported
      }
    });

    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   PUT /api/products/:id
 * @desc    Cập nhật thông tin sản phẩm
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit, totalImported, totalExported } = req.body;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    // Nếu thay đổi tên, kiểm tra xem tên mới có trùng với sản phẩm khác không
    if (name && name.trim().toLowerCase() !== existingProduct.name.toLowerCase()) {
      const duplicate = await prisma.product.findFirst({
        where: {
          name: {
            equals: name.trim(),
            mode: 'insensitive'
          },
          NOT: { id }
        }
      });

      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Tên sản phẩm mới đã bị trùng với sản phẩm khác' });
      }
    }

    const imported = totalImported !== undefined ? parseFloat(totalImported) : existingProduct.totalImported;
    const exported = totalExported !== undefined ? parseFloat(totalExported) : existingProduct.totalExported;

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name: name ? name.trim() : existingProduct.name,
        unit: unit !== undefined ? (unit ? unit.trim() : null) : existingProduct.unit,
        totalImported: imported,
        totalExported: exported,
        stockBalance: imported - exported
      }
    });

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   DELETE /api/products/:id
 * @desc    Xóa sản phẩm
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    await prisma.product.delete({ where: { id } });

    res.json({ success: true, message: 'Đã xóa sản phẩm thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

module.exports = router;