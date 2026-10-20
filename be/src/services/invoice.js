const axios = require('axios');

class Invoice {
  constructor(jwtToken) {
    this.jwt = jwtToken;
    this.baseUrl = 'https://hoadondientu.gdt.gov.vn';

    // Khai báo headers chung thành một thuộc tính thành viên của class
    this.headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'vi',
      'authorization': `Bearer ${this.jwt}`,
      'cookie': `jwt=${this.jwt}`,
      'end-point': '/tra-cuu/tra-cuu-hoa-don',
      'priority': 'u=1, i',
      'referer': `${this.baseUrl}/tra-cuu/tra-cuu-hoa-don`,
      'request-id': 'e2453e44-7402-49d4-bbb4-8b89575eb195',
      'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
    };
  }

  /**
   * Tạo khoảng thời gian theo định dạng DD/MM/YYYY cho API Tổng cục Thuế
   */
  _getQueryDay(daysToSubtract = 30) {
    const formatVN = (date) => {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(date);
    };

    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - daysToSubtract);

    return {
      fromDate: `${formatVN(past)}T00:00:00`,
      toDate: `${formatVN(now)}T23:59:59`
    };
  }

  async authenticate(username, password, cvalue, ckey) {
    try {
      const url = `${this.baseUrl}/api/security-taxpayer/authenticate`;
      
      // Headers riêng biệt dành cho API authenticate theo raw data của bạn
      const authHeaders = {
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
        'content-type': 'application/json',
        'origin': this.baseUrl,
        'referer': `${this.baseUrl}/`,
        'end-point': '/',
        'request-id': '9e0ca927-b89f-4eb9-94ee-9064d98d1977',
        'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
        // Các cookie hệ thống ban đầu (nếu cần thiết có thể truyền thêm)
        'cookie': '_ga=GA1.3.509527361.1785485458; df9a7b9f11f13b2b359e1a94557637ae=d142ba3c026fc58b6c83e68d6999e4b0'
      };

      const payload = {
        username,
        password,
        cvalue,
        ckey
      };

      const response = await axios.post(url, payload, { headers: authHeaders });
      
      // Thường API trả về sẽ chứa token, tự động gán vào instance nếu thành công
      if (response.data && response.data.id_token) {
        this.jwt = response.data.id_token;
      }

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  /**
   * Lấy danh sách hóa đơn bán ra
   */
  async getList(daysToSubtract = 30) {
    try {
      const { fromDate, toDate } = this._getQueryDay(daysToSubtract);
      const url = `${this.baseUrl}/api/query/invoices/sold?sort=tdlap:desc&size=15&search=tdlap=ge=${fromDate};tdlap=le=${toDate}`;
      
      // Tạo bản sao headers và ghi đè riêng field 'action' cho api list
      const requestHeaders = {
        ...this.headers,
        'action': 'Xem hóa đơn (hóa đơn bán ra)'
      };

      const response = await axios.get(url, { headers: requestHeaders });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  /**
   * Lấy chi tiết một hóa đơn cụ thể
   */
  async getDetail(nbmst, khhdon, shdon, khmshdon = 1) {
    try {
      const url = `${this.baseUrl}/api/query/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
      
      // Tạo bản sao headers và ghi đè riêng field 'action' cho api detail
      const requestHeaders = {
        ...this.headers,
        'action': 'Xem%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)'
      };

      const response = await axios.get(url, { headers: requestHeaders });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }
}

module.exports = Invoice;