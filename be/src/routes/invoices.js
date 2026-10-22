const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route   GET /api/invoices
 * @desc    Lấy danh sách hóa đơn (có hỗ trợ lọc theo type, phân trang)
 * @query   type (INBOUND | OUTBOUND), page (mặc định 1), limit (mặc định 10)
 */
router.get('/', async (req, res) => {
  try {
    // 1. Lấy đầy đủ các query params từ request gửi lên
    const { type, search, status, page = 1, limit = 50 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Xây dựng điều kiện lọc (where) cho Prisma
    const where = {};

    // 2. Lọc theo loại hóa đơn (INBOUND / OUTBOUND) nếu có
    if (type && type !== 'ALL') {
      where.type = type;
    }

    // 3. Lọc theo trạng thái hóa đơn (tthai) nếu có và khác 'ALL'
    if (status && status !== 'ALL') {
      // Ép kiểu sang Number vì tthai trong DB thường là kiểu Int
      where.tthai = Number(status);
    }

    // 4. Lọc theo từ khóa tìm kiếm (tìm trong Tên người bán, MST người bán, Tên người mua, MST người mua, Số hóa đơn)
    if (search && search.trim() !== '') {
      const keyword = search.trim();
      where.OR = [
        { nbten: { contains: keyword, mode: 'insensitive' } },
        { nbmst: { contains: keyword, mode: 'insensitive' } },
        { nmten: { contains: keyword, mode: 'insensitive' } },
        { nmmst: { contains: keyword, mode: 'insensitive' } },
        { khhdon: { contains: keyword, mode: 'insensitive' } },
      ];
      
      // Nếu số hóa đơn là dạng số (Int trong Prisma), ta kiểm tra thêm nếu keyword là số
      const numKeyword = Number(keyword);
      if (!isNaN(numKeyword)) {
        where.OR.push({ shdon: numKeyword });
      }
    }

    // Truy vấn Database đồng thời đếm tổng và lấy dữ liệu phân trang
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { details: true },
        orderBy: { tdlap: 'desc' },
        skip,
        take,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

/**
 * @route   GET /api/invoices/:id
 * @desc    Lấy chi tiết một hóa đơn theo ID kèm theo danh sách sản phẩm chi tiết
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
        stockTransactions: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }

    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

/**
 * @route   DELETE /api/invoices/:id
 * @desc    Xóa một hóa đơn (các bảng liên quan như InvoiceDetail sẽ tự động xóa nhờ onDelete: Cascade)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!existingInvoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn để xóa' });
    }

    await prisma.invoice.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Đã xóa hóa đơn thành công',
    });
  } catch (error) {
    console.error('Lỗi khi xóa hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

module.exports = router;