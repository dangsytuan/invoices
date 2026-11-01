const express = require('express');
const router = express.Router();
const TaxService = require('../services/TaxService');

const taxService = new TaxService();

taxService.loadSavedToken();

/**
 * @route   POST /api/tax/login
 * @desc    Đăng nhập vào hệ thống Tổng cục Thuế (Tự động giải Captcha)
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp username và password!' });
    }

    const token = await taxService.login(username, password);
    if (token) {
      return res.json({ success: true, message: 'Đăng nhập thành công!', token });
    }
    
    return res.status(401).json({ success: false, message: 'Đăng nhập thất bại!' });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi server khi đăng nhập', 
      error: error.response?.data || error.message 
    });
  }
});

/**
 * @route   GET /api/tax/invoices/sold
 * @desc    Lấy danh sách hóa đơn bán ra
 * @query   fromDate, toDate, size, sort
 */
router.get('/invoices/sold', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    
    // Kiểm tra xem đã có token chưa
    if (!taxService.token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token đã hết hạn. Vui lòng gọi API /login trước!' });
    }

    const invoices = await taxService.getSoldInvoices(
      fromDate || null, 
      toDate || null
    );

    return res.json({ success: true, total: invoices.length, data: invoices });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy hóa đơn bán ra', 
      error: error.response?.data || error.message 
    });
  }
});

/**
 * @route   GET /api/tax/invoices/purchase
 * @desc    Lấy danh sách hóa đơn mua vào
 * @query   fromDate, toDate, size, sort
 */
router.get('/invoices/purchase', async (req, res) => {
  try {
    const { fromDate, toDate, size, sort } = req.query;

    if (!taxService.token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token đã hết hạn!' });
    }

    const invoices = await taxService.getPurchaseInvoices(
      fromDate || null, 
      toDate || null, 
      size ? parseInt(size) : 15, 
      sort || 'tdlap:desc'
    );

    return res.json({ success: true, total: invoices.length, data: invoices });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy hóa đơn mua vào', 
      error: error.response?.data || error.message 
    });
  }
});

/**
 * @route   GET /api/tax/invoices/cash-register
 * @desc    Lấy danh sách hóa đơn máy tính tiền (SCO)
 * @query   fromDate, toDate, ttxly, size, sort
 */
router.get('/invoices/cash-register', async (req, res) => {
  try {
    const { fromDate, toDate, ttxly, size, sort } = req.query;

    if (!taxService.token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token đã hết hạn!' });
    }

    const invoices = await taxService.getPurchaseFromCashRegister(
      fromDate || null, 
      toDate || null, 
      ttxly ? parseInt(ttxly) : 8, 
      size ? parseInt(size) : 15, 
      sort || 'tdlap:desc'
    );

    return res.json({ success: true, total: invoices.length, data: invoices });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy hóa đơn máy tính tiền', 
      error: error.response?.data || error.message 
    });
  }
});

/**
 * @route   GET /api/tax/invoices/detail
 * @desc    Lấy thông tin chi tiết một hóa đơn cụ thể
 * @query   nbmst, khhdon, shdon, khmshdon, type ('sold' | 'purchase' | 'sco')
 */
router.get('/invoices/detail', async (req, res) => {
  try {
    const { nbmst, khhdon, shdon, khmshdon, type } = req.query;

    if (!nbmst || !khhdon || !shdon || !khmshdon) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: nbmst, khhdon, shdon, khmshdon!' });
    }

    if (!taxService.token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token đã hết hạn!' });
    }

    const detail = await taxService.getInvoiceDetail(nbmst, khhdon, shdon, khmshdon, type || 'sold');
    return res.json({ success: true, data: detail });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy chi tiết hóa đơn', 
      error: error.response?.data || error.message 
    });
  }
});

/**
 * @route   GET /api/tax/invoices/relative
 * @desc    Lấy danh sách hóa đơn liên quan (thay thế, điều chỉnh...)
 * @query   nbmst, khmshdon, khhdon, shdon, type ('sold' | 'purchase' | 'sco')
 */
router.post('/invoices/relative', async (req, res) => {
  try {
    // Lấy dữ liệu từ req.body thay vì req.query
    const { nbmst, khmshdon, khhdon, shdon, type } = req.body;

    if (!nbmst || !khmshdon || !khhdon || !shdon) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: nbmst, khmshdon, khhdon, shdon!' });
    }

    if (!taxService.token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token đã hết hạn!' });
    }

    let relatives = [];
    if (type === 'sco') {
      relatives = await taxService.getScoRelativeInvoices(nbmst, khmshdon, khhdon, shdon);
    } else {
      relatives = await taxService.getRelativeInvoices(nbmst, khmshdon, khhdon, shdon, type || 'sold');
    }

    return res.json({ success: true, total: relatives.length, data: relatives });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy hóa đơn liên quan', 
      error: error.response?.data || error.message 
    });
  }
});

module.exports = router;