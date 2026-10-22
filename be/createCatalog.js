const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const purchaseDir = path.join(__dirname, 'details', 'purchase');

    if (!fs.existsSync(purchaseDir)) {
      console.log('❌ Không tìm thấy thư mục details/purchase');
      return;
    }

    const files = fs.readdirSync(purchaseDir).filter(file => file.endsWith('.json'));
    console.log(`📂 Đang đọc ${files.length} file hóa đơn mua vào từ thư mục...\n`);

    const catalogMap = {};

    // 1. Quét và gom nhóm dữ liệu (không phân biệt chữ hoa / chữ thường)
    for (const file of files) {
      try {
        const filePath = path.join(purchaseDir, file);
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData);

        const items = data.hdhhdvu || [];

        for (const item of items) {
          const rawName = (item.ten || 'Hàng hóa không tên').trim();
          const rawUnit = (item.dvtinh || '').trim();
          const quantity = parseFloat(item.sluong) || 0;
          const totalAmount = parseFloat(item.thtien) || 0;

          // Tạo key dạng lowercase để gom nhóm không phân biệt hoa/thường
          const lowerKey = `${rawName.toLowerCase()}_${rawUnit.toLowerCase()}`;

          if (!catalogMap[lowerKey]) {
            catalogMap[lowerKey] = {
              displayName: rawName, // Giữ lại tên đẹp ở lần gặp đầu tiên
              unit: rawUnit || null,
              totalImported: 0,
              totalAmount: 0
            };
          }

          catalogMap[lowerKey].totalImported += quantity;
          catalogMap[lowerKey].totalAmount += totalAmount;
        }
      } catch (err) {
        // Bỏ qua file lỗi nếu có
      }
    }

    const productList = Object.values(catalogMap);
    console.log(`📋 Tổng hợp được ${productList.length} sản phẩm độc lập (bỏ qua phân biệt hoa/thường).`);
    console.log('🔄 Đang đồng bộ dữ liệu vào bảng Product trong Database...\n');

    let createdCount = 0;
    let updatedCount = 0;

    // 2. Lưu hoặc cập nhật vào bảng Product trong Database
    for (const prod of productList) {
      // Kiểm tra xem sản phẩm đã tồn tại chưa (tìm kiếm không phân biệt hoa thường - mode: 'insensitive')
      const existing = await prisma.product.findFirst({
        where: {
          name: {
            equals: prod.displayName,
            mode: 'insensitive'
          }
        }
      });

      if (existing) {
        // Nếu đã tồn tại, cập nhật lại tổng nhập
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            totalImported: prod.totalImported,
            stockBalance: prod.totalImported - existing.totalExported
          }
        });
        updatedCount++;
      } else {
        // Nếu chưa có, tạo mới
        await prisma.product.create({
          data: {
            name: prod.displayName,
            unit: prod.unit,
            totalImported: prod.totalImported,
            totalExported: 0,
            stockBalance: prod.totalImported
          }
        });
        createdCount++;
      }
    }

    console.log('--------------------------------------------------');
    console.log(`✅ Hoàn tất đồng bộ vào bảng Product!`);
    console.log(`- Tạo mới: ${createdCount} sản phẩm`);
    console.log(`- Cập nhật: ${updatedCount} sản phẩm`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ vào DB:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();