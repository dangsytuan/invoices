const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

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
 * Hàm sinh danh sách các khoảng thời gian theo THÁNG từ mốc bắt đầu đến hiện tại
 */
function getMonthsInRange(startYear, startMonth, endYear, endMonth) {
  const months = [];
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const mm = String(m).padStart(2, '0');
    // Lấy ngày cuối cùng của tháng đó (tự động tính cả năm nhuận, tháng 28/29/30/31 ngày)
    const lastDay = new Date(y, m, 0).getDate();
    
    const fromDate = `01/${mm}/${y}T00:00:00`;
    const toDate = `${lastDay}/${mm}/${y}T23:59:59`;
    
    months.push({ fromDate, toDate, label: `Tháng ${mm}/${y}` });

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

async function main() {
  try {
   /* 
    const hasValidToken = taxService.loadSavedToken();
    if (!hasValidToken) {
      console.log('🔄 Token không tồn tại hoặc đã hết hạn. Bắt đầu luồng đăng nhập mới...');

      const username = '3200758117';
      const password = '1234567@Abc';
      const isLogin = await taxService.login(username, password);
      if(isLogin === false){
        console.log('login lỗi');
        return;
      }
    } else {
      console.log('⚡ Bỏ qua đăng nhập, tiếp tục sử dụng token hiện có.');
    }

    // 2. Xóa sạch DB trước khi chạy (giữ lại User)
    await clearDatabaseExceptUser();

    // 3. Thiết lập khoảng thời gian quét theo THÁNG (Ví dụ: Từ tháng 01/2024 đến tháng hiện tại)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Bạn có thể thay đổi năm/tháng bắt đầu tùy ý (Ví dụ: bắt đầu từ tháng 1 năm 2024)
    const listMonths = getMonthsInRange(2026, 1, currentYear, currentMonth);

    console.log(`📅 Bắt đầu quét dữ liệu theo THÁNG (Tổng số ${listMonths.length} tháng cần quét)...`);

    for (const monthObj of listMonths) {
      console.log(`\n=========================================`);
      console.log(`🔍 Đang xử lý dữ liệu cho: ${monthObj.label} (${monthObj.fromDate} -> ${monthObj.toDate})`);

      try {
        // Gọi các hàm lấy TOÀN BỘ hóa đơn trong tháng (Bên trong đã có sẵn vòng lặp phân trang state)
        const soldInvoices = await taxService.getSoldInvoices(monthObj.fromDate, monthObj.toDate);
        await taxService.sleep(1000); // Nghỉ nhẹ giữa các API call

        const purchaseInvoices = await taxService.getPurchaseInvoices(monthObj.fromDate, monthObj.toDate);
        await taxService.sleep(1000);

        const scoInvoices8 = await taxService.getPurchaseFromCashRegister(monthObj.fromDate, monthObj.toDate, 8);
        await taxService.sleep(1000);

        const scoInvoices5 = await taxService.getPurchaseFromCashRegister(monthObj.fromDate, monthObj.toDate, 5);

        const allInvoicesToProcess = [
          ...soldInvoices.map(inv => ({ ...inv, _invoiceType: 'OUTBOUND', _detailType: 'sold' })),
          ...purchaseInvoices.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'purchase' })),
          ...scoInvoices8.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
          ...scoInvoices5.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
        ];

        console.log(`📦 ${monthObj.label} tìm thấy tổng cộng ${allInvoicesToProcess.length} hóa đơn. Đang lưu vào DB...`);

        // Tiến hành lấy chi tiết và lưu vào DB từng hóa đơn
        for (const basicInv of allInvoicesToProcess) {
          try {
            const detailData = await taxService.getInvoiceDetail(
              basicInv.nbmst, 
              basicInv.khhdon, 
              basicInv.shdon, 
              basicInv.khmshdon, 
              basicInv._detailType
            );

            if (!detailData) continue;

            // Kiểm tra xem hóa đơn đã tồn tại chưa để tránh trùng lặp
            const existing = await prisma.invoice.findFirst({
              where: {
                nbmst: detailData.nbmst,
                khhdon: detailData.khhdon,
                shdon: Number(detailData.shdon),
                khmshdon: Number(detailData.khmshdon)
              }
            });

            let savedInvoice;
            const invoicePayload = {
              type: basicInv._invoiceType,
              isSco: basicInv._detailType === 'sco',
              nbmst: detailData.nbmst || '',
              nbten: detailData.nbten || '',
              nbdchi: detailData.nbdchi || '',
              nbsdthoai: detailData.nbsdthoai || '',
              nmmst: detailData.nmmst || '',
              nmten: detailData.nmten || '',
              nmdchi: detailData.nmdchi || '',
              nmsdthoai: detailData.nmsdthoai || '',
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
          } catch (errDetail) {
            console.error(`⚠️ Lỗi khi lưu chi tiết hóa đơn số ${basicInv.shdon}:`, errDetail.message);
          }
        }

        console.log(`✅ Hoàn tất lưu dữ liệu cho ${monthObj.label}. Nghỉ 2 giây trước khi sang tháng tiếp theo...`);
        await taxService.sleep(2000);

      } catch (errMonth) {
        console.error(`❌ Lỗi khi xử lý ${monthObj.label}:`, errMonth.message);
      }
    }
*/
   // 4. XÂY DỰNG BẢNG PRODUCT VÀ STOCKTRANSACTION SAU KHI ĐÃ HOÀN TẤT TOÀN BỘ INVOICE
    console.log('\n=========================================');
    console.log('🏭 Đang tổng hợp và xây dựng danh mục Product & StockTransaction...');
    
    console.log('🧹 Đang tiến hành dọn dẹp bảng StockTransaction và Product...');
    await prisma.$transaction([
      prisma.stockTransaction.deleteMany(), // Xóa giao dịch kho trước
      prisma.product.deleteMany(),         // Sau đó mới xóa sản phẩm
    ]);
    console.log('✅ Đã làm sạch Product và StockTransaction thành công!');
    
    // Lấy TOÀN BỘ chi tiết hóa đơn (cả INBOUND và OUTBOUND) để ghi nhận StockTransaction
    const allDetails = await prisma.invoiceDetail.findMany({
      include: { 
        invoice: true 
      }
    });

    for (const detail of allDetails) {
      const productName = detail.ten.trim();
      const unitVal = detail.dvtinh || 'Cái';
      const txType = detail.invoice.type; // 'INBOUND' hoặc 'OUTBOUND'

      // Tìm xem sản phẩm đã tồn tại trong DB chưa
      let product = await prisma.product.findFirst({
        where: { name: productName }
      });

      // Nếu sản phẩm chưa tồn tại:
      if (!product) {
        // CHỈ TẠO MỚI PRODUCT NẾU ĐÂY LÀ HÓA ĐƠN MUA VÀO (INBOUND)
        if (txType === 'INBOUND') {
          product = await prisma.product.create({
            data: {
              name: productName,
              unit: unitVal,
              stockBalance: 0,
              totalImported: 0,
              totalExported: 0
            }
          });
        } else {
          // Nếu là OUTBOUND mà sản phẩm chưa từng được nhập vào trước đó -> Bỏ qua không xử lý
          continue; 
        }
      }

      // Tạo lịch sử giao dịch kho (StockTransaction) cho cả INBOUND và OUTBOUND
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

      // Cập nhật số lượng tồn kho và tổng nhập/xuất của Product
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

    console.log('🎉 Hoàn thành toàn bộ quá trình quét theo tháng và đồng bộ kho hàng thành công!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình chạy chương trình chính:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();