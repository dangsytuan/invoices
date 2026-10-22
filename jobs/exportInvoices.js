const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Hàm tạo khoảng thời gian theo tháng (Chuẩn DD/MM/YYYY)
function getMonthlyDateRanges(year = 2026) {
  const ranges = [];
  const now = new Date();
  const currentMonth = now.getMonth(); // Tháng hiện tại (0-11)

  for (let m = 0; m <= currentMonth; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0); // Ngày cuối cùng của tháng
    
    const endDateObj = m === currentMonth && now < end ? now : end;

    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const yr = date.getFullYear();
      return `${day}/${month}/${yr}`;
    };

    const fromDate = `${formatDate(start)}T00:00:00`;
    const toDate = `${formatDate(endDateObj)}T23:59:59`;

    ranges.push({ fromDate, toDate });
  }
  return ranges;
}

// Hàm phụ trợ tạo độ trễ (sleep) để tránh bị Too Many Requests
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeInvoicesByType(type, token) {
  const isPurchase = type === 'purchase';
  const endpointType = isPurchase ? 'purchase' : 'sold';
  const actionName = isPurchase ? 'Xem hóa đơn mua vào' : 'Xem hóa đơn bán ra';

  const cookieHeader = `jwt=${token}`;
  const headers = {
    'sec-ch-ua-platform': '"macOS"',
    'authorization': `Bearer ${token}`,
    'action': actionName,
    'accept-language': 'vi',
    'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'request-id': 'e2453e44-7402-49d4-bbb4-8b89575eb195',
    'end-point': '/tra-cuu/tra-cuu-hoa-don',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
    'cookie': cookieHeader,
    'priority': 'u=1, i'
  };

  const dateRanges = getMonthlyDateRanges(2026);
  let allScrapedInvoices = [];

  console.log(`\n🚀 Bắt đầu cào hóa đơn [${type.toUpperCase()}] từ Tổng cục Thuế...`);

  try {
    for (const range of dateRanges) {
      let currentState = null;
      let hasMore = true;

      console.log(`📅 Đang cào dữ liệu từ ${range.fromDate} đến ${range.toDate}...`);

      while (hasMore) {
        let searchCondition = `tdlap=ge=${range.fromDate};tdlap=le=${range.toDate}`;
        if (isPurchase) {
          searchCondition += ';ttxly==5';
        }

        const searchQuery = encodeURIComponent(searchCondition);
        let url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${endpointType}?sort=tdlap:desc&size=15&search=${searchQuery}`;
        
        if (currentState) {
          url += `&state=${encodeURIComponent(currentState)}`;
        }

        const response = await axios.get(url, { headers });
        const resultData = response.data;
        const invoices = resultData.datas || [];

        if (invoices.length === 0) {
          hasMore = false;
          break;
        }

        allScrapedInvoices = allScrapedInvoices.concat(invoices);
        console.log(`   + Đã lấy thêm ${invoices.length} hóa đơn. (Tổng tích lũy: ${allScrapedInvoices.length})`);

        if (resultData.state && invoices.length === 15) {
          currentState = resultData.state;
          // Nghỉ 600ms giữa các trang phân trang để server không quét nhầm là bot spam
          await sleep(600);
        } else {
          hasMore = false;
        }
      }
      
      // Nghỉ 1 giây giữa các tháng
      await sleep(1000);
    }

    const outputFilename = `invoices_${type}.json`;
    const outputFilePath = path.join(__dirname, outputFilename);
    fs.writeFileSync(outputFilePath, JSON.stringify(allScrapedInvoices, null, 2), 'utf-8');

    console.log(`✅ Cào [${type.toUpperCase()}] thành công! Đã lưu ${allScrapedInvoices.length} hóa đơn vào file: ${outputFilename}`);

  } catch (error) {
    console.error(`❌ Lỗi khi cào ${type}:`, error.response?.data || error.message);
  }
}

async function fetchDetailsFromFile(type, token) {
  const fileName = `invoices_${type}.json`;
  const filePath = path.join(__dirname, fileName);

  // 1. Kiểm tra file tồn tại
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy file '${fileName}'. Vui lòng cào danh sách trước!`);
    return;
  }

  // 2. Đọc và parse file JSON
  let invoices = [];
  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    invoices = JSON.parse(rawData);
  } catch (error) {
    console.error(`❌ Lỗi đọc file ${fileName}:`, error.message);
    return;
  }

  console.log(`📂 Đã đọc thành công ${invoices.length} hóa đơn từ '${fileName}'. Bắt đầu cào chi tiết...`);

  // 3. Tạo thư mục lưu chi tiết (ví dụ: ./details/sold hoặc ./details/purchase)
  const outputDir = path.join(__dirname, 'details', type);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const cookieHeader = [
    `jwt=${token}`,
  ].join('; ');

  const headers = {
    'sec-ch-ua-platform': '"macOS"',
    'authorization': `Bearer ${token}`,
    'action': type === 'purchase' ? 'Xem%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)' : 'Xem%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)',
    'accept-language': 'vi',
    'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'request-id': 'e2453e44-7402-49d4-bbb4-8b89575eb195',
    'end-point': '/tra-cuu/tra-cuu-hoa-don',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'cookie': cookieHeader,
    'priority': 'u=1, i'
  };

  let successCount = 0;
  let failCount = 0;

  // 4. Duyệt qua từng hóa đơn để gọi API chi tiết
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    
    const nbmst = inv.nbmst;
    const khhdon = inv.khhdon;
    const shdon = inv.shdon;
    const khmshdon = inv.khmshdon;
    
    // Đặt tên file theo mã hóa đơn (mhdon) hoặc kết hợp số + ký hiệu
    const fileId = inv.mhdon || `${shdon}_${khhdon}`;
    const safeFileName = `${fileId.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
    const detailFilePath = path.join(outputDir, safeFileName);

    // Nếu file chi tiết đã tồn tại thì bỏ qua để tiết kiệm thời gian
    if (fs.existsSync(detailFilePath)) {
      console.log(`   [${i + 1}/${invoices.length}] Đã có sẵn: ${safeFileName}`);
      continue;
    }

    try {
      const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
      
      const response = await axios.get(url, { headers });
      const detailData = response.data;

      // Lưu chi tiết ra file JSON riêng biệt
      fs.writeFileSync(detailFilePath, JSON.stringify(detailData, null, 2), 'utf-8');
      
      successCount++;
      console.log(`   [${i + 1}/${invoices.length}] ✅ Đã lưu chi tiết hóa đơn số ${shdon} -> ${safeFileName}`);

      // Nghỉ 600ms tránh bị chặn request
      await sleep(1000);

    } catch (error) {
      failCount++;
      console.error(`   [${i + 1}/${invoices.length}] ❌ Lỗi lấy chi tiết hóa đơn số ${shdon}:`, error.response?.data || error.message);
    }
  }

  console.log(`\n🏁 Hoàn tất! Thành công: ${successCount}, Lỗi: ${failCount}. Thư mục: ${outputDir}`);
}

async function main() {
  const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkyNzE2ODc4LCJpYXQiOjE3OTI2MzA0Nzh9.Tix9fnPGBtpk8VWrXZrJP4FVPxxAQhd9VFcvbRwQCYpEpP0AijxdnB6S2Xt10Y86qKGmfA_zllsLipRT-MUrzA';

  // 1. Cào hóa đơn bán ra
  // await scrapeInvoicesByType('sold', token);

  // Nghỉ 2 giây trước khi chuyển sang cào mua vào
  // await sleep(2000);

  // 2. Cào hóa đơn mua vào
  // await scrapeInvoicesByType('purchase', token);

  // console.log('\n✨ Hoàn tất toàn bộ quá trình cào dữ liệu hóa đơn mua vào và bán ra!');

  fetchDetailsFromFile('sold', token);
  console.log('\n✨ Hoàn tất toàn bộ quá trình cào dữ liệu hóa đơn sold!');
  await sleep(2000);
  fetchDetailsFromFile('purchase', token);
  console.log('\n✨ Hoàn tất toàn bộ quá trình cào dữ liệu hóa đơn purchase!');
}

main();