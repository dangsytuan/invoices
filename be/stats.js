const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('📊 Đang tổng hợp số liệu hóa đơn và tạo file Excel báo cáo tồn kho...\n');

    // 1. Thống kê tổng số hóa đơn
    const totalInbound = await prisma.invoice.count({ where: { type: 'INBOUND' } });
    const totalOutbound = await prisma.invoice.count({ where: { type: 'OUTBOUND' } });

    // 2. Lấy toàn bộ giao dịch kho để tính toán tồn kho bằng JS
    const transactions = await prisma.stockTransaction.findMany({
      select: {
        productName: true,
        unit: true,
        type: true,
        quantity: true
      }
    });

    // Gom nhóm và tính tổng tồn kho theo tên sản phẩm & đơn vị tính
    const inventoryMap = {};

    for (const tx of transactions) {
      const key = `${tx.productName}_${tx.unit || ''}`;
      if (!inventoryMap[key]) {
        inventoryMap[key] = {
          productName: tx.productName,
          unit: tx.unit || '-',
          totalImported: 0,
          totalExported: 0
        };
      }

      if (tx.type === 'INBOUND') {
        inventoryMap[key].totalImported += tx.quantity;
      } else if (tx.type === 'OUTBOUND') {
        inventoryMap[key].totalExported += tx.quantity;
      }
    }

    // Chuyển đổi object thành mảng và tính tồn kho (Nhập - Xuất)
    const stockReport = Object.values(inventoryMap).map(item => ({
      productName: item.productName,
      unit: item.unit,
      totalImported: item.totalImported,
      totalExported: item.totalExported,
      stockBalance: item.totalImported - item.totalExported
    }));

    // Sắp xếp theo tồn kho giảm dần
    stockReport.sort((a, b) => b.stockBalance - a.stockBalance);

    // 3. Khởi tạo Workbook & Worksheet ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Báo Cáo Tồn Kho');

    // Tiêu đề báo cáo
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'BÁO CÁO TỒN KHO HÀNG HÓA TỪ HÓA ĐƠN';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1F4E79' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Thông tin tổng quan
    worksheet.getCell('A3').value = `Ngày xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`;
    worksheet.getCell('A3').font = { italic: true };
    
    worksheet.getCell('A4').value = `Tổng hóa đơn Mua vào: ${totalInbound} | Tổng hóa đơn Bán ra: ${totalOutbound} | Tổng đã xử lý: ${totalInbound + totalOutbound}`;
    worksheet.getCell('A4').font = { bold: true };

    // Bảng chi tiết
    const headerRowNumber = 6;
    const headers = ['STT', 'Tên hàng hóa, dịch vụ', 'ĐVT', 'Tổng Nhập', 'Tổng Xuất', 'Tồn Kho'];
    const headerRow = worksheet.getRow(headerRowNumber);
    headerRow.values = headers;

    // Styling cho Header Row
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2F5597' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Thêm dữ liệu vào bảng
    stockReport.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.productName,
        item.unit,
        item.totalImported,
        item.totalExported,
        item.stockBalance
      ]);

      // Định dạng kiểu căn lề và border cho từng cell
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).alignment = { horizontal: 'right' };

      // Format số
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';

      // Tô màu đỏ nhạt nếu tồn kho âm (xuất nhiều hơn nhập)
      if (item.stockBalance < 0) {
        row.getCell(6).font = { color: { argb: 'FFC00000' }, bold: true };
      }

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
      });
    });

    // Tự động căn chỉnh độ rộng cột
    worksheet.columns = [
      { width: 8 },   // STT
      { width: 45 },  // Tên hàng hóa
      { width: 12 },  // ĐVT
      { width: 15 },  // Tổng Nhập
      { width: 15 },  // Tổng Xuất
      { width: 15 }   // Tồn Kho
    ];

    // 4. Lưu file Excel
    const outputFilePath = path.join(__dirname, 'inventory_report.xlsx');
    await workbook.xlsx.writeFile(outputFilePath);

    console.log('--------------------------------------------------');
    console.log(`✅ Đã xuất báo cáo thành công ra file Excel: inventory_report.xlsx`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('❌ Lỗi khi xuất file Excel:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();