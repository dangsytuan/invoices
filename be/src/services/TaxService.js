const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class TaxService {
  constructor() {
    this.baseUrl = 'https://hoadondientu.gdt.gov.vn';
    this.token = null;
    this.tokenFilePath = path.join(__dirname, 'token.json');
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://hoadondientu.gdt.gov.vn',
        'Referer': 'https://hoadondientu.gdt.gov.vn/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
      }
    });
    if(!this.loadSavedToken()){
      console.log('🔄 Token không tồn tại hoặc đã hết hạn. Bắt đầu luồng đăng nhập mới...');

      const username = '3200758117';
      const password = '1234567@Abc';
      this.login(username, password);
    }
  }

  /**
   * Hàm tạo độ trễ (delay) để tránh bị lỗi 429 Too Many Requests
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Giải mã JWT thủ công để lấy thời gian hết hạn và in ra giờ phút giây cụ thể
   */
  isTokenValid(token) {
    if (!token) return false;
    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      
      const currentTime = Math.floor(Date.now() / 1000);
      const expirationTime = decodedPayload.exp;
      
      const expDate = new Date(expirationTime * 1000);
      const hours = String(expDate.getHours()).padStart(2, '0');
      const minutes = String(expDate.getMinutes()).padStart(2, '0');
      const seconds = String(expDate.getSeconds()).padStart(2, '0');
      const day = String(expDate.getDate()).padStart(2, '0');
      const month = String(expDate.getMonth() + 1).padStart(2, '0');
      const year = expDate.getFullYear();

      const formattedExpTime = `${hours}:${minutes}:${seconds} ngày ${day}/${month}/${year}`;
      const timeLeftSeconds = expirationTime - currentTime;

      if (timeLeftSeconds > 60) {
        const remainMinutes = Math.floor(timeLeftSeconds / 60);
        const remainSeconds = timeLeftSeconds % 60;
        console.log(`⏳ Token hợp lệ! Sẽ hết hạn lúc: [${formattedExpTime}] (Còn lại khoảng ${remainMinutes} phút ${remainSeconds} giây).`);
        return true;
      } else if (timeLeftSeconds > 0) {
        console.log(`⚠️ Token sắp hết hạn lúc [${formattedExpTime}] (Chỉ còn ${timeLeftSeconds} giây), tiến hành đăng nhập lại.`);
        return false;
      } else {
        console.log(`❌ Token đã hết hạn từ lúc [${formattedExpTime}].`);
        return false;
      }
    } catch (e) {
      console.error('Lỗi khi phân tích token:', e.message);
      return false;
    }
  }

  /**
   * Đọc token đã lưu từ file JSON
   */
  loadSavedToken() {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (this.isTokenValid(data.token)) {
          this.token = data.token;
          this.client.defaults.headers['Authorization'] = `Bearer ${this.token}`;
          console.log('Đã khôi phục token hợp lệ từ file lưu trữ!');
          return true;
        }
      }
    } catch (error) {
      console.warn('Không thể đọc file token cũ:', error.message);
    }
    return false;
  }

  /**
   * Lưu token mới vào file JSON
   */
  saveToken(token) {
    try {
      fs.writeFileSync(this.tokenFilePath, JSON.stringify({ token, updatedAt: new Date() }, null, 2));
      console.log('Đã lưu token mới vào file.');
    } catch (error) {
      console.error('Không thể lưu token:', error.message);
    }
  }

  /**
   * Đăng nhập tự động tích hợp lấy Captcha và giải mã
   */
  async login(username, password) {
    try {
      console.log('Đang lấy Captcha để phục vụ đăng nhập...');
      const captchaData = await this.getCaptcha();
      const ckey = captchaData.key;
      
      const cvalue = await this.solveCaptcha(captchaData.content);

      const payload = { username, password, cvalue, ckey };
      console.log(`Đang thực hiện đăng nhập cho tài khoản: ${username}...`);

      const response = await this.client.post('/api/security-taxpayer/authenticate', payload, {
        headers: { 'request-id': uuidv4() }
      });
      
      const responseData = response.data;
      this.token = responseData.token;

      if (this.token) {
        console.log('Đăng nhập thành công!');
        this.client.defaults.headers['Authorization'] = `Bearer ${this.token}`;
        this.saveToken(this.token);
        return this.token;
      }
      return false;
    } catch (error) {
      console.error('Lỗi đăng nhập Tổng cục Thuế:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Lấy mã Captcha từ Tổng cục Thuế
   */
  async getCaptcha() {
    try {
      console.log('Đang lấy mã Captcha...');
      const response = await this.client.get('/api/captcha', {
        headers: {
          'action': '',
          'request-id': uuidv4(),
          'end-point': '/',
          'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
          'Cookie': `JSESSIONID=09A89179FF295CB1A22834B47F637E85; jwt=${this.token}`
        }
      });

      const data = response.data;
      console.log('Lấy Captcha thành công! Key nhận được:', data.key);
      return data;
    } catch (error) {
      console.error('Lỗi khi lấy mã Captcha:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gửi ảnh captcha sang dịch vụ autocaptcha.pro để giải mã tự động
   */
  async solveCaptcha(imageBase64) {
    try {
      console.log('Đang gửi ảnh captcha sang autocaptcha.pro để giải...');
      const response = await axios.post('https://autocaptcha.pro/apiv3/process', {
        key: "a358b2d579bbb84c13c5fd7b4d4273fc",
        type: 'imagetotext',
        img: imageBase64,
        module: 'common',
        casesensitive: false
      });

      if (response && response.data && response.data.success === true) {
        const captchaText = response.data.captcha;
        console.log(`Giải captcha thành công! Kết quả: [${captchaText}]`);
        return captchaText;
      }

      const errorMsg = response?.data?.message || 'Không rõ nguyên nhân';
      throw new Error(`Giải captcha thất bại: ${errorMsg}`);
    } catch (error) {
      console.error('Lỗi khi gọi dịch vụ giải captcha:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Lấy TOÀN BỘ hóa đơn bán ra (Tự động lặp qua tất cả các trang)
   */
  async getSoldInvoices(fromDate = null, toDate = null, size = 15, sort = 'tdlap:desc') {
    try {
      // Hàm phụ trợ để chuyển đổi đầu vào (Date object hoặc chuỗi ngày) thành định dạng mong muốn
      const formatCustomDate = (inputDate, isEndDay = false) => {
        const date = inputDate ? new Date(inputDate) : new Date();
        
        // Đặt giờ, phút, giây, mili-giây tùy theo là ngày bắt đầu hay kết thúc
        if (isEndDay) {
          date.setHours(23, 59, 59, 999);
        } else {
          date.setHours(0, 0, 0, 0);
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${day}/${month}/${year}T${hours}:${minutes}:${seconds}`;
      };

      // Xử lý ngày kết thúc (mặc định là cuối ngày hiện tại nếu không truyền)
      if (!toDate) {
        toDate = formatCustomDate(null, true);
      } else {
        toDate = formatCustomDate(toDate, true);
      }

      // Xử lý ngày bắt đầu (mặc định lùi lại 1 tháng, lấy đầu ngày nếu không truyền)
      if (!fromDate) {
        const pastDate = new Date();
        pastDate.setMonth(pastDate.getMonth() - 1);
        fromDate = formatCustomDate(pastDate, false);
      } else {
        fromDate = formatCustomDate(fromDate, false);
      }

      const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate}`;
      console.log(`Đang tải toàn bộ hóa đơn bán ra từ ${fromDate} đến ${toDate}...`);

      let allDatas = [];
      let currentState = null;
      let hasMore = true;
      let page = 1;

      while (hasMore) {
        const params = { sort, size, search: searchQuery };
        if (currentState) params.state = currentState;

        const response = await this.client.get('/api/query/invoices/sold', {
          params: params,
          headers: {
            'action': 'Tìm kiếm (hóa đơn bán ra)',
            'accept-language': 'vi',
            'request-id': uuidv4(),
            'end-point': '/tra-cuu/tra-cuu-hoa-don',
            'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
            'Cookie': `JSESSIONID=09A89179FF295CB1A22834B47F637E85; jwt=${this.token}`
          }
        });

        if (response.status === 401) {
          console.log('Lỗi xác thực tài khoản');
          return {
            success: false,
            code: 401,
            message: 'Lỗi xác thực tài khoản'
          };
        }

        const result = response.data;
        if (result && result.datas && result.datas.length > 0) {
          allDatas.push(...result.datas);
          console.log(`-> Tải trang ${page}: thu về ${result.datas.length} hóa đơn. (Đã lấy: ${allDatas.length}/${result.total})`);

          // 🛑 Nghỉ 1.5 giây giữa các trang để chống lỗi 429
          await this.sleep(1500);

          if (result.state && allDatas.length < result.total) {
            currentState = result.state;
            page++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`🎉 Đã lấy xong toàn bộ ${allDatas.length} hóa đơn bán ra!`);
      return {
        success: true,
        code: 1,
        message: 'Thành công',
        data: allDatas
      };
    } catch (error) {
      return {
        success: false,
        code: 500,
        message: error.message
      };
    }
  }

  /**
   * Lấy TOÀN BỘ hóa đơn mua vào (Tự động lặp qua tất cả các trang)
   */
  async getPurchaseInvoices(fromDate = null, toDate = null, size = 15, sort = 'tdlap:desc') {
    try {
      // Hàm phụ trợ để chuyển đổi đầu vào (Date object hoặc chuỗi ngày) thành định dạng mong muốn
      const formatCustomDate = (inputDate, isEndDay = false) => {
        const date = inputDate ? new Date(inputDate) : new Date();
        
        // Đặt giờ, phút, giây, mili-giây tùy theo là ngày bắt đầu hay kết thúc
        if (isEndDay) {
          date.setHours(23, 59, 59, 999);
        } else {
          date.setHours(0, 0, 0, 0);
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${day}/${month}/${year}T${hours}:${minutes}:${seconds}`;
      };

      // Xử lý ngày kết thúc (mặc định là cuối ngày hiện tại nếu không truyền)
      if (!toDate) {
        toDate = formatCustomDate(null, true);
      } else {
        toDate = formatCustomDate(toDate, true);
      }

      // Xử lý ngày bắt đầu (mặc định lùi lại 1 tháng, lấy đầu ngày nếu không truyền)
      if (!fromDate) {
        const pastDate = new Date();
        pastDate.setMonth(pastDate.getMonth() - 1);
        fromDate = formatCustomDate(pastDate, false);
      } else {
        fromDate = formatCustomDate(fromDate, false);
      }

      const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate};ttxly==5`;
      console.log(`Đang tải toàn bộ hóa đơn mua vào từ ${fromDate} đến ${toDate}...`);

      let allDatas = [];
      let currentState = null;
      let hasMore = true;
      let page = 1;

      while (hasMore) {
        const params = { sort, size, search: searchQuery };
        if (currentState) params.state = currentState;

        const response = await this.client.get('/api/query/invoices/purchase', {
          params: params,
          headers: {
            'action': 'Tìm kiếm (hóa đơn mua vào)',
            'accept-language': 'vi',
            'request-id': uuidv4(),
            'end-point': '/tra-cuu/tra-cuu-hoa-don',
            'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
            'Cookie': `JSESSIONID=09A89179FF295CB1A22834B47F637E85; jwt=${this.token}`
          }
        });

        if (response.status === 401) {
          console.log('Lỗi xác thực tài khoản');
          return {
            success: false,
            code: 401,
            message: 'Lỗi xác thực tài khoản'
          };
        }

        const result = response.data;
        if (result && result.datas && result.datas.length > 0) {
          allDatas.push(...result.datas);
          console.log(`-> Tải trang ${page}: thu về ${result.datas.length} hóa đơn. (Đã lấy: ${allDatas.length}/${result.total})`);

          // 🛑 Nghỉ 1.5 giây giữa các trang để chống lỗi 429
          await this.sleep(1500);

          if (result.state && allDatas.length < result.total) {
            currentState = result.state;
            page++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`🎉 Đã lấy xong toàn bộ ${allDatas.length} hóa đơn mua vào!`);
      return {
        success: true,
        code: 1,
        message: 'Thành công',
        data: allDatas
      };
    } catch (error) {
      console.error('Lỗi khi tải toàn bộ hóa đơn mua vào:', error.response?.data || error.message);
      return {
        success: false,
        code: 500,
        message: error.message
      };
    }
  }

  /**
   * Lấy TOÀN BỘ hóa đơn máy tính tiền (Dùng this.client.get trực tiếp, lấy Captcha mới cho mỗi trang)
   */
  async getPurchaseFromCashRegister(fromDate = null, toDate = null, ttxly = 8, size = 15, sort = 'tdlap:desc') {
    try {
      // Hàm phụ trợ để chuyển đổi đầu vào (Date object hoặc chuỗi ngày) thành định dạng mong muốn
      const formatCustomDate = (inputDate, isEndDay = false) => {
        const date = inputDate ? new Date(inputDate) : new Date();
        
        // Đặt giờ, phút, giây, mili-giây tùy theo là ngày bắt đầu hay kết thúc
        if (isEndDay) {
          date.setHours(23, 59, 59, 999);
        } else {
          date.setHours(0, 0, 0, 0);
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${day}/${month}/${year}T${hours}:${minutes}:${seconds}`;
      };

      // Xử lý ngày kết thúc (mặc định là cuối ngày hiện tại nếu không truyền)
      if (!toDate) {
        toDate = formatCustomDate(null, true);
      } else {
        toDate = formatCustomDate(toDate, true);
      }

      // Xử lý ngày bắt đầu (mặc định lùi lại 1 tháng, lấy đầu ngày nếu không truyền)
      if (!fromDate) {
        const pastDate = new Date();
        pastDate.setMonth(pastDate.getMonth() - 1);
        fromDate = formatCustomDate(pastDate, false);
      } else {
        fromDate = formatCustomDate(fromDate, false);
      }

      const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate};ttxly==${ttxly}`;
      console.log(`Đang tải toàn bộ hóa đơn máy tính tiền từ ${fromDate} đến ${toDate} (ttxly==${ttxly})...`);

      let allDatas = [];
      let currentState = null;
      let hasMore = true;
      let page = 1;

      while (hasMore) {
        // Lấy Captcha mới cho mỗi trang để tránh lỗi 401 do captcha chỉ dùng được 1 lần
        console.log(`Đang lấy Captcha mới cho trang ${page} (hóa đơn máy tính tiền ttxly==${ttxly})...`);
        const captchaData = await this.getCaptcha();
        const ckey = captchaData.key;
        const cvalue = await this.solveCaptcha(captchaData.content);

        const params = { 
          sort, 
          size, 
          search: searchQuery,
          ckey: ckey,
          cvalue: cvalue
        };
        if (currentState) params.state = currentState;

        const response = await this.client.get('/api/sco-query/invoices/purchase', {
          params: params,
          headers: {
            'ckey': ckey,
            'cvalue': cvalue,
            'action': ttxly === 5 ? 'Tìm kiếm (hóa đơn máy tính tiền đã cấp mã)' : 'Tìm kiếm (hóa đơn máy tính tiền mua vào)',
            'accept-language': 'vi',
            'request-id': uuidv4(),
            'end-point': '/tra-cuu/tra-cuu-hoa-don',
            'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don'
          }
        });

        if (response.status === 401) {
          console.log('Lỗi xác thực tài khoản');
          return {
            success: false,
            code: 401,
            message: 'Lỗi xác thực tài khoản'
          };
        }

        const result = response.data;
        if (result && result.datas && result.datas.length > 0) {
          allDatas.push(...result.datas);
          console.log(`-> Tải trang ${page}: thu về ${result.datas.length} hóa đơn. (Đã lấy: ${allDatas.length}/${result.total})`);

          // Nghỉ 1.5 giây giữa các trang để chống lỗi 429
          await this.sleep(1500);

          if (result.state && allDatas.length < result.total) {
            currentState = result.state;
            page++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`🎉 Đã lấy xong toàn bộ ${allDatas.length} hóa đơn máy tính tiền (ttxly==${ttxly})!`);
      return {
        success: true,
        code: 1,
        message: 'Thành công',
        data: allDatas
      };
    } catch (error) {
      console.error(`Lỗi khi tải toàn bộ hóa đơn máy tính tiền (ttxly==${ttxly}):`, error.response?.data || error.message);
      return {
        success: false,
        code: 500,
        message: error.message
      };
    }
  }

  /**
   * Lấy thông tin chi tiết hóa đơn (Hỗ trợ bán ra, mua vào thông thường và máy tính tiền)
   */
  async getInvoiceDetail(nbmst, khhdon, shdon, khmshdon, type = 'sold') {
    try {
      let endpoint = '/api/query/invoices/detail';
      let actionName = 'Xem hóa đơn (hóa đơn bán ra)';

      if (type === 'purchase') {
        endpoint = '/api/query/invoices/detail';
        actionName = 'Xem hóa đơn (hóa đơn mua vào)';
      } else if (type === 'sco') {
        endpoint = '/api/sco-query/invoices/detail';
        actionName = 'Xem hóa đơn (hóa đơn máy tính tiền mua vào)';
      }

      console.log(`Đang lấy chi tiết hóa đơn [${type.toUpperCase()}]: MST=${nbmst}, Ký hiệu=${khhdon}, Số=${shdon}...`);

      const response = await this.client.get(endpoint, {
        params: { nbmst, khhdon, shdon, khmshdon },
        headers: {
          'action': actionName,
          'accept-language': 'vi',
          'request-id': uuidv4(),
          'end-point': '/tra-cuu/tra-cuu-hoa-don',
          'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
          'Cookie': `JSESSIONID=09A89179FF295CB1A22834B47F637E85; jwt=${this.token}`
        }
      });

      // 🛑 Nghỉ nhẹ 800ms sau khi lấy chi tiết mỗi hóa đơn để giảm tải cho API server
      await this.sleep(800);

      console.log('Lấy chi tiết hóa đơn thành công!');
      return response.data;
    } catch (error) {
      console.error('Lỗi khi lấy chi tiết hóa đơn:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Lấy danh sách hóa đơn liên quan đối với Hóa đơn máy tính tiền (SCO)
   * @param {string} nbmst - Mã số thuế người bán
   * @param {number|string} khmshdon - Ký hiệu mẫu số hóa đơn
   * @param {string} khhdon - Ký hiệu hóa đơn
   * @param {number|string} shdon - Số hóa đơn
   * @returns {Promise<Array>} Mảng các hóa đơn liên quan (hoặc mảng trống [] nếu không có)
   */
  async getScoRelativeInvoices(nbmst, khmshdon, khhdon, shdon) {
    try {
      console.log(`Đang lấy hóa đơn máy tính tiền liên quan cho: MST=${nbmst}, Ký hiệu mẫu=${khmshdon}, Ký hiệu HĐ=${khhdon}, Số=${shdon}...`);

      const response = await this.client.get('/api/sco-query/invoices/relative', {
        params: { nbmst, khmshdon, khhdon, shdon },
        headers: {
          'action': 'Xem hóa đơn liên quan (hóa đơn máy tính tiền mua vào)',
          'accept-language': 'vi',
          'request-id': uuidv4(),
          'end-point': '/tra-cuu/tra-cuu-hoa-don',
          'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don'
        }
      });

      await this.sleep(800); // Nghỉ nhẹ tránh rate limit

      const data = response.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log(`-> Tìm thấy ${data.length} hóa đơn máy tính tiền liên quan.`);
      } else {
        console.log('-> Không có hóa đơn máy tính tiền liên quan nào.');
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Lỗi khi lấy hóa đơn máy tính tiền liên quan:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Lấy danh sách hóa đơn liên quan (ví dụ: hóa đơn thay thế, điều chỉnh cho hóa đơn gốc)
   * @param {string} nbmst - Mã số thuế người bán
   * @param {number|string} khmshdon - Ký hiệu mẫu số hóa đơn
   * @param {string} khhdon - Ký hiệu hóa đơn
   * @param {number|string} shdon - Số hóa đơn
   * @param {string} type - Loại hóa đơn ('sold' hoặc 'purchase')
   * @returns {Promise<Array>} Mảng các hóa đơn liên quan (hoặc mảng trống [] nếu không có)
   */
  async getRelativeInvoices(nbmst, khmshdon, khhdon, shdon, type = 'sold') {
    try {
      const actionName = type === 'purchase' 
        ? 'Xem hóa đơn liên quan (hóa đơn mua vào)' 
        : 'Xem hóa đơn liên quan (hóa đơn bán ra)';

      console.log(`Đang lấy hóa đơn liên quan cho: MST=${nbmst}, Ký hiệu mẫu=${khmshdon}, Ký hiệu HĐ=${khhdon}, Số=${shdon}...`);

      const response = await this.client.get('/api/query/invoices/relative', {
        params: { nbmst, khmshdon, khhdon, shdon },
        headers: {
          'action': actionName,
          'accept-language': 'vi',
          'request-id': uuidv4(),
          'end-point': '/tra-cuu/tra-cuu-hoa-don',
          'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don'
        }
      });

      // Nghỉ nhẹ sau khi gọi API để tránh dính rate limit
      await this.sleep(800);

      const data = response.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log(`-> Tìm thấy ${data.length} hóa đơn liên quan.`);
      } else {
        console.log('-> Không có hóa đơn liên quan nào.');
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Lỗi khi lấy hóa đơn liên quan:', error.response?.data || error.message);
      // Trả về mảng rỗng để không làm crash luồng chính nếu hóa đơn không có liên quan hoặc lỗi phát sinh
      return [];
    }
  }
}

module.exports = TaxService;