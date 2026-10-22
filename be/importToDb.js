const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkyNzE2ODc4LCJpYXQiOjE3OTI2MzA0Nzh9.Tix9fnPGBtpk8VWrXZrJP4FVPxxAQhd9VFcvbRwQCYpEpP0AijxdnB6S2Xt10Y86qKGmfA_zllsLipRT-MUrzA';
const COOKIE_HEADER = [
  '_ga=GA1.3.509527361.1785485458',
  '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
  'df9a7b9f11f13b2b359e1a94557637ae=d142ba3c026fc58b6c83e68d6999e4b0',
  'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
  'e1a565439633aacdd764ec3e73b3cc09=fdb8f84d64862c2c3bcb60b31349c694',
  'JSESSIONID=3852DB85BC194E245377DAEB92D39F61',
  `jwt=${TOKEN}`,
  'TS0114b13e=011c0ae74061ba35db5719b640d0e3ae9dfb6d37892fffd5ac8db569a2f1dd35d869a9c7e284362c7d683473e39438eca2e9c99cfea5981be51628fde83a45a9e547e361bbf0e09793e026cd661724356727c20df032368488109f40ce846e226736e8090d083660e6cb13eb7df3f3b04b125495f22fbeef875c13c8834004439660fac01d'
].join('; ');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function redownloadInvoiceDetail(fileBaseName, invoiceType) {
  const listFileName = `invoices_${invoiceType === 'OUTBOUND' ? 'sold' : 'purchase'}.json`;
  const listFilePath = path.join(__dirname, listFileName);

  if (!fs.existsSync(listFilePath)) return null;

  const listInvoices = JSON.parse(fs.readFileSync(listFilePath, 'utf-8'));
  const target = listInvoices.find(inv => {
    const fileId = inv.mhdon || `${inv.shdon}_${inv.khhdon}`;
    return fileId.replace(/[/\\?%*:|"<>]/g, '_') === fileBaseName;
  });

  if (!target) return null;

  const { nbmst, khhdon, shdon, khmshdon } = target;
  console.log(`   🔄 Đang gọi API tải lại hóa đơn số ${shdon} (MST: ${nbmst})...`);

  const headers = {
    'sec-ch-ua-platform': '"macOS"',
    'authorization': `Bearer ${TOKEN}`,
    'action': invoiceType === 'OUTBOUND' ? 'Xem hóa đơn (hóa đơn bán ra)' : 'Xem hóa đơn (hóa đơn mua vào)',
    'accept-language': 'vi',
    'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'request-id': '798b5355-2582-4e0a-8ade-382ad2911d47',
    'end-point': '/tra-cuu/tra-cuu-hoa-don',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
    'cookie': COOKIE_HEADER,
    'priority': 'u=1, i'
  };

  try {
    const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
    const response = await axios.get(url, { headers });
    
    const outputDir = path.join(__dirname, 'details', invoiceType === 'OUTBOUND' ? 'sold' : 'purchase');
    fs.writeFileSync(path.join(outputDir, `${fileBaseName}.json`), JSON.stringify(response.data, null, 2), 'utf-8');
    return response.data;
  } catch (error) {
    return null;
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

async function importInvoicesFromFolder(folderPath, invoiceType) {
  const fullDirPath = path.join(__dirname, folderPath);
  if (!fs.existsSync(fullDirPath)) return;

  const files = fs.readdirSync(fullDirPath).filter(file => file.endsWith('.json'));
  console.log(`\n📂 Xử lý ${files.length} file trong [${folderPath}]...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(fullDirPath, file);
    const fileBaseName = path.basename(file, '.json');

    try {
      let rawData = fs.readFileSync(filePath, 'utf-8');
      let data = JSON.parse(rawData);

      // SỬA TẠI ĐÂY: Dữ liệu chuẩn theo JSON GDT thực tế
      let invInfo = data; 
      let items = data.hdhhdvu || [];

      if (!invInfo || !invInfo.shdon) {
        data = await redownloadInvoiceDetail(fileBaseName, invoiceType);
        if (data) {
          invInfo = data;
          items = data.hdhhdvu || [];
        }
        await sleep(1000);
      }

      if (!invInfo || !invInfo.shdon) {
        errorCount++;
        continue;
      }

      const nbmst = String(invInfo.nbmst || '');
      const khhdon = String(invInfo.khhdon || '');
      const shdon = parseInt(invInfo.shdon) || 0;
      const khmshdon = parseInt(invInfo.khmshdon || 1);
      const invoiceDate = parseDate(invInfo.tdlap) || new Date();

      const invoiceData = {
        type: invoiceType,
        nbmst: nbmst,
        nbten: invInfo.nbten || '',
        nmmst: String(invInfo.nmmst || ''),
        nmten: invInfo.nmten || '',
        khmshdon: khmshdon,
        khhdon: khhdon,
        shdon: shdon,
        hdon: String(invInfo.hdon || '01'),
        thdon: invInfo.thdon || 'Hóa đơn giá trị gia tăng',
        cqt: invInfo.cqt || null,
        hsgcma: invInfo.hsgcma || null,
        mhdon: invInfo.mhdon || null,
        ncma: parseDate(invInfo.ncma),
        nky: parseDate(invInfo.nky),
        tdlap: invoiceDate,
        dvtte: invInfo.dvtte || 'VND',
        tgtcthue: parseFloat(invInfo.tgtcthue) || 0,
        tgtthue: parseFloat(invInfo.tgtthue) || 0,
        tgtttbso: parseFloat(invInfo.tgtttbso) || 0,
        tgtttbchu: invInfo.tgtttbchu || null,
        thtttoan: invInfo.thtttoan || null,
      };

      await prisma.$transaction(async (tx) => {
        let existing = await tx.invoice.findFirst({
          where: { nbmst, khhdon, shdon, khmshdon }
        });

        let invoiceId;

        if (existing) {
          invoiceId = existing.id;
          await tx.invoice.update({ where: { id: invoiceId }, data: invoiceData });
          await tx.invoiceDetail.deleteMany({ where: { invoiceId } });
          await tx.stockTransaction.deleteMany({ where: { invoiceId } });
        } else {
          const created = await tx.invoice.create({ data: invoiceData });
          invoiceId = created.id;
        }

        if (items.length > 0) {
          // 1. Tạo chi tiết hóa đơn (InvoiceDetail)
          const detailRecords = items.map((item, idx) => ({
            invoiceId: invoiceId,
            stt: item.stt ? parseInt(item.stt) : idx + 1,
            ten: item.ten || '',
            dvtinh: item.dvtinh || null,
            sluong: parseFloat(item.sluong) || 0,
            dgia: parseFloat(item.dgia) || 0,
            thtien: parseFloat(item.thtien) || 0,
            tsuat: parseFloat(item.tsuat) || 0,
            ltsuat: item.ltsuat || null,
            stckhau: item.stckhau ? parseFloat(item.stckhau) : null,
          }));

          await tx.invoiceDetail.createMany({ data: detailRecords });

          // 2. Ghi sổ kho vào bảng StockTransaction
          const stockRecords = items.map(item => ({
            invoiceId: invoiceId,
            type: invoiceType === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
            productName: item.ten || 'Hàng hóa không tên',
            unit: item.dvtinh || null,
            quantity: parseFloat(item.sluong) || 0,
            unitPrice: parseFloat(item.dgia) || 0,
            totalAmount: parseFloat(item.thtien) || 0,
            transactionDate: invoiceDate
          }));

          await tx.stockTransaction.createMany({ data: stockRecords });
        }
      });

      successCount++;
      console.log(`   [${i + 1}/${files.length}] ✅ Đã lưu DB & Ghi sổ kho: HĐ số ${shdon} (${khhdon})`);

    } catch (err) {
      errorCount++;
      console.error(`   [${i + 1}/${files.length}] ❌ Lỗi file ${file}:`, err.message);
    }
  }

  console.log(`\n🏁 Hoàn thành thư mục [${folderPath}]. Thành công: ${successCount}, Lỗi: ${errorCount}`);
}

async function main() {
  try {
    console.log('🚀 Bắt đầu đồng bộ hóa đơn và ghi sổ kho...');
    await importInvoicesFromFolder('details/sold', 'OUTBOUND');
    await importInvoicesFromFolder('details/purchase', 'INBOUND');
    console.log('\n✨ Hoàn tất toàn bộ quá trình!');
  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();