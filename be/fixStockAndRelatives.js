const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

async function main() {
  try {
    console.log('🔐 Đang thực hiện xác thực với Tổng cục Thuế...');
    if (!taxService.loadSavedToken()) {
      await taxService.login('3200758117', '1234567@Abc'); 
    }

    console.log('\n==================================================');
    console.log('🔍 BƯỚC 1: Quét hóa đơn tthai !== 1 và cập nhật thông tin liên quan (1-1)...');
    console.log('==================================================');

    const nonStandardInvoices = await prisma.invoice.findMany({
      where: {
        tthai: { not: 1 }
      }
    });

    console.log(`📦 Tìm thấy ${nonStandardInvoices.length} hóa đơn cần cập nhật liên quan.`);

    let checkedCount = 0;
    let updatedCount = 0;

    for (const inv of nonStandardInvoices) {
      checkedCount++;
      process.stdout.write(`\r⏳ Đang xử lý (${checkedCount}/${nonStandardInvoices.length}): HĐ số ${inv.shdon} (${inv.khhdon})...   `);

      try {
        // 1. Thử gọi API thông thường trước
        let relatives = await taxService.getRelativeInvoices(inv.nbmst, inv.khmshdon, inv.khhdon, inv.shdon);
        
        // 2. Nếu không có, thử gọi sang API SCO (máy tính tiền)
        if (!relatives || relatives.length === 0) {
          relatives = await taxService.getScoRelativeInvoices(inv.nbmst, inv.khmshdon, inv.khhdon, inv.shdon);
        }

        if (relatives && relatives.length > 0) {
          // Lấy hóa đơn liên quan đầu tiên
          const relInfo = relatives[0];

          // Cập nhật trực tiếp 1-1 vào bản ghi hiện tại
          await prisma.invoice.update({
            where: { id: inv.id },
            data: {
              relNbmst: relInfo.nbmst || null,
              relKhmshdon: relInfo.khmshdon ? Number(relInfo.khmshdon) : null,
              relKhhdon: relInfo.khhdon || null,
              relShdon: relInfo.shdon ? Number(relInfo.shdon) : null
            }
          });
          
          updatedCount++;
        }

        await taxService.sleep(300);
      } catch (errRel) {
        // Bỏ qua lỗi nhỏ từng hóa đơn
      }
    }

    console.log(`\n\n✅ Hoàn tất! Đã cập nhật thành công thông tin liên quan cho ${updatedCount}/${nonStandardInvoices.length} hóa đơn.`);

    console.log('\n==================================================');
    console.log('🏭 BƯỚC 2: Tính toán lại toàn bộ kho hàng (Stock & Transactions)...');
    console.log('==================================================');

    // 1. Xóa lịch sử kho cũ
    await prisma.stockTransaction.deleteMany();
    console.log('🗑️ Đã xóa sạch lịch sử StockTransaction cũ.');

    // 2. Reset tồn kho sản phẩm về 0
    await prisma.product.updateMany({
      data: { totalImported: 0, totalExported: 0, stockBalance: 0 }
    });
    console.log('🔄 Đã reset số lượng tồn kho của tất cả Product về 0.');

    // 3. Lấy chi tiết hóa đơn hợp lệ (tthai = 1) để tính kho
    const validDetails = await prisma.invoiceDetail.findMany({
      include: { invoice: true },
      where: {
        invoice: {
          tthai: 1 // Chỉ giữ lại hóa đơn gốc hợp lệ, loại bỏ hoàn toàn các hóa đơn bị thay thế/hủy
        }
      }
    });

    console.log(`📦 Tổng số chi tiết hóa đơn hợp lệ đưa vào tính kho: ${validDetails.length}`);

    let processedDetails = 0;
    for (const detail of validDetails) {
      processedDetails++;
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

    const totalProducts = await prisma.product.count();
    const productsInStock = await prisma.product.findMany({
      orderBy: { stockBalance: 'desc' },
      take: 5
    });

    console.log('\n==================================================');
    console.log('📊 BÁO CÁO KẾT QUẢ THỰC THI');
    console.log('==================================================');
    console.log(`🔹 Tổng số hóa đơn tthai !== 1 đã quét : ${nonStandardInvoices.length}`);
    console.log(`🔹 Số hóa đơn đã cập nhật liên quan 1-1 : ${updatedCount}`);
    console.log(`🔹 Tổng số chi tiết đưa vào tính kho    : ${processedDetails}`);
    console.log(`🔹 Tổng số mặt hàng (Product) trong kho : ${totalProducts}`);
    console.log('--------------------------------------------------');
    console.log('🏆 Top 5 sản phẩm tồn kho cao nhất hiện tại:');
    productsInStock.forEach((p, idx) => {
      console.log(`   ${idx + 1}. [${p.name}] - Tồn kho: ${p.stockBalance} ${p.unit} (Nhập: ${p.totalImported}, Xuất: ${p.totalExported})`);
    });
    console.log('==================================================');
    console.log('🎉 Hoàn tất toàn bộ quy trình cập nhật hóa đơn liên quan và đồng bộ kho!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình chạy:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();