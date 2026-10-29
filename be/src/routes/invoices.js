const express = require('express');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route   GET /api/invoices
 * @desc    Lấy danh sách hóa đơn (có hỗ trợ lọc theo type, phân trang)
 * @query   type (INBOUND | OUTBOUND), page (mặc định 1), limit (mặc định 10)
 */
router.get('/', async (req, res) => {
  try {
    // 1. Lấy đầy đủ các query params từ request gửi lên
    const { type, search, status, page = 1, limit = 50 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Xây dựng điều kiện lọc (where) cho Prisma
    const where = {};

    // 2. Lọc theo loại hóa đơn (INBOUND / OUTBOUND) nếu có
    if (type && type !== 'ALL') {
      where.type = type;
    }

    // 3. Lọc theo trạng thái hóa đơn (tthai) nếu có và khác 'ALL'
    if (status && status !== 'ALL') {
      // Ép kiểu sang Number vì tthai trong DB thường là kiểu Int
      where.tthai = Number(status);
    }

    // 4. Lọc theo từ khóa tìm kiếm (tìm trong Tên người bán, MST người bán, Tên người mua, MST người mua, Số hóa đơn)
    if (search && search.trim() !== '') {
      const keyword = search.trim();
      where.OR = [
        { nbten: { contains: keyword, mode: 'insensitive' } },
        { nbmst: { contains: keyword, mode: 'insensitive' } },
        { nmten: { contains: keyword, mode: 'insensitive' } },
        { nmmst: { contains: keyword, mode: 'insensitive' } },
        { khhdon: { contains: keyword, mode: 'insensitive' } },
      ];
      
      // Nếu số hóa đơn là dạng số (Int trong Prisma), ta kiểm tra thêm nếu keyword là số
      const numKeyword = Number(keyword);
      if (!isNaN(numKeyword)) {
        where.OR.push({ shdon: numKeyword });
      }
    }

    // Truy vấn Database đồng thời đếm tổng và lấy dữ liệu phân trang
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { details: true },
        orderBy: { tdlap: 'desc' },
        skip,
        take,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

/**
 * @route   GET /api/invoices/:id
 * @desc    Lấy chi tiết một hóa đơn theo ID kèm theo danh sách sản phẩm chi tiết
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        details: true,
        stockTransactions: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }

    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

/**
 * @route   DELETE /api/invoices/:id
 * @desc    Xóa một hóa đơn (các bảng liên quan như InvoiceDetail sẽ tự động xóa nhờ onDelete: Cascade)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!existingInvoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn để xóa' });
    }

    await prisma.invoice.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Đã xóa hóa đơn thành công',
    });
  } catch (error) {
    console.error('Lỗi khi xóa hóa đơn:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
  }
});

router.post('/pull/purchase', async (req, res) => {
    try {
        const { 
            fromDate = '30/09/2026T00:00:00', 
            toDate = '29/10/2026T23:59:59', 
            size = 15, 
            sort = 'tdlap:desc',
            ttxly = 5 
        } = req.body || {};

        const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate};ttxly==${ttxly}`;
        const queryParams = { sort, size, search: searchQuery };
        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/purchase?${queryString}`;

        const bearerToken = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkzMzcyNjk1LCJpYXQiOjE3OTMyODYyOTV9.y04VM9WymA96lAi_ma5AbhhiEIl4yB1Pj63C8rnpY72yKIwXeU2rNTLJ3y7BBeqfPZolnlGHfN7EEaZBAmMM1A';

        // Gom toàn bộ cookie từ raw data vào một chuỗi phân tách bằng dấu chấm phẩy (;)
        const cookieString = [
            '_ga=GA1.3.509527361.1785485458',
            '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
            'df9a7b9f11f13b2b359e1a94557637ae=d7dd004345b5be097652dbfc7a9fd6c5',
            'f5avraaaaaaaaaaaaaaaa_session_=OFCLEAGHIPGNHMDGDMPDALEAPDIGKAHMECMFDHIGFOMFBDMOBHJOIIHIBHCFOLNEOICDEMBHJAFGBIFNGOEADLOLDGMFMDMFHLDFFLHFILBCFDHJACBFIPBKPEGAKDDI',
            'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
            'e1a565439633aacdd764ec3e73b3cc09=c4268cd5943d3844895946d4c89749bf',
            'JSESSIONID=EE7186A2B0AFCE64AE6BFAF86D371046',
            'TS0114b13e=011c0ae740959ec8427b0f2d2923662c0db21e5567f9bec84524896045f9db3756b2cde4ed12ff3bfd4d430e881f63567ef30cd03a23c38f53e366ea4e23b29b7065c49059eb49a81c4c1fa48922bdd01921f5781eed732545caf7f2064706a77aaa19bd5e9470964f1807d035ed67f64133275fce1e16ed50ffd15a0f73f75b822c520c523e47685f4a2aa976bee9a7ea968fcbf0',
            `jwt=${bearerToken}`
        ].join('; ');

        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                'authority': 'hoadondientu.gdt.gov.vn',
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'vi',
                'authorization': `Bearer ${bearerToken}`,
                'cookie': cookieString,
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
                'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
                'action': 'Tìm kiếm (hóa đơn mua vào)',
                'end-point': '/tra-cuu/tra-cuu-hoa-don',
                'request-id': uuidv4(), // Tạo một UUID mới mỗi lần gọi API
                'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin'
            }
        });

        return res.status(200).json({
            success: true,
            data: gdtResponse.data
        });

    } catch (error) {
        console.error('Lỗi:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

router.post('/pull/sold', async (req, res) => {
    try {
        // 1. Lấy tham số từ body request (hoặc dùng giá trị mặc định)
        const { 
            fromDate = '30/09/2026T00:00:00', 
            toDate = '29/10/2026T23:59:59', 
            size = 15, 
            sort = 'tdlap:desc'
        } = req.body || {};

        // 2. Xây dựng chuỗi tìm kiếm riêng cho hóa đơn bán ra (không bắt buộc ttxly)
        const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate}`;
        const queryParams = { 
            sort: sort, 
            size: size, 
            search: searchQuery 
        };

        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/sold?${queryString}`;

        // 3. Cấu hình Token và Cookie
        const bearerToken = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkzMzcyNjk1LCJpYXQiOjE3OTMyODYyOTV9.y04VM9WymA96lAi_ma5AbhhiEIl4yB1Pj63C8rnpY72yKIwXeU2rNTLJ3y7BBeqfPZolnlGHfN7EEaZBAmMM1A';

        const cookieString = [
            '_ga=GA1.3.509527361.1785485458',
            '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
            'df9a7b9f11f13b2b359e1a94557637ae=d7dd004345b5be097652dbfc7a9fd6c5',
            'f5avraaaaaaaaaaaaaaaa_session_=OFCLEAGHIPGNHMDGDMPDALEAPDIGKAHMECMFDHIGFOMFBDMOBHJOIIHIBHCFOLNEOICDEMBHJAFGBIFNGOEADLOLDGMFMDMFHLDFFLHFILBCFDHJACBFIPBKPEGAKDDI',
            'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
            'e1a565439633aacdd764ec3e73b3cc09=c4268cd5943d3844895946d4c89749bf',
            'JSESSIONID=EE7186A2B0AFCE64AE6BFAF86D371046',
            'TS0114b13e=011c0ae740959ec8427b0f2d2923662c0db21e5567f9bec84524896045f9db3756b2cde4ed12ff3bfd4d430e881f63567ef30cd03a23c38f53e366ea4e23b29b7065c49059eb49a81c4c1fa48922bdd01921f5781eed732545caf7f2064706a77aaa19bd5e9470964f1807d035ed67f64133275fce1e16ed50ffd15a0f73f75b822c520c523e47685f4a2aa976bee9a7ea968fcbf0',
            `jwt=${bearerToken}`
        ].join('; ');

        // 4. Gọi Axios sang cổng Tổng cục Thuế với đầy đủ headers chuẩn
        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                'authority': 'hoadondientu.gdt.gov.vn',
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'vi',
                'authorization': `Bearer ${bearerToken}`,
                'cookie': cookieString,
                'action': 'Tìm kiếm (hóa đơn bán ra)', // Đặc thù riêng của sold
                'end-point': '/tra-cuu/tra-cuu-hoa-don',
                'request-id': uuidv4(), // Sinh request-id mới mỗi lần gọi
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
                'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
                'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin'
            }
        });

        const invoiceData = gdtResponse.data;

        // 5. TODO: Viết logic insert/upsert vào bảng hóa đơn bán ra (sold_invoices) của bạn ở đây

        return res.status(200).json({
            success: true,
            type: 'sold',
            total: invoiceData.total || (Array.isArray(invoiceData.data) ? invoiceData.data.length : 0),
            data: invoiceData
        });

    } catch (error) {
        console.error('Lỗi kéo hóa đơn bán ra:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

router.post('/detail', async (req, res) => {
    try {
        // Lấy các tham số từ JSON Body (thay vì req.query)
        const { nbmst, khhdon, shdon, khmshdon } = req.body || {};

        // Kiểm tra bắt buộc các tham số tối thiểu
        if (!nbmst || !khhdon || !shdon || !khmshdon) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: nbmst, khhdon, shdon, khmshdon'
            });
        }

        const queryParams = { nbmst, khhdon, shdon, khmshdon };
        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?${queryString}`;

        const bearerToken = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkzMzcyNjk1LCJpYXQiOjE3OTMyODYyOTV9.y04VM9WymA96lAi_ma5AbhhiEIl4yB1Pj63C8rnpY72yKIwXeU2rNTLJ3y7BBeqfPZolnlGHfN7EEaZBAmMM1A';

        const cookieString = [
            '_ga=GA1.3.509527361.1785485458',
            '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
            'df9a7b9f11f13b2b359e1a94557637ae=d7dd004345b5be097652dbfc7a9fd6c5',
            'f5avraaaaaaaaaaaaaaaa_session_=OFCLEAGHIPGNHMDGDMPDALEAPDIGKAHMECMFDHIGFOMFBDMOBHJOIIHIBHCFOLNEOICDEMBHJAFGBIFNGOEADLOLDGMFMDMFHLDFFLHFILBCFDHJACBFIPBKPEGAKDDI',
            'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
            'e1a565439633aacdd764ec3e73b3cc09=c4268cd5943d3844895946d4c89749bf',
            'JSESSIONID=EE7186A2B0AFCE64AE6BFAF86D371046',
            'TS0114b13e=011c0ae740959ec8427b0f2d2923662c0db21e5567f9bec84524896045f9db3756b2cde4ed12ff3bfd4d430e881f63567ef30cd03a23c38f53e366ea4e23b29b7065c49059eb49a81c4c1fa48922bdd01921f5781eed732545caf7f2064706a77aaa19bd5e9470964f1807d035ed67f64133275fce1e16ed50ffd15a0f73f75b822c520c523e47685f4a2aa976bee9a7ea968fcbf0',
            `jwt=${bearerToken}`
        ].join('; ');

        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                'authority': 'hoadondientu.gdt.gov.vn',
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'vi',
                'authorization': `Bearer ${bearerToken}`,
                'cookie': cookieString,
                'action': 'Xem hóa đơn (hóa đơn bán ra)',
                'end-point': '/tra-cuu/tra-cuu-hoa-don',
                'request-id': uuidv4(),
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
                'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
                'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin'
            }
        });

        return res.status(200).json({
            success: true,
            data: gdtResponse.data
        });

    } catch (error) {
        console.error('Lỗi lấy chi tiết hóa đơn:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

router.post('/sync/sold', async (req, res) => {
    try {
        // 1. Lấy tham số từ body request (hoặc dùng giá trị mặc định)
        const { 
            fromDate = '30/09/2026T00:00:00', 
            toDate = '29/10/2026T23:59:59', 
            size = 15, 
            sort = 'tdlap:desc'
        } = req.body || {};

        // 2. Xây dựng chuỗi tìm kiếm hóa đơn bán ra
        const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate}`;
        const queryParams = { 
            sort: sort, 
            size: size, 
            search: searchQuery 
        };

        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/sold?${queryString}`;

        // 3. Cấu hình Token và Cookie
        const bearerToken = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkzMzcyNjk1LCJpYXQiOjE3OTMyODYyOTV9.y04VM9WymA96lAi_ma5AbhhiEIl4yB1Pj63C8rnpY72yKIwXeU2rNTLJ3y7BBeqfPZolnlGHfN7EEaZBAmMM1A';

        const cookieString = [
            '_ga=GA1.3.509527361.1785485458',
            '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
            'df9a7b9f11f13b2b359e1a94557637ae=d7dd004345b5be097652dbfc7a9fd6c5',
            'f5avraaaaaaaaaaaaaaaa_session_=OFCLEAGHIPGNHMDGDMPDALEAPDIGKAHMECMFDHIGFOMFBDMOBHJOIIHIBHCFOLNEOICDEMBHJAFGBIFNGOEADLOLDGMFMDMFHLDFFLHFILBCFDHJACBFIPBKPEGAKDDI',
            'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
            'e1a565439633aacdd764ec3e73b3cc09=c4268cd5943d3844895946d4c89749bf',
            'JSESSIONID=EE7186A2B0AFCE64AE6BFAF86D371046',
            'TS0114b13e=011c0ae740959ec8427b0f2d2923662c0db21e5567f9bec84524896045f9db3756b2cde4ed12ff3bfd4d430e881f63567ef30cd03a23c38f53e366ea4e23b29b7065c49059eb49a81c4c1fa48922bdd01921f5781eed732545caf7f2064706a77aaa19bd5e9470964f1807d035ed67f64133275fce1e16ed50ffd15a0f73f75b822c520c523e47685f4a2aa976bee9a7ea968fcbf0',
            `jwt=${bearerToken}`
        ].join('; ');

        // Chuẩn bị headers chung cho axios
        const baseHeaders = {
            'authority': 'hoadondientu.gdt.gov.vn',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'vi',
            'authorization': `Bearer ${bearerToken}`,
            'cookie': cookieString,
            'end-point': '/tra-cuu/tra-cuu-hoa-don',
            'request-id': uuidv4(),
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
            'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
            'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };

        // 4. Gọi API lấy danh sách hóa đơn bán ra từ GDT
        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                ...baseHeaders,
                'action': 'Tìm kiếm (hóa đơn bán ra)'
            }
        });

        const responseData = gdtResponse.data;
        const invoicesList = responseData?.datas || [];

        let insertedCount = 0;
        let skippedCount = 0;

        // 5. Duyệt qua danh sách hóa đơn vừa kéo về để lưu vào DB
        for (const item of invoicesList) {
            const nbmst = item.nbmst;
            const khmshdon = Number(item.khmshdon || 1);
            const khhdon = item.khhdon;
            const shdon = Number(item.shdon);

            // Kiểm tra xem hóa đơn đã tồn tại trong DB chưa
            const existingInvoice = await prisma.invoice.findFirst({
                where: {
                    nbmst: nbmst,
                    khmshdon: khmshdon,
                    khhdon: khhdon,
                    shdon: shdon
                }
            });

            if (existingInvoice) {
                skippedCount++;
                continue; // Đã có rồi thì bỏ qua
            }

            // 6. Nếu chưa có -> Gọi API lấy chi tiết sản phẩm của hóa đơn này
            const detailQueryParams = { nbmst, khhdon, shdon, khmshdon };
            const detailQueryString = qs.stringify(detailQueryParams, { encode: false });
            const detailUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?${detailQueryString}`;

            const detailResponse = await axios.get(detailUrl, {
                headers: {
                    ...baseHeaders,
                    'action': 'Xem hóa đơn (hóa đơn bán ra)'
                }
            });

            const detailData = detailResponse.data || {};
            const itemsList = detailData.hdhhdvu || detailData.items || [];

            // 7. Lưu vào DB thông qua Prisma Transaction
            await prisma.$transaction(async (tx) => {
                const newInvoice = await tx.invoice.create({
                    data: {
                        type: 'OUTBOUND', // Hóa đơn bán ra
                        nbmst: item.nbmst || '',
                        nbten: item.nbten || '',
                        nmmst: item.nmmst || '',
                        nmten: item.nmten || '',
                        khmshdon: khmshdon,
                        khhdon: khhdon,
                        shdon: shdon,
                        hdon: item.hdon || '01',
                        thdon: item.thdon || 'Hóa đơn giá trị gia tăng',
                        tthai: Number(item.tthai || 1),
                        cqt: item.cqt || null,
                        hsgcma: item.hsgcma || null,
                        mhdon: item.mhdon || null,
                        ncma: item.ncma ? new Date(item.ncma) : null,
                        nky: item.nky ? new Date(item.nky) : null,
                        tdlap: item.tdlap ? new Date(item.tdlap) : new Date(),
                        dvtte: item.dvtte || 'VND',
                        tgtcthue: Number(item.tgtcthue || 0),
                        tgtthue: Number(item.tgtthue || 0),
                        tgtttbso: Number(item.tgtttbso || 0),
                        tgtttbchu: item.tgtttbchu || null,
                        thtttoan: item.thtttoan || null,
                    }
                });

                // Lưu chi tiết sản phẩm và ghi nhận giao dịch kho (StockTransaction)
                if (Array.isArray(itemsList) && itemsList.length > 0) {
                    let sttCounter = 1;
                    for (const detail of itemsList) {
                        await tx.invoiceDetail.create({
                            data: {
                                invoiceId: newInvoice.id,
                                stt: Number(detail.stt || sttCounter++),
                                ten: detail.ten || 'Hàng hóa / Dịch vụ',
                                dvtinh: detail.dvtinh || null,
                                sluong: Number(detail.sluong || 0),
                                dgia: Number(detail.dgia || 0),
                                thtien: Number(detail.thtien || 0),
                                tsuat: Number(detail.tsuat || 0),
                                ltsuat: detail.ltsuat || null,
                                stckhau: detail.stckhau ? Number(detail.stckhau) : null
                            }
                        });

                        await tx.stockTransaction.create({
                            data: {
                                invoiceId: newInvoice.id,
                                type: 'OUTBOUND', // Xuất kho vì là bán ra
                                productName: detail.ten || 'Hàng hóa',
                                unit: detail.dvtinh || null,
                                quantity: Number(detail.sluong || 0),
                                unitPrice: Number(detail.dgia || 0),
                                totalAmount: Number(detail.thtien || 0),
                                transactionDate: item.tdlap ? new Date(item.tdlap) : new Date(),
                            }
                        });
                    }
                }
            });

            insertedCount++;
        }

        return res.status(200).json({
            success: true,
            message: 'Đồng bộ hóa đơn bán ra vào database thành công.',
            stats: {
                totalFetched: invoicesList.length,
                inserted: insertedCount,
                skippedExisting: skippedCount
            }
        });

    } catch (error) {
        console.error('Lỗi sync hóa đơn bán ra:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

router.post('/sync/purchase', async (req, res) => {
    try {
        // 1. Lấy tham số từ body request (hoặc dùng giá trị mặc định)
        const { 
            fromDate = '30/09/2026T00:00:00', 
            toDate = '29/10/2026T23:59:59', 
            size = 15, 
            sort = 'tdlap:desc',
            ttxly = 5 
        } = req.body || {};

        // 2. Xây dựng chuỗi tìm kiếm hóa đơn mua vào (có kèm ttxly)
        const searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate};ttxly==${ttxly}`;
        const queryParams = { 
            sort: sort, 
            size: size, 
            search: searchQuery 
        };

        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/purchase?${queryString}`;

        // 3. Cấu hình Token và Cookie
        const bearerToken = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIzMjAwNzU4MTE3IiwidHlwZSI6MiwiZXhwIjoxNzkzMzcyNjk1LCJpYXQiOjE3OTMyODYyOTV9.y04VM9WymA96lAi_ma5AbhhiEIl4yB1Pj63C8rnpY72yKIwXeU2rNTLJ3y7BBeqfPZolnlGHfN7EEaZBAmMM1A';

        const cookieString = [
            '_ga=GA1.3.509527361.1785485458',
            '_ga_F9DJVRC3NS=GS2.3.s1785485459$o1$g0$t1785485459$j60$l0$h0',
            'df9a7b9f11f13b2b359e1a94557637ae=d7dd004345b5be097652dbfc7a9fd6c5',
            'f5avraaaaaaaaaaaaaaaa_session_=OFCLEAGHIPGNHMDGDMPDALEAPDIGKAHMECMFDHIGFOMFBDMOBHJOIIHIBHCFOLNEOICDEMBHJAFGBIFNGOEADLOLDGMFMDMFHLDFFLHFILBCFDHJACBFIPBKPEGAKDDI',
            'd1efc622449bf821db4b4d84c82eafa1=7f52e247f66483f07a6431a087779c4a',
            'e1a565439633aacdd764ec3e73b3cc09=c4268cd5943d3844895946d4c89749bf',
            'JSESSIONID=EE7186A2B0AFCE64AE6BFAF86D371046',
            'TS0114b13e=011c0ae740959ec8427b0f2d2923662c0db21e5567f9bec84524896045f9db3756b2cde4ed12ff3bfd4d430e881f63567ef30cd03a23c38f53e366ea4e23b29b7065c49059eb49a81c4c1fa48922bdd01921f5781eed732545caf7f2064706a77aaa19bd5e9470964f1807d035ed67f64133275fce1e16ed50ffd15a0f73f75b822c520c523e47685f4a2aa976bee9a7ea968fcbf0',
            `jwt=${bearerToken}`
        ].join('; ');

        // Chuẩn bị headers chung cho axios
        const baseHeaders = {
            'authority': 'hoadondientu.gdt.gov.vn',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'vi',
            'authorization': `Bearer ${bearerToken}`,
            'cookie': cookieString,
            'end-point': '/tra-cuu/tra-cuu-hoa-don',
            'request-id': uuidv4(),
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
            'referer': 'https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don',
            'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };

        // 4. Gọi API lấy danh sách hóa đơn mua vào từ GDT
        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                ...baseHeaders,
                'action': 'Tìm kiếm (hóa đơn mua vào)'
            }
        });

        const responseData = gdtResponse.data;
        const invoicesList = responseData?.datas || [];

        let insertedCount = 0;
        let skippedCount = 0;

        // 5. Duyệt qua danh sách hóa đơn mua vào để kiểm tra và lưu DB
        for (const item of invoicesList) {
            const nbmst = item.nbmst;
            const khmshdon = Number(item.khmshdon || 1);
            const khhdon = item.khhdon;
            const shdon = Number(item.shdon);

            // Kiểm tra trùng lặp trong DB
            const existingInvoice = await prisma.invoice.findFirst({
                where: {
                    nbmst: nbmst,
                    khmshdon: khmshdon,
                    khhdon: khhdon,
                    shdon: shdon
                }
            });

            if (existingInvoice) {
                skippedCount++;
                continue;
            }

            // 6. Nếu chưa có -> Gọi API lấy chi tiết hóa đơn mua vào
            const detailQueryParams = { nbmst, khhdon, shdon, khmshdon };
            const detailQueryString = qs.stringify(detailQueryParams, { encode: false });
            const detailUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?${detailQueryString}`;

            const detailResponse = await axios.get(detailUrl, {
                headers: {
                    ...baseHeaders,
                    'action': 'Xem hóa đơn (hóa đơn mua vào)'
                }
            });

            const detailData = detailResponse.data || {};
            const itemsList = detailData.hdhhdvu || detailData.items || [];

            // 7. Lưu vào DB thông qua Prisma Transaction (INBOUND)
            await prisma.$transaction(async (tx) => {
                const newInvoice = await tx.invoice.create({
                    data: {
                        type: 'INBOUND', // Hóa đơn mua vào
                        nbmst: item.nbmst || '',
                        nbten: item.nbten || '',
                        nmmst: item.nmmst || '',
                        nmten: item.nmten || '',
                        khmshdon: khmshdon,
                        khhdon: khhdon,
                        shdon: shdon,
                        hdon: item.hdon || '01',
                        thdon: item.thdon || 'Hóa đơn giá trị gia tăng',
                        tthai: Number(item.tthai || 1),
                        cqt: item.cqt || null,
                        hsgcma: item.hsgcma || null,
                        mhdon: item.mhdon || null,
                        ncma: item.ncma ? new Date(item.ncma) : null,
                        nky: item.nky ? new Date(item.nky) : null,
                        tdlap: item.tdlap ? new Date(item.tdlap) : new Date(),
                        dvtte: item.dvtte || 'VND',
                        tgtcthue: Number(item.tgtcthue || 0),
                        tgtthue: Number(item.tgtthue || 0),
                        tgtttbso: Number(item.tgtttbso || 0),
                        tgtttbchu: item.tgtttbchu || null,
                        thtttoan: item.thtttoan || null,
                    }
                });

                // Lưu chi tiết sản phẩm và ghi nhận giao dịch kho (Nhập kho: INBOUND)
                if (Array.isArray(itemsList) && itemsList.length > 0) {
                    let sttCounter = 1;
                    for (const detail of itemsList) {
                        await tx.invoiceDetail.create({
                            data: {
                                invoiceId: newInvoice.id,
                                stt: Number(detail.stt || sttCounter++),
                                ten: detail.ten || 'Hàng hóa / Dịch vụ',
                                dvtinh: detail.dvtinh || null,
                                sluong: Number(detail.sluong || 0),
                                dgia: Number(detail.dgia || 0),
                                thtien: Number(detail.thtien || 0),
                                tsuat: Number(detail.tsuat || 0),
                                ltsuat: detail.ltsuat || null,
                                stckhau: detail.stckhau ? Number(detail.stckhau) : null
                            }
                        });

                        await tx.stockTransaction.create({
                            data: {
                                invoiceId: newInvoice.id,
                                type: 'INBOUND', // Nhập kho vì là hóa đơn mua vào
                                productName: detail.ten || 'Hàng hóa',
                                unit: detail.dvtinh || null,
                                quantity: Number(detail.sluong || 0),
                                unitPrice: Number(detail.dgia || 0),
                                totalAmount: Number(detail.thtien || 0),
                                transactionDate: item.tdlap ? new Date(item.tdlap) : new Date(),
                            }
                        });
                    }
                }
            });

            insertedCount++;
        }

        return res.status(200).json({
            success: true,
            message: 'Đồng bộ hóa đơn mua vào vào database thành công.',
            stats: {
                totalFetched: invoicesList.length,
                inserted: insertedCount,
                skippedExisting: skippedCount
            }
        });

    } catch (error) {
        console.error('Lỗi sync hóa đơn mua vào:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

module.exports = router;