const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @route   GET /api/products/stats
 * @desc    Lấy tổng quan số liệu Nhập, Xuất, Tồn kho của toàn hệ thống
 * @access  Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};

    if (search && search.trim() !== '') {
      const keywords = search.trim().split(/\s+/);
      where.AND = keywords.map(keyword => ({
        name: {
          contains: keyword,
          mode: 'insensitive'
        }
      }));
    }

    const aggregateResult = await prisma.product.aggregate({
      where, // Thêm điều kiện where vào để thống kê theo từ khóa tìm kiếm
      _sum: {
        totalImported: true,
        totalExported: true,
        stockBalance: true,
      },
      _count: {
        id: true,
      }
    });

    res.json({
      success: true,
      data: {
        totalItems: aggregateResult._count.id || 0,
        totalImported: aggregateResult._sum.totalImported || 0,
        totalExported: aggregateResult._sum.totalExported || 0,
        totalStock: aggregateResult._sum.stockBalance || 0,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   GET /api/products/list
 * @desc    Lấy danh sách sản phẩm kèm theo Alias và danh sách linh kiện (nếu là Combo)
 * @access  Public
 */
router.get('/list', async (req, res) => {
  try {
    const { search, page = 1, limit = 20, sortBy = 'name', order = 'asc' } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (search && search.trim() !== '') {
      const keywords = search.trim().split(/\s+/);
      where.AND = keywords.map(keyword => ({
        name: {
          contains: keyword,
          mode: 'insensitive'
        }
      }));
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          aliases: true, // Kéo theo danh sách tên thay thế
          components: {  // Nếu là Combo, kéo theo các linh kiện cấu thành
            include: {
              component: true // Lấy chi tiết thông tin của sản phẩm linh kiện con
            }
          }
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
 * @desc    Lấy chi tiết 1 sản phẩm theo ID kèm linh kiện cấu thành
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        aliases: true,
        components: {
          include: {
            component: true
          }
        },
        usedInBundles: { // Xem sản phẩm này đang nằm trong các Combo/Bộ nào (tùy chọn)
          include: {
            bundle: true
          }
        }
      }
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
 * @desc    Thêm mới một sản phẩm (Hỗ trợ tạo Combo kèm danh sách linh kiện)
 * @access  Public
 * @body    { name, unit, sku, barcode, isBundle, components: [{ componentId, quantity }] }
 */
router.post('/', async (req, res) => {
  try {
    const { name, unit, sku, barcode, isBundle = false, components = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
    }

    const cleanName = name.trim();

    // Kiểm tra trùng tên
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

    // Sử dụng Transaction để đảm bảo tạo sản phẩm và cấu hình linh kiện (BOM) đồng bộ
    const newProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: cleanName,
          sku: sku ? sku.trim() : null,
          barcode: barcode ? barcode.trim() : null,
          unit: unit ? unit.trim() : null,
          isBundle: Boolean(isBundle),
          totalImported: 0,
          totalExported: 0,
          stockBalance: 0
        }
      });

      // Nếu là Combo và có truyền danh sách linh kiện con
      if (isBundle && Array.isArray(components) && components.length > 0) {
        const componentData = components.map(item => ({
          bundleId: product.id,
          componentId: item.componentId,
          quantity: parseFloat(item.quantity) || 1
        }));

        await tx.productComponent.createMany({
          data: componentData
        });
      }

      return product;
    });

    // Lấy lại thông tin đầy đủ kèm components trả về cho client
    const fullProduct = await prisma.product.findUnique({
      where: { id: newProduct.id },
      include: { components: { include: { component: true } }, aliases: true }
    });

    res.status(201).json({ success: true, data: fullProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   PUT /api/products/:id
 * @desc    Cập nhật thông tin sản phẩm và cấu hình lại linh kiện Combo (BOM)
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit, sku, barcode, isBundle, components } = req.body;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    // Kiểm tra trùng tên nếu đổi tên
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

    const updatedProduct = await prisma.$transaction(async (tx) => {
      // 1. Cập nhật thông tin cơ bản sản phẩm
      const product = await tx.product.update({
        where: { id },
        data: {
          name: name ? name.trim() : existingProduct.name,
          sku: sku !== undefined ? (sku ? sku.trim() : null) : existingProduct.sku,
          barcode: barcode !== undefined ? (barcode ? barcode.trim() : null) : existingProduct.barcode,
          unit: unit !== undefined ? (unit ? unit.trim() : null) : existingProduct.unit,
          isBundle: isBundle !== undefined ? Boolean(isBundle) : existingProduct.isBundle
        }
      });

      // 2. Nếu có truyền mảng components lên, tiến hành cập nhật lại danh sách linh kiện cấu thành (BOM)
      if (components !== undefined && Array.isArray(components)) {
        // Xóa toàn bộ liên kết linh kiện cũ của combo này
        await tx.productComponent.deleteMany({
          where: { bundleId: id }
        });

        // Thêm lại danh sách linh kiện mới
        if (components.length > 0) {
          const componentData = components.map(item => ({
            bundleId: id,
            componentId: item.componentId,
            quantity: parseFloat(item.quantity) || 1
          }));

          await tx.productComponent.createMany({
            data: componentData
          });
        }
      }

      return product;
    });

    // Lấy lại thông tin hoàn chỉnh sau update
    const fullProduct = await prisma.product.findUnique({
      where: { id },
      include: { components: { include: { component: true } }, aliases: true }
    });

    res.json({ success: true, data: fullProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

/**
 * @route   DELETE /api/products/:id
 * @desc    Xóa sản phẩm (Cascade sẽ tự động xóa các liên kết trong ProductComponent và ProductAlias)
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