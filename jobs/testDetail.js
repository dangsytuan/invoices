const axios = require('axios');

async function testFetchInvoiceDetail() {
  const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkyNzE2ODc4LCJpYXQiOjE3OTI2MzA0Nzh9.Tix9fnPGBtpk8VWrXZrJP4FVPxxAQhd9VFcvbRwQCYpEpP0AijxdnB6S2Xt10Y86qKGmfA_zllsLipRT-MUrzA';

  // Gom toàn bộ cookie thành một chuỗi duy nhất chuẩn cú pháp HTTP Cookie
  const cookieHeader = [
    '_ga=GA1.3.509527361.1785485458',
    '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
    'df9a7b9f11f13b2b359e1a94557637ae=d142ba3c026fc58b6c83e68d6999e4b0',
    'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
    'e1a565439633aacdd764ec3e73b3cc09=fdb8f84d64862c2c3bcb60b31349c694',
    'JSESSIONID=3852DB85BC194E245377DAEB92D39F61',
    `jwt=${token}`,
    'TS0114b13e=011c0ae74061ba35db5719b640d0e3ae9dfb6d37892fffd5ac8db569a2f1dd35d869a9c7e284362c7d683473e39438eca2e9c99cfea5981be51628fde83a45a9e547e361bbf0e09793e026cd661724356727c20df032368488109f40ce846e226736e8090d083660e6cb13eb7df3f3b04b125495f22fbeef875c13c8834004439660fac01d'
  ].join('; ');

  // Headers chuẩn khớp 100% yêu cầu của TCT
  const headers = {
    'sec-ch-ua-platform': '"macOS"',
    'authorization': `Bearer ${token}`,
    'action': 'Xem hóa đơn (hóa đơn bán ra)', // Hoặc 'Xem hóa đơn (hóa đơn mua vào)' tùy hóa đơn test
    'accept-language': 'vi',
    'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'request-id': '798b5355-2582-4e0a-8ade-382ad2911d47',
    'end-point': '/tra-cuu/tra-cuu-hoa-don',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'cookie': cookieHeader,
    'priority': 'u=1, i'
  };

  // URL test theo đúng yêu cầu của bạn
  const url = 'https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=3200758117&khhdon=C26TVN&shdon=170&khmshdon=1';

  try {
    console.log('🚀 Đang gọi API lấy dữ liệu raw...');
    const response = await axios.get(url, { headers });
    
    console.log('\n✅ Gọi API thành công! Dữ liệu trả về (Raw):');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('\n❌ Gọi API thất bại:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
  }
}

testFetchInvoiceDetail();