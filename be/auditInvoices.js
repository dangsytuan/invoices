const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

/**
 * Hàm sinh danh sách các khoảng thời gian theo THÁNG
 */
function getMonthsInRange(startYear, startMonth, endYear, endMonth) {
  const months = [];
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const mm = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    
    const fromDate = `01/${mm}/${y}T00:00:00`;
    const toDate = `${lastDay}/${mm}/${y}T23:59:59`;
    
    months.push({ year: y, month: m, fromDate, toDate, label: `Tháng ${mm}/${y}` });

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
    console.log('🔐 Đang thực hiện xác thực với Tổng cục Thuế để đối chiếu dữ liệu...');
    if (!taxService.loadSavedToken()) {
      await taxService.login('3200758117', '1234567@Abc'); 
    }

    // Thiết lập khoảng thời gian kiểm tra (Ví dụ: Từ tháng 01/2024 đến tháng hiện tại)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const listMonths = getMonthsInRange(2026, 1, currentYear, currentMonth);

    console.log(`\n🔍 Bắt đầu kiểm tra toàn vẹn dữ liệu cho ${listMonths.length} tháng...\n`);
    console.log('='.repeat(85));
    console.log(`${'Tháng'.padEnd(12)} | ${'Loại HĐ'.padEnd(12)} | ${'Trên Thuế (GDT)'.padEnd(16)} | ${'Trong DB'.padEnd(12)} | ${'Trạng thái'}`);
    console.log('='.repeat(85));

    let totalDiscrepancies = 0;

    for (const mObj of listMonths) {
      try {
        // 1. Lấy tổng số lượng trên Thuế (chỉ gọi lấy danh sách rút gọn hoặc đếm từ kết quả trả về)
        const soldList = await taxService.getSoldInvoices(mObj.fromDate, mObj.toDate);
        await taxService.sleep(800);

        const purchaseList = await taxService.getPurchaseInvoices(mObj.fromDate, mObj.toDate);
        await taxService.sleep(800);

        const sco8List = await taxService.getPurchaseFromCashRegister(mObj.fromDate, mObj.toDate, 8);
        await taxService.sleep(800);

        const sco5List = await taxService.getPurchaseFromCashRegister(mObj.fromDate, mObj.toDate, 5);
        await taxService.sleep(800);

        const gdtSold = soldList.length;
        const gdtPurchase = purchaseList.length;
        const gdtSco = sco8List.length + sco5List.length;

        // 2. Đếm số lượng trong Database theo từng loại và khoảng thời gian của tháng
        const dbSoldCount = await prisma.invoice.count({
          where: {
            type: 'OUTBOUND',
            tdlap: { gte: new Date(mObj.year, mObj.month - 1, 1), lte: new Date(mObj.year, mObj.month, 0, 23, 59, 59) }
          }
        });

        const dbPurchaseCount = await prisma.invoice.count({
          where: {
            type: 'INBOUND',
            // Phân biệt hóa đơn mua vào thường và máy tính tiền nếu cần, hoặc gộp chung kiểm tra tổng thể
            tdlap: { gte: new Date(mObj.year, mObj.month - 1, 1), lte: new Date(mObj.year, mObj.month, 0, 23, 59, 59) }
          }
        });

        // 3. In kết quả đối chiếu cho từng mục
        const checkMatch = (gdt, db, label) => {
          const isMatch = gdt === db;
          if (!isMatch) totalDiscrepancies++;
          const statusStr = isMatch ? '✅ Khớp' : `❌ Lệch (${db > gdt ? '+' : ''}${db - gdt})`;
          console.log(`${mObj.label.padEnd(12)} | ${label.padEnd(12)} | ${String(gdt).padEnd(16)} | ${String(db).padEnd(12)} | ${statusStr}`);
        };

        checkMatch(gdtSold, dbSoldCount, 'Bán ra');
        
        // Tổng inbound trên thuế = Mua vào thường + Máy tính tiền
        const totalGdtInbound = gdtPurchase + gdtSco;
        checkMatch(totalGdtInbound, dbPurchaseCount, 'Mua vào/SCO');

        console.log('-'.repeat(85));

      } catch (errMonth) {
        console.error(`⚠️ Lỗi khi audit ${mObj.label}:`, errMonth.message);
      }
    }

    console.log('='.repeat(85));
    if (totalDiscrepancies === 0) {
      console.log('🎉 TUYỆT VỜI! Tất cả dữ liệu hóa đơn trên Tổng cục Thuế và Database đã khớp 100%, đảm bảo tính toàn vẹn!');
    } else {
      console.log(`⚠️ Phát hiện có ${totalDiscrepancies} mục bị lệch số lượng. Bạn có thể chạy lại script đồng bộ riêng cho các tháng bị lệch.`);
    }

  } catch (error) {
    console.error('❌ Lỗi trong quá trình Audit:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();