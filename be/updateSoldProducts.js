const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const soldDir = path.join(__dirname, 'details', 'sold');

    if (!fs.existsSync(soldDir)) {
      console.log('❌ Không tìm thấy thư mục details/sold');
      return;
    }

    const files = fs.readdirSync(soldDir).filter(file => file.endsWith('.json'));
    console.log(`📂 Đang quét ${files.length} file hóa đơn bán ra từ thư mục...\n`);

    const soldMap = {};
    const validInventoryStatuses = [1, '1', 2, '2', 3, '3']; // Chỉ lấy hóa đơn có hiệu lực pháp lý

    // 1. Gom nhóm dữ liệu xuất bán từ các file JSON (Có lọc trạng thái tthai hợp lệ)
    for (const file of files) {
      try {
        const filePath = path.join(soldDir, file);
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData);

        // Kiểm tra trạng thái hóa đơn (tthai)
        const currentStatus = data.tthai;
        if (!validInventoryStatuses.includes(currentStatus)) {
          // Bỏ qua hóa đơn bị thay thế (4), bị điều chỉnh (5), đã hủy (6)
          continue; 
        }

        const items = data.hdhhdvu || [];

        for (const item of items) {
          const rawName = (item.ten || 'Hàng hóa không tên').trim();
          const rawUnit = (item.dvtinh || '').trim();
          const quantity = parseFloat(item.sluong) || 0;

          if (quantity <= 0) continue;

          const lowerKey = `${rawName.toLowerCase()}_${rawUnit.toLowerCase()}`;

          if (!soldMap[lowerKey]) {
            soldMap[lowerKey] = {
              displayName: rawName,
              unit: rawUnit,
              totalExported: 0
            };
          }

          soldMap[lowerKey].totalExported += quantity;
        }
      } catch (err) {
        // Bỏ qua file lỗi cấu trúc nếu có
      }
    }

    const soldProducts = Object.values(soldMap);
    console.log(`📋 Tổng hợp được ${soldProducts.length} mặt hàng xuất bán duy nhất từ hóa đơn hợp lệ.`);
    console.log('🔄 Đang cập nhật vào bảng Product và kiểm tra danh mục...\n');

    let updatedCount = 0;
    const missingProducts = [];

    // 2. Kiểm tra và cập nhật vào bảng Product
    for (const item of soldProducts) {
      // Tìm sản phẩm trong DB (không phân biệt hoa/thường)
      const existing = await prisma.product.findFirst({
        where: {
          name: {
            equals: item.displayName,
            mode: 'insensitive'
          }
        }
      });

      if (existing) {
        // Nếu có trong danh mục -> Cập nhật tổng xuất và tính lại tồn kho
        // Lưu ý: Nếu bạn chạy script này nhiều lần, để tránh cộng dồn nhân đôi, 
        // bạn nên tính sum trực tiếp từ StockTransaction thay vì lấy existing.totalExported + item.totalExported.
        // Tạm thời nếu chạy lần đầu hoặc theo luồng cũ, ta dùng:
        const newTotalExported = item.totalExported; // Nếu quét tổng từ folder thì gán trực tiếp tổng mới tính được
        const newStockBalance = (existing.totalImported || 0) - newTotalExported;

        await prisma.product.update({
          where: { id: existing.id },
          data: {
            totalExported: newTotalExported,
            stockBalance: newStockBalance
          }
        });
        updatedCount++;
      } else {
        // Nếu KHÔNG có trong danh mục -> Ghi nhận vào danh sách thiếu
        missingProducts.push({
          name: item.displayName,
          unit: item.unit || '',
          exportedQuantity: item.totalExported
        });
      }
    }

    // 3. Nếu có sản phẩm chưa có trong danh mục, xuất file CSV log lại
    if (missingProducts.length > 0) {
      const csvLines = [];
      csvLines.push('\uFEFFSTT,Tên sản phẩm / Dịch vụ (Bán ra),Đơn vị tính,Tổng số lượng xuất');

      missingProducts.forEach((p, idx) => {
        const safeName = `"${p.name.replace(/"/g, '""')}"`;
        const safeUnit = `"${p.unit.replace(/"/g, '""')}"`;
        csvLines.push(`${idx + 1},${safeName},${safeUnit},${p.exportedQuantity}`);
      });

      const csvFilePath = path.join(__dirname, 'missing_products.csv');
      fs.writeFileSync(csvFilePath, csvLines.join('\n'), 'utf-8');
      console.log(`⚠️ Phát hiện ${missingProducts.length} sản phẩm xuất bán NHƯNG CHƯA CÓ TRONG DANH MỤC!`);
      console.log(`📁 Đã ghi log ra file: missing_products.csv`);
    } else {
      console.log('✨ Tuyệt vời! Tất cả sản phẩm xuất bán đều đã có sẵn trong danh mục.');
    }

    console.log('--------------------------------------------------');
    console.log(`✅ Hoàn tất cập nhật hóa đơn bán ra!`);
    console.log(`- Đã cập nhật kho cho: ${updatedCount} sản phẩm`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('❌ Lỗi khi xử lý hóa đơn bán ra:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();