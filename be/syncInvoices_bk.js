const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hàm xóa sạch DB nhưng giữ lại bảng User
 */
async function clearDatabaseExceptUser() {
  console.log('🧹 Đang tiến hành dọn dẹp Database (Giữ lại bảng User)...');
  try {
    await prisma.$transaction([
      prisma.stockTransaction.deleteMany(),
      prisma.invoiceDetail.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.productAlias.deleteMany(),
      prisma.productComponent.deleteMany(),
      prisma.product.deleteMany(),
      prisma.category.deleteMany(),
    ]);
    console.log('✅ Đã làm sạch Database thành công!');
  } catch (error) {
    console.error('❌ Lỗi khi xóa dữ liệu cũ:', error);
    throw error;
  }
}

/**
 * Hàm hỗ trợ sinh danh sách các mốc ngày (YYYY-MM-DD) từ ngày bắt đầu đến ngày kết thúc
 */
function getDatesInRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const targetDate = new Date(endDate);

  while (currentDate <= targetDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    dates.push(`${day}/${month}/${year}`);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

async function main() {
  try {
    // 1. Đăng nhập hệ thống thuế
    console.log('🔐 Đang thực hiện xác thực với Tổng cục Thuế...');
    if (!taxService.loadSavedToken()) {
      // Thay thông tin đăng nhập của bạn vào đây
      await taxService.login('3200758117', '1234567@Abc'); 
    }

    // 2. Xóa sạch DB trước khi chạy (giữ lại User)
    await clearDatabaseExceptUser();

    // 3. Thiết lập khoảng thời gian cần quét (Ví dụ: Từ 01/10/2026 đến hết ngày hôm nay)
    // Bạn có thể thay đổi linh hoạt theo nhu cầu
    const fromDateStr = '01/01/2026';
    const now = new Date();
    const toDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    console.log(`📅 Bắt đầu quét dữ liệu từng ngày từ ${fromDateStr} đến ${toDateStr}...`);
    
    // Tạo danh sách các ngày để quét tuần tự
    // Lưu ý hàm getDatesInRange nhận dạng chuẩn YYYY-MM-DD để tính toán vòng lặp
    const listDays = getDatesInRange('2026-01-01', new Date());

    for (const dayStr0 of listDays) {
      // Định dạng chuỗi ngày cho API: DD/MM/YYYY
      const [d, m, y] = dayStr0.split('/');
      const dayFormatted = `${d}/${m}/${y}`;
      const dayStartQuery = `${dayFormatted}T00:00:00`;
      const dayEndQuery = `${dayFormatted}T23:59:59`;

      console.log(`\n-----------------------------------------`);
      console.log(`🔍 Đang quét dữ liệu cho ngày: ${dayFormatted}`);

      try {
        // Lấy 3 loại hóa đơn trong đúng ngày hôm đó:
        // 1. Hóa đơn bán ra
        const soldInvoices = await taxService.getSoldInvoices(dayStartQuery, dayEndQuery);
        await sleep(1000);
        // 2. Hóa đơn mua vào thông thường (ttxly == 5)
        const purchaseInvoices = await taxService.getPurchaseInvoices(dayStartQuery, dayEndQuery);
        await sleep(1000);
        // 3. Hóa đơn máy tính tiền mua vào (Cục thuế đã nhận mã khởi tạo ttxly == 8 và đã cấp mã ttxly == 5)
        const scoInvoices8 = await taxService.getPurchaseFromCashRegister(dayStartQuery, dayEndQuery, 8);
        await sleep(1000);
        const scoInvoices5 = await taxService.getPurchaseFromCashRegister(dayStartQuery, dayEndQuery, 5);
        await sleep(1000);

        const allInvoicesToProcess = [
          ...soldInvoices.map(inv => ({ ...inv, _invoiceType: 'OUTBOUND', _detailType: 'sold' })),
          ...purchaseInvoices.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'purchase' })),
          ...scoInvoices8.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
          ...scoInvoices5.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
        ];

        console.log(`📦 Ngày ${dayFormatted} tìm thấy tổng cộng ${allInvoicesToProcess.length} hóa đơn.`);

        // Tiến hành lấy chi tiết và lưu vào DB từng hóa đơn
        for (const basicInv of allInvoicesToProcess) {
          try {
            // Lấy chi tiết đầy đủ hàng hóa bên trong hóa đơn
            const detailData = await taxService.getInvoiceDetail(
              basicInv.nbmst, 
              basicInv.khhdon, 
              basicInv.shdon, 
              basicInv.khmshdon, 
              basicInv._detailType
            );

            if (!detailData) continue;

            // Lưu vào bảng Invoice & InvoiceDetail bằng Prisma upsert để tránh trùng lặp
            await prisma.invoice.upsert({
              where: { 
                // Dùng khóa định danh duy nhất (hoặc kết hợp shdon + khhdon + nbmst)
                // Lưu ý: Nếu model Invoice chưa có unique constraint tổ hợp, ta dùng id nếu chắc chắn mới, 
                // hoặc dùng create/find như bên dưới:
              },
              create: {} // Xử lý tạo mới bên dưới
            }).catch(async () => {
              // Cách an toàn: Tìm xem đã có chưa, chưa có thì tạo mới
              const existing = await prisma.invoice.findFirst({
                where: {
                  nbmst: detailData.nbmst,
                  khhdon: detailData.khhdon,
                  shdon: detailData.shdon,
                  khmshdon: detailData.khmshdon
                }
              });

              let savedInvoice;
              const invoicePayload = {
                type: basicInv._invoiceType,
                nbmst: detailData.nbmst || '',
                nbten: detailData.nbten || '',
                nmmst: detailData.nmmst || '',
                nmten: detailData.nmten || '',
                khmshdon: Number(detailData.khmshdon) || 1,
                khhdon: detailData.khhdon || '',
                shdon: Number(detailData.shdon) || 0,
                hdon: detailData.hdon || '01',
                thdon: detailData.thdon || 'Hóa đơn giá trị gia tăng',
                tthai: Number(detailData.tthai) || 1,
                cqt: detailData.cqt,
                hsgcma: detailData.hsgcma,
                mhdon: detailData.mhdon,
                ncma: detailData.ncma ? new Date(detailData.ncma) : null,
                nky: detailData.nky ? new Date(detailData.nky) : null,
                tdlap: detailData.tdlap ? new Date(detailData.tdlap) : new Date(),
                dvtte: detailData.dvtte || 'VND',
                tgtcthue: Number(detailData.tgtcthue) || 0,
                tgtthue: Number(detailData.tgtthue) || 0,
                tgtttbso: Number(detailData.tgtttbso) || 0,
                tgtttbchu: detailData.tgtttbchu,
                thtttoan: detailData.thtttoan
              };

              if (existing) {
                savedInvoice = await prisma.invoice.update({
                  where: { id: existing.id },
                  data: invoicePayload
                });
                // Xóa chi tiết cũ để nạp lại chi tiết mới cho chuẩn
                await prisma.invoiceDetail.deleteMany({ where: { invoiceId: existing.id } });
              } else {
                savedInvoice = await prisma.invoice.create({
                  data: invoicePayload
                });
              }

              // Lưu danh sách sản phẩm chi tiết (InvoiceDetail)
              if (detailData.hdhhdvu && Array.isArray(detailData.hdhhdvu)) {
                for (const item of detailData.hdhhdvu) {
                  await prisma.invoiceDetail.create({
                    data: {
                      invoiceId: savedInvoice.id,
                      stt: Number(item.stt) || 1,
                      ten: item.ten || 'Hàng hóa không tên',
                      dvtinh: item.dvtinh,
                      sluong: Number(item.sluong) || 0,
                      dgia: Number(item.dgia) || 0,
                      thtien: Number(item.thtien) || 0,
                      tsuat: Number(item.tsuat) || 0,
                      ltsuat: item.ltsuat || String(item.tsuat),
                      stckhau: Number(item.stckhau) || 0
                    }
                  });
                }
              }
            });

          } catch (errDetail) {
            console.error(`⚠️ Không thể lấy chi tiết hóa đơn số ${basicInv.shdon}:`, errDetail.message);
          }
        }

      } catch (errDay) {
        console.error(`❌ Lỗi khi quét ngày ${dayFormatted}:`, errDay.message);
      }
    }

    // 4. XÂY DỰNG BẢNG PRODUCT VÀ STOCKTRANSACTION SAU KHI ĐÃ HOÀN TẤT TOÀN BỘ INVOICE
    console.log('\n-----------------------------------------');
    console.log('🏭 Đang tiến hành tổng hợp và xây dựng danh mục Product & StockTransaction...');
    
    const allDetails = await prisma.invoiceDetail.findMany({
      include: { invoice: true }
    });

    for (const detail of allDetails) {
      const productName = detail.ten.trim();
      const unitVal = detail.dvtinh || 'Cái';

      // Kiểm tra xem sản phẩm chuẩn (Product) đã tồn tại theo tên chưa
      let product = await prisma.product.findFirst({
        where: { name: productName }
      });

      if (!product) {
        // Nếu chưa có, tạo mới sản phẩm chuẩn
        product = await prisma.product.create({
          data: {
            name: productName,
            unit: unitVal,
            stockBalance: 0,
            totalImported: 0,
            totalExported: 0
          }
        });
      }

      // Tạo lịch sử giao dịch kho (StockTransaction)
      const txType = detail.invoice.type; // INBOUND hoặc OUTBOUND
      await prisma.stockTransaction.create({
        data: {
          invoiceId: detail.invoiceId,
          productId: product.id,
          type: txType,
          productName: detail.ten,
          unit: detail.dvtinh,
          quantity: detail.sluong,
          unitPrice: detail.dgia,
          totalAmount: detail.thtien,
          transactionDate: detail.invoice.tdlap
        }
      });

      // Cập nhật số lượng tồn kho (stockBalance, totalImported/totalExported)
      const qty = detail.sluong;
      if (txType === 'INBOUND') {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            totalImported: { increment: qty },
            stockBalance: { increment: qty }
          }
        });
      } else {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            totalExported: { increment: qty },
            stockBalance: { decrement: qty }
          }
        });
      }
    }

    console.log('🎉 Hoàn thành toàn bộ quá trình quét hóa đơn và đồng bộ kho hàng thành công!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình chạy chương trình chính:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();