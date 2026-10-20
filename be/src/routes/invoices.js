const express = require('express');
const router = express.Router();
const axios = require('axios');

function getQueyDay(daysToSubtract = 30) {
  // Bổ sung số 0 ở đầu nếu số < 10 (ví dụ: 8 -> "08")
  const pad = (num) => String(num).padStart(2, '0');

  // Chuyển đổi mốc thời gian sang ngày/tháng/năm theo múi giờ Việt Nam
  const formatVN = (date) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // Trả về dạng DD/MM/YYYY
  };

  // Mốc thời gian hiện tại
  const now = new Date();

  // Mốc thời gian lùi lại X ngày
  const past = new Date(now);
  past.setDate(past.getDate() - daysToSubtract);

  return {
    fromDate: `${formatVN(past)}T00:00:00`,
    toDate: `${formatVN(now)}T23:59:59`
  };
}

router.get('/list', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  }

  const { fromDate, toDate } = getQueyDay()
  const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/sold?sort=tdlap:desc&size=15&search=tdlap=ge=${fromDate};tdlap=le=${toDate}`;

  // Chuyển đổi các cookie riêng lẻ trong raw data thành 1 chuỗi Header Cookie hợp lệ
  const cookieHeader = [
    `jwt=${token}`,
  ].join('; ');
  
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'vi',
    'action': 'Xem hóa đơn (hóa đơn bán ra)',
    'authorization': `Bearer ${token}`,
    'cookie': cookieHeader,
    'end-point': '/tra-cuu/tra-cuu-hoa-don',
    'priority': 'u=1, i',
    'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
    'request-id': 'e2453e44-7402-49d4-bbb4-8b89575eb195',
    'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
  };
  try {
    const response = await axios.get(url, { headers });

    return res.status(200).json({
        susccess: true,
        data: response.data
    });
  } catch (error) {
    
    return res.status(500).json({
        susccess: false,
        data: error.message
    });
  }
});

router.post('/detail', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  }

    const { khhdon, shdon } = req.body;
    const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=3200758117&khhdon=${khhdon}&shdon=${shdon}&khmshdon=1`;
    // https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=3200758117&khhdon=C26TVN&shdon=152&khmshdon=1

  // Ghép các dòng cookie đúng theo thứ tự nguyên bản từ raw data
  const cookieHeader = [
    `jwt=${token}`,
  ].join('; ');

  const headers = {
    'sec-ch-ua-platform': '"macOS"',
    'authorization': `Bearer ${token}`,
    'action': 'Xem%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)',
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

  try {
    const response = await axios.get(url, { headers });
    
    return res.status(200).json({
        susccess: true,
        data: response.data
    });
  } catch (error) {
    
    return res.status(500).json({
        susccess: false,
        data: error.message
    });
  }
});

module.exports = router;