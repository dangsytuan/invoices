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
    const { type, search, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Xây dựng điều kiện lọc (where) cho Prisma
    const where = {};

    // 1. Lọc theo loại hóa đơn (INBOUND / OUTBOUND) nếu có
    if (type && type !== 'ALL') {
      where.type = type;
    }

    // 2. Lọc theo khoảng thời gian (dựa trên trường ngày lập hóa đơn `tdlap`)
    if (startDate || endDate) {
      where.tdlap = {};
      if (startDate) {
        where.tdlap.gte = new Date(startDate); // Từ ngày (00:00:00)
      }
      if (endDate) {
        // Đặt giờ kết thúc là cuối ngày để lấy trọn vẹn ngày endDate
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.tdlap.lte = endDateTime;
      }
    }

    // 3. Lọc theo từ khóa tìm kiếm
    if (search && search.trim() !== '') {
      const keyword = search.trim();
      where.OR = [
        { nbten: { contains: keyword, mode: 'insensitive' } },
        { nbmst: { contains: keyword, mode: 'insensitive' } },
        { nmten: { contains: keyword, mode: 'insensitive' } },
        { nmmst: { contains: keyword, mode: 'insensitive' } },
        { khhdon: { contains: keyword, mode: 'insensitive' } },
      ];
      
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