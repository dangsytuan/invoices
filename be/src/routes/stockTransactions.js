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
      search,          // Chuỗi tìm kiếm (ví dụ: "áo thun trắng")
      type,            // INBOUND hoặc OUTBOUND
      invoiceId,       // Lọc theo hóa đơn
      startDate,       // Ngày bắt đầu (YYYY-MM-DD)
      endDate,         // Ngày kết thúc (YYYY-MM-DD)
      page = 1,        // Trang hiện tại
      limit = 20,      // Số lượng mỗi trang
      sortBy = 'transactionDate', // Trường sắp xếp
      order = 'desc',   // asc hoặc desc
      unlinked
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Xây dựng điều kiện lọc (where clause)
    const where = {};

    // 1. Xử lý tìm kiếm thông minh: Hỗ trợ tìm trong productName, Product.name và ProductAlias.name
    if (search && search.trim() !== '') {
      const keywords = search.trim().split(/\s+/);

      // Mỗi từ khóa trong chuỗi tìm kiếm phải thỏa mãn ít nhất MỘT trong các điều kiện (OR):
      // - Hoặc nằm trong productName của giao dịch kho
      // - Hoặc nằm trong tên chuẩn của sản phẩm (product.name)
      // - Hoặc nằm trong danh sách tên thay thế (product.aliases.name)
      where.AND = keywords.map(keyword => ({
        OR: [
          {
            productName: {
              contains: keyword,
              mode: 'insensitive'
            }
          },
          {
            product: {
              name: {
                contains: keyword,
                mode: 'insensitive'
              }
            }
          },
          {
            product: {
              aliases: {
                some: {
                  name: {
                    contains: keyword,
                    mode: 'insensitive'
                  }
                }
              }
            }
          }
        ]
      }));
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
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.transactionDate.lte = endDateTime;
      }
    }

    if (unlinked === 'true' || unlinked === true) {
      where.productId = null;
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
          // Lấy kèm thông tin sản phẩm và danh sách alias để hiển thị nếu cần
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              aliases: {
                select: { name: true }
              }
            }
          },
          invoice: {
            select: {
              shdon: true,
              khhdon: true,
              nbten: true,
              nmten: true,
              tdlap: true,
              tthai: true
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
 * @route   GET /api/stock-transactions/stats
 * @desc    Thống kê tổng quan giao dịch kho (Tách biệt rõ ràng giá trị Nhập / Xuất)
 * @access  Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Xây dựng điều kiện lọc thời gian nếu có
    const where = {};
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) {
        where.transactionDate.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.transactionDate.lte = endDateTime;
      }
    }

    // Thực hiện các truy vấn thống kê song song
    const [
      totalTransactions,
      inboundStats,
      outboundStats,
      linkedCount,
      unlinkedCount,
      topProducts
    ] = await Promise.all([
      // 1. Tổng số lượng giao dịch chung
      prisma.stockTransaction.count({ where }),

      // 2. Thống kê riêng chiều Nhập (INBOUND)
      prisma.stockTransaction.aggregate({
        where: { ...where, type: 'INBOUND' },
        _count: { id: true },
        _sum: { totalAmount: true, quantity: true }
      }),

      // 3. Thống kê riêng chiều Xuất (OUTBOUND)
      prisma.stockTransaction.aggregate({
        where: { ...where, type: 'OUTBOUND' },
        _count: { id: true },
        _sum: { totalAmount: true, quantity: true }
      }),

      // 4. Số lượng giao dịch đã map productId
      prisma.stockTransaction.count({
        where: { ...where, productId: { not: null } }
      }),

      // 5. Số lượng giao dịch chưa map productId
      prisma.stockTransaction.count({
        where: { ...where, productId: null }
      }),

      // 6. Top 5 sản phẩm giao dịch nhiều nhất
      prisma.stockTransaction.groupBy({
        by: ['productId', 'productName'],
        where: { ...where, productId: { not: null } },
        _sum: {
          quantity: true,
          totalAmount: true
        },
        orderBy: {
          _sum: {
            totalAmount: 'desc'
          }
        },
        take: 5
      })
    ]);

    const totalCount = totalTransactions || 0;
    const inboundAmount = inboundStats._sum.totalAmount || 0;
    const outboundAmount = outboundStats._sum.totalAmount || 0;

    return res.json({
      success: true,
      data: {
        overview: {
          totalTransactions: totalCount,
          totalInboundAmount: inboundAmount,   // Tổng tiền Nhập riêng biệt
          totalOutboundAmount: outboundAmount, // Tổng tiền Xuất riêng biệt
        },
        mappingStatus: {
          linked: linkedCount,
          unlinked: unlinkedCount,
          linkedRate: totalCount > 0 
            ? Number(((linkedCount / totalCount) * 100).toFixed(2)) 
            : 0
        },
        byType: {
          inbound: {
            count: inboundStats._count.id || 0,
            quantity: inboundStats._sum.quantity || 0,
            totalAmount: inboundAmount,
          },
          outbound: {
            count: outboundStats._count.id || 0,
            quantity: outboundStats._sum.quantity || 0,
            totalAmount: outboundAmount,
          }
        },
        topProducts
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy thống kê giao dịch kho:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy dữ liệu thống kê.',
      error: error.message
    });
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

/**
 * @route   PUT /api/stock-transactions/link
 * @desc    Liên kết mã hàng trong StockTransaction với ProductId và tự động lưu ProductAlias
 * @access  Public
 */
router.post('/link', async (req, res) => {
  try {
    const { transactionId, productId } = req.body;

    // 1. Kiểm tra dữ liệu đầu vào
    if (!transactionId || !productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin transactionId hoặc productId!' 
      });
    }

    // 2. Thực hiện giao dịch (Transaction) để đảm bảo tính toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // Kiểm tra xem StockTransaction có tồn tại không
      const stockTransaction = await tx.stockTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!stockTransaction) {
        throw new Error('Không tìm thấy giao dịch kho với ID đã cho.');
      }

      // Kiểm tra xem Product có tồn tại không
      const product = await tx.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        throw new Error('Không tìm thấy sản phẩm chuẩn với ID đã cho.');
      }

      // Cập nhật productId cho StockTransaction
      const updatedTransaction = await tx.stockTransaction.update({
        where: { id: transactionId },
        data: { productId },
        include: {
          product: true,
          invoice: true
        }
      });

      // Tự động thêm tên hàng gốc (productName) vào bảng ProductAlias nếu chưa tồn tại
      // Dựa vào @@unique([productId, name]) trong schema
      await tx.productAlias.upsert({
        where: {
          productId_name: {
            productId,
            name: stockTransaction.productName
          }
        },
        update: {}, // Không cần cập nhật gì nếu đã tồn tại
        create: {
          productId,
          name: stockTransaction.productName
        }
      });

      return updatedTransaction;
    });

    return res.json({
      success: true,
      message: 'Liên kết sản phẩm và cập nhật alias thành công!',
      data: result
    });

  } catch (error) {
    console.error('Lỗi khi liên kết giao dịch kho:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Lỗi máy chủ khi thực hiện liên kết.' 
    });
  }
});

/**
 * @route   POST /api/stock-transactions/auto-match
 * @desc    Quét tự động và liên kết StockTransaction với Product dựa trên Product.name và ProductAlias
 * @access  Public
 */
router.post('/auto-match', async (req, res) => {
  try {
    // Lấy tất cả các giao dịch kho chưa được map sản phẩm (productId = null)
    const unlinkedTransactions = await prisma.stockTransaction.findMany({
      where: {
        productId: null
      }
    });

    if (unlinkedTransactions.length === 0) {
      return res.json({
        success: true,
        message: 'Không có giao dịch kho nào cần quét tự động.',
        matchedCount: 0
      });
    }

    let matchedCount = 0;
    const matchDetails = [];

    // Duyệt qua từng giao dịch chưa liên kết
    for (const tx of unlinkedTransactions) {
      const cleanProductName = tx.productName ? tx.productName.trim() : '';
      if (!cleanProductName) continue;

      let targetProductId = null;

      // Bước 1: Kiểm tra xem tên trên hóa đơn có trùng khớp chính xác với Product.name không
      // (Có thể dùng mode: 'insensitive' để không phân biệt hoa thường)
      const exactProduct = await prisma.product.findFirst({
        where: {
          name: {
            equals: cleanProductName,
            mode: 'insensitive'
          }
        }
      });

      if (exactProduct) {
        targetProductId = exactProduct.id;
      } else {
        // Bước 2: Nếu không khớp Product.name, kiểm tra trong bảng ProductAlias
        const aliasMatch = await prisma.productAlias.findFirst({
          where: {
            name: {
              equals: cleanProductName,
              mode: 'insensitive'
            }
          }
        });

        if (aliasMatch) {
          targetProductId = aliasMatch.productId;
        }
      }

      // Nếu tìm thấy sản phẩm phù hợp (qua Product hoặc ProductAlias), tiến hành cập nhật
      if (targetProductId) {
        await prisma.stockTransaction.update({
          where: { id: tx.id },
          data: { productId: targetProductId }
        });

        matchedCount++;
        matchDetails.push({
          transactionId: tx.id,
          productName: tx.productName,
          matchedProductId: targetProductId
        });
      }
    }

    return res.json({
      success: true,
      message: `Quét thành công! Đã liên kết được ${matchedCount} / ${unlinkedTransactions.length} giao dịch.`,
      matchedCount,
      data: matchDetails
    });

  } catch (error) {
    console.error('Lỗi khi tự động quét ánh xạ giao dịch kho:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi chạy quét tự động.',
      error: error.message
    });
  }
});



router.post('/unlink', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Thiếu transactionId!' });
    }

    // Kiểm tra xem giao dịch có tồn tại không
    const existingTx = await prisma.stockTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!existingTx) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch kho' });
    }

    // Tiến hành gỡ liên kết (set productId = null)
    const updatedTx = await prisma.stockTransaction.update({
      where: { id: transactionId },
      data: { productId: null }
    });

    return res.json({ success: true, data: updatedTx });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;