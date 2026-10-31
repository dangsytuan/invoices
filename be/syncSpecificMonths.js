const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

async function main() {
  try {
    // 1. Đăng nhập hệ thống thuế hoặc load token cũ
    console.log('🔐 Đang thực hiện xác thực với Tổng cục Thuế...');
    if (!taxService.loadSavedToken()) {
      await taxService.login('3200758117', '1234567@Abc'); 
    }

    // 🎯 Danh sách các tháng cụ thể cần chạy lại (Thêm các tháng khác vào mảng này nếu cần)
    const targetMonths = [
      { year: 2026, month: 6, label: 'Tháng 06/2026' },
      { year: 2026, month: 7, label: 'Tháng 07/2026' }
    ];

    console.log(`📅 Bắt đầu chạy bù dữ liệu cho ${targetMonths.length} tháng bị lỗi...`);

    for (const target of targetMonths) {
      const y = target.year;
      const m = target.month;
      const mm = String(m).padStart(2, '0');
      const lastDay = new Date(y, m, 0).getDate();
      
      const fromDate = `01/${mm}/${y}T00:00:00`;
      const toDate = `${lastDay}/${mm}/${y}T23:59:59`;

      console.log(`\n=========================================`);
      console.log(`🔍 Đang xử lý lại: ${target.label} (${fromDate} -> ${toDate})`);

      try {
        // Lấy hóa đơn bán ra
        const soldInvoices = await taxService.getSoldInvoices(fromDate, toDate);
        await taxService.sleep(1000);

        // Lấy hóa đơn mua vào thông thường
        const purchaseInvoices = await taxService.getPurchaseInvoices(fromDate, toDate);
        await taxService.sleep(1000);

        // Lấy hóa đơn máy tính tiền (ttxly == 8) - Đã có cơ chế lấy captcha mới bên trong từng trang
        const scoInvoices8 = await taxService.getPurchaseFromCashRegister(fromDate, toDate, 8);
        await taxService.sleep(1000);

        // Lấy hóa đơn máy tính tiền (ttxly == 5)
        const scoInvoices5 = await taxService.getPurchaseFromCashRegister(fromDate, toDate, 5);

        const allInvoicesToProcess = [
          ...soldInvoices.map(inv => ({ ...inv, _invoiceType: 'OUTBOUND', _detailType: 'sold' })),
          ...purchaseInvoices.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'purchase' })),
          ...scoInvoices8.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
          ...scoInvoices5.map(inv => ({ ...inv, _invoiceType: 'INBOUND', _detailType: 'sco' })),
        ];

        console.log(`📦 ${target.label} tìm thấy tổng cộng ${allInvoicesToProcess.length} hóa đơn. Đang đồng bộ vào DB...`);

        // Lưu từng hóa đơn vào DB
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

            // Kiểm tra xem hóa đơn đã tồn tại trong DB chưa
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
              // Xóa chi tiết cũ để ghi đè chi tiết mới chuẩn xác
              await prisma.invoiceDetail.deleteMany({ where: { invoiceId: existing.id } });
            } else {
              savedInvoice = await prisma.invoice.create({
                data: invoicePayload
              });
            }

            // Lưu chi tiết sản phẩm của hóa đơn
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

        console.log(`✅ Hoàn tất bổ sung dữ liệu cho ${target.label}.`);
        await taxService.sleep(2000);

      } catch (errMonth) {
        console.error(`❌ Lỗi khi xử lý ${target.label}:`, errMonth.message);
      }
    }

    // 2. CẬP NHẬT LẠI BẢNG PRODUCT VÀ STOCKTRANSACTION CHO ĐỒ BỘ
    console.log('\n=========================================');
    console.log('🏭 Đang đồng bộ lại danh mục Product & StockTransaction...');
    
    // Xóa sạch lịch sử kho cũ trước khi tổng hợp lại toàn bộ từ đầu đến cuối cho khớp
    await prisma.stockTransaction.deleteMany();
    
    // Reset lại số lượng tồn kho của các sản phẩm về 0 để tính toán lại chính xác
    await prisma.product.updateMany({
      data: { totalImported: 0, totalExported: 0, stockBalance: 0 }
    });

    const allDetails = await prisma.invoiceDetail.findMany({
      include: { invoice: true }
    });

    for (const detail of allDetails) {
      const productName = detail.ten.trim();
      const unitVal = detail.dvtinh || 'Cái';

      let product = await prisma.product.findFirst({
        where: { name: productName }
      });

      if (!product) {
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

      const txType = detail.invoice.type; 
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

    console.log('🎉 Hoàn thành chạy bù dữ liệu tháng 06 và 07, đồng thời cập nhật kho thành công!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình chạy:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();