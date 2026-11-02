const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

console.log('=== TEST CODE');

(async () => {
  try {
    const now = new Date();

    const fromDay = new Date();
    fromDay.setDate(now.getDate() - 7);

    const toDay = new Date(now);

    const soldInvoice = await taxService.getSoldInvoices();
    if(soldInvoice.success === true){
        console.log(soldInvoice.data?.length);
    }
  } catch (error) {
    console.error('Lỗi khi chạy test:', error);
  } finally {
    await prisma.$disconnect(); // Nhớ ngắt kết nối Prisma sau khi test xong
  }
})();