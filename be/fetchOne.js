const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkyNzE2ODc4LCJpYXQiOjE3OTI2MzA0Nzh9.Tix9fnPGBtpk8VWrXZrJP4FVPxxAQhd9VFcvbRwQCYpEpP0AijxdnB6S2Xt10Y86qKGmfA_zllsLipRT-MUrzA';

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

  rl.question('Nhập loại hóa đơn (sold / purchase) [Mặc định: sold]: ', async (typeInput) => {
    const type = typeInput.trim() === 'purchase' ? 'purchase' : 'sold';
    
    rl.question('Nhập số hóa đơn (shdon) cần tải: ', async (shdonInput) => {
      const shdon = shdonInput.trim();
      rl.close();

      const fileName = `invoices_${type}.json`;
      const filePath = path.join(__dirname, fileName);

      if (!fs.existsSync(filePath)) {
        console.log(`❌ Không tìm thấy file ${fileName}`);
        return;
      }

      const invoices = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const target = invoices.find(inv => String(inv.shdon) === shdon);

      if (!target) {
        console.log(`❌ Không tìm thấy hóa đơn số ${shdon} trong file ${fileName}`);
        return;
      }

      const { nbmst, khhdon, khmshdon } = target;
      console.log(`🔍 Đã tìm thấy! MST: ${nbmst}, Ký hiệu: ${khhdon}, Mẫu số: ${khmshdon}`);

      const headers = {
        'sec-ch-ua-platform': '"macOS"',
        'authorization': `Bearer ${token}`,
        'action': type === 'purchase' ? 'Xem hóa đơn (hóa đơn mua vào)' : 'Xem hóa đơn (hóa đơn bán ra)',
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
        'cookie': cookieHeader,
        'priority': 'u=1, i'
      };

      try {
        const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
        
        console.log('🚀 Đang gọi API lấy chi tiết...');
        const response = await axios.get(url, { headers });

        const outputDir = path.join(__dirname, 'details', type);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const safeFileName = `${target.mhdon || `${shdon}_${khhdon}`}.json`;
        fs.writeFileSync(path.join(outputDir, safeFileName), JSON.stringify(response.data, null, 2), 'utf-8');
        
        console.log(`✅ Tải thành công! Đã lưu vào: details/${type}/${safeFileName}`);
      } catch (error) {
        console.error('❌ Lỗi khi tải:', error.response?.data || error.message);
      }
    });
  });
}

main();