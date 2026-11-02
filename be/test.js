const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

async function getInvoiceByDetails({ nbmst, khmshdon, khhdon, shdon }) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        nbmst: nbmst,       // Mã số thuế người bán
        khmshdon: khmshdon, // Ký hiệu mẫu số (Int)
        khhdon: khhdon,     // Ký hiệu hóa đơn (String)
        shdon: shdon,       // Số hóa đơn (Int)
      },
      include: {
        details: true,          // Lấy kèm chi tiết dòng hàng (nếu cần)
        stockTransactions: true // Lấy kèm lịch sử kho (nếu cần)
      }
    });

    if (!invoice) {
      console.log("Không tìm thấy hóa đơn phù hợp.");
      return null;
    }

    return invoice;
  } catch (error) {
    console.error("Lỗi khi truy vấn hóa đơn:", error);
    throw error;
  }
}

(async () => {
  try {
    const invoice = await getInvoiceByDetails('3200730390', 1, 'C26THT', 44);
    console.log(invoice.id);
  } catch (error) {
    console.error('Lỗi khi chạy test:', error);
  } finally {
    await prisma.$disconnect(); // Nhớ ngắt kết nối Prisma sau khi test xong
  }
})();