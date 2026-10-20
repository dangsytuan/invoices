const express = require('express');
const router = express.Router();
const axios = require('axios');

const getCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, cvalue, ckey } = req.body;
    console.log(ckey, cvalue);
    if (!username || !password || !cvalue || !ckey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin đăng nhập hoặc mã Captcha!' 
      });
    }

    const payload = {
      username: username.trim(),
      password: password,
      cvalue: cvalue.trim().toUpperCase(),
      ckey: ckey,
    };

    const response = await fetch('https://hoadondientu.gdt.gov.vn/api/security-taxpayer/authenticate', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'action': '',
          'end-point': '/',
          'request-id': 'aad6a6f5-827c-4787-87fb-a400bef6c186',
          'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
          'origin': 'https://hoadondientu.gdt.gov.vn',
          'referer': 'https://hoadondientu.gdt.gov.vn/'
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if(!data || !data.token){
        return res.status(response.status).json({
            success: false,
            message: 'Xác thực thất bại từ cơ quan thuế',
            error: data
        });
    }

    const token = data.token;
    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'Thành công',
    });

  } catch (error) {
    console.error('Lỗi đăng nhập hóa đơn điện tử:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống nội bộ', 
      error: error.message 
    });
  }
});

module.exports = router;