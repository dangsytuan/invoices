const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Sửa lỗi import PdfPrinter cho các phiên bản pdfmake mới và cũ
const PdfMakeModule = require('pdfmake');
const PdfPrinter = PdfMakeModule.default || PdfMakeModule;

// Tự động tìm đường dẫn font Roboto trong node_modules
const fontDir = path.join(__dirname, 'fonts');
const fonts = {
  Roboto: {
    normal: path.join(fontDir, 'Roboto-Regular.ttf'),
    bold: path.join(fontDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf')
  }
};

const printer = new PdfPrinter(fonts);

async function exportProductsToPDF() {
  console.log('🔄 Đang lấy dữ liệu sản phẩm từ Database...');

  try {
    // Chỉ lấy sản phẩm đơn lẻ (isBundle: false), loại bỏ combo và không cần lấy sku
    const products = await prisma.product.findMany({
      where: {
        isBundle: false
      },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        unit: true,
        totalImported: true,
        totalExported: true,
        stockBalance: true
      }
    });

    console.log(`📊 Tìm thấy ${products.length} sản phẩm đơn lẻ. Đang tạo file PDF...`);

    const tableBody = [
      [
        { text: 'STT', style: 'tableHeader' },
        { text: 'Tên sản phẩm chuẩn', style: 'tableHeader' },
        { text: 'ĐVT', style: 'tableHeader' },
        { text: 'Nhập', style: 'tableHeader' },
        { text: 'Xuất', style: 'tableHeader' },
        { text: 'Tồn kho', style: 'tableHeader' }
      ]
    ];

    products.forEach((p, index) => {
      tableBody.push([
        { text: (index + 1).toString(), alignment: 'center' },
        { text: p.name },
        { text: p.unit || '', alignment: 'center' },
        { text: p.totalImported.toString(), alignment: 'right' },
        { text: p.totalExported.toString(), alignment: 'right' },
        { 
          text: p.stockBalance.toString(), 
          alignment: 'right', 
          color: p.stockBalance < 0 ? 'red' : 'black',
          bold: true 
        }
      ]);
    });

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [25, 25, 25, 25],
      content: [
        { text: 'BÁO CÁO TỒN KHO SẢN PHẨM ĐƠN LẺ', style: 'header' },
        { text: `Thời gian xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`, style: 'subheader' },
        {
          table: {
            headerRows: 1,
            widths: ['6%', '55%', '11%', '9%', '9%', '10%'], // Phân bổ chiều rộng 6 cột
            body: tableBody
          },
          layout: 'lightHorizontalLines'
        }
      ],
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          alignment: 'center',
          color: '#1e293b',
          margin: [0, 0, 0, 4]
        },
        subheader: {
          fontSize: 9,
          italics: true,
          alignment: 'center',
          color: '#64748b',
          margin: [0, 0, 0, 10]
        },
        tableHeader: {
          bold: true,
          fontSize: 9,
          color: 'white',
          fillColor: '#0284c7',
          alignment: 'center',
          margin: [0, 3, 0, 3]
        }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 8
      }
    };

    // Tạo tên file tự động theo ngày tháng năm hiện tại (Ví dụ: TonKho_14_11_26.pdf)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    
    const outputPath = path.join(__dirname, `TonKho_${day}_${month}_${year}.pdf`);
    
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const writeStream = fs.createWriteStream(outputPath);

    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    writeStream.on('finish', () => {
      console.log(`✅ Xuất file PDF thành công tại: ${outputPath}`);
    });

  } catch (error) {
    console.error('❌ Lỗi khi xuất PDF:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportProductsToPDF();