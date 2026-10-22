const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @route   GET /api/stock-transactions
 * @desc    Lấy danh sách giao dịch kho (Hỗ trợ Lọc, Tìm kiếm, Phân trang, Sắp xếp)
 * @access  Public
 */
router.get('/list', async (req, res) => {
  try {
    const { 
      search,          // Tìm kiếm theo tên sản phẩm
      type,            // INBOUND hoặc OUTBOUND
      invoiceId,       // Lọc theo hóa đơn
      startDate,       // Ngày bắt đầu (YYYY-MM-DD)
      endDate,         // Ngày kết thúc (YYYY-MM-DD)
      page = 1,        // Trang hiện tại
      limit = 20,      // Số lượng mỗi trang
      sortBy = 'transactionDate', // Trường sắp xếp
      order = 'desc'   // asc hoặc desc
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Xây dựng điều kiện lọc (where clause)
    const where = {};

    // 1. Tìm kiếm theo tên sản phẩm (không phân biệt hoa/thường)
    if (search) {
      where.productName = {
        contains: search,
        mode: 'insensitive'
      };
    }

    // 2. Lọc theo loại giao dịch (INBOUND / OUTBOUND)
    if (type && ['INBOUND', 'OUTBOUND'].includes(type.toUpperCase())) {
      where.type = type.toUpperCase();
    }

    // 3. Lọc theo invoiceId cụ thể
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    // 4. Lọc theo khoảng thời gian giao dịch (transactionDate)
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) {
        where.transactionDate.gte = new Date(startDate);
      }
      if (endDate) {
        // Cộng thêm 1 ngày hoặc set cuối ngày để lấy trọn vẹn ngày kết thúc
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.transactionDate.lte = endDateTime;
      }
    }

    // Thực hiện truy vấn song song count và findMany
    const [total, transactions] = await Promise.all([
      prisma.stockTransaction.count({ where }),
      prisma.stockTransaction.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy]: order.toLowerCase() === 'asc' ? 'asc' : 'desc'
        },
        include: {
          invoice: {
            select: {
              shdon: true,
              khhdon: true,
              nbten: true,
              nmten: true,
              tdlap: true
            }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: transactions,
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
 * @route   GET /api/stock-transactions/:id
 * @desc    Lấy chi tiết 1 giao dịch kho theo ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.stockTransaction.findUnique({
      where: { id },
      include: {
        invoice: true
      }
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch kho' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ:', error: error.message });
  }
});

module.exports = router;