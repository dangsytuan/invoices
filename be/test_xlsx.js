
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function readExcel(filePath) {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet('Sheet1');

    if (!worksheet) {
        throw new Error('Không tìm thấy Sheet1');
    }

    // Dòng 5 là tiêu đề cột
    const headers = worksheet.getRow(5).values.slice(1);

    const results = [];

    // Bắt đầu đọc dữ liệu từ dòng 6
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber < 6) return;

        const item = {};

        headers.forEach((header, index) => {
            item[header] = row.getCell(index + 1).value ?? null;
        });

        results.push(item);
    });

    return results;
}

async function main() {

    // 1. Lấy danh sách hóa đơn bán ra trong DB
    const invoicesDB = await prisma.invoice.findMany({
        where: {
            type: 'OUTBOUND'
        }
    });

    // 2. Lấy danh sách hóa đơn trong Excel
    const invoicesExcel = await readExcel('./bang-ke-hoa-don.xlsx');

    console.log('Tổng hóa đơn trong DB:', invoicesDB.length);
    console.log('Tổng hóa đơn trong Excel:', invoicesExcel.length);

    // 3. Kiểm tra từng hóa đơn Excel có trong DB hay không
    const missingInvoices = [];

    for (const invoiceExcel of invoicesExcel) {

        const shdon = Number(invoiceExcel['Số hóa đơn']);
        const nmmst = String(invoiceExcel['Mã số thuế'] ?? '').trim();
        const khhdon = String(invoiceExcel['Ký hiệu'] ?? '').trim();

        const invoiceDB = invoicesDB.find(invoice =>
            invoice.shdon === shdon &&
            invoice.nmmst.trim() === nmmst
        );

        // Không tìm thấy hóa đơn trong DB
        if (!invoiceDB) {
            missingInvoices.push(invoiceExcel);
        }
    }

    // 4. Hiển thị kết quả
    console.log('====================================');
    console.log('Tổng hóa đơn Excel:', invoicesExcel.length);
    console.log('Tổng hóa đơn DB:', invoicesDB.length);
    console.log('Hóa đơn không có trong DB:', missingInvoices.length);
    console.log('====================================');

    console.table(
        missingInvoices.map(invoice => ({
            shdon: Number(invoice['Số hóa đơn']),
            khhdon: invoice['Ký hiệu'],
            nmmst: invoice['Mã số thuế'],
            tenKhachHang: invoice['Tên khách hàng']
        }))
    );
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
