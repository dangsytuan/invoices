const cron = require('node-cron');
const axios = require('axios');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Hàm service cốt lõi thực hiện kéo và đồng bộ hóa đơn từ GDT vào Database
 * @param {'purchase' | 'sold'} type - Loại hóa đơn ('purchase': mua vào, 'sold': bán ra)
 */
const syncInvoicesService = async (type) => {
    console.log(`⏰ [CRON JOB] Bắt đầu tiến trình đồng bộ tự động cho chiều: ${type.toUpperCase()}`);
    
    try {
        // 1. Tự động tính toán dải thời gian quét (Quét lùi lại 7 ngày gần nhất để vét dữ liệu mới phát sinh)
        const now = new Date();
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - 7);

        const formatDate = (date) => {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        };

        const fromDate = `${formatDate(pastDate)}T00:00:00`;
        const toDate = `${formatDate(now)}T23:59:59`;

        // 2. Cấu hình tham số query và endpoint theo loại (purchase / sold)
        const isPurchase = type === 'purchase';
        const endpointPath = isPurchase ? 'purchase' : 'sold';
        
        let searchQuery = `tdlap=ge=${fromDate};tdlap=le=${toDate}`;
        if (isPurchase) {
            searchQuery += `;ttxly==5`; // Hóa đơn mua vào cần kèm trạng thái xử lý
        }

        const queryParams = { 
            sort: 'tdlap:desc', 
            size: 50, // Lấy batch 50 hóa đơn mỗi lần quét tự động
            search: searchQuery 
        };

        const queryString = qs.stringify(queryParams, { encode: false });
        const targetUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${endpointPath}?${queryString}`;

        // 3. Thông tin xác thực (Token & Cookie hệ thống)
        // Lưu ý: Token có hạn, nếu token chết cần cơ chế tự động refresh token ở bước này
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

        // 4. Gọi API lấy danh sách hóa đơn từ GDT
        const gdtResponse = await axios.get(targetUrl, {
            headers: {
                ...baseHeaders,
                'action': isPurchase ? 'Tìm kiếm (hóa đơn mua vào)' : 'Tìm kiếm (hóa đơn bán ra)'
            }
        });

        const responseData = gdtResponse.data;
        const invoicesList = responseData?.datas || [];

        if (invoicesList.length === 0) {
            console.log(`ℹ️ [CRON] Không có hóa đơn ${type} mới nào trong khoảng thời gian này.`);
            return;
        }

        let insertedCount = 0;
        let skippedCount = 0;

        // 5. Duyệt và lưu vào Database
        for (const item of invoicesList) {
            const nbmst = item.nbmst;
            const khmshdon = Number(item.khmshdon || 1);
            const khhdon = item.khhdon;
            const shdon = Number(item.shdon);

            // Kiểm tra trùng lặp
            const existingInvoice = await prisma.invoice.findFirst({
                where: { nbmst, khmshdon, khhdon, shdon }
            });

            if (existingInvoice) {
                skippedCount++;
                continue; // Đã có rồi thì bỏ qua
            }

            // Gọi API lấy chi tiết sản phẩm của hóa đơn
            const detailQueryParams = { nbmst, khhdon, shdon, khmshdon };
            const detailQueryString = qs.stringify(detailQueryParams, { encode: false });
            const detailUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/detail?${detailQueryString}`;

            const detailResponse = await axios.get(detailUrl, {
                headers: {
                    ...baseHeaders,
                    'action': isPurchase ? 'Xem hóa đơn (hóa đơn mua vào)' : 'Xem hóa đơn (hóa đơn bán ra)'
                }
            });

            const detailData = detailResponse.data || {};
            const itemsList = detailData.hdhhdvu || detailData.items || [];
            const invoiceTypeEnum = isPurchase ? 'INBOUND' : 'OUTBOUND';

            // Lưu vào DB bằng Prisma Transaction
            await prisma.$transaction(async (tx) => {
                const newInvoice = await tx.invoice.create({
                    data: {
                        type: invoiceTypeEnum,
                        nbmst: item.nbmst || '',
                        nbten: item.nbten || '',
                        nmmst: item.nmmst || '',
                        nmten: item.nmten || '',
                        khmshdon,
                        khhdon,
                        shdon,
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
                                type: invoiceTypeEnum, // INBOUND (Nhập kho) hoặc OUTBOUND (Xuất kho)
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

        console.log(`✅ [CRON] Đồng bộ ${type} hoàn tất. Thêm mới: ${insertedCount}, Bỏ qua (đã có): ${skippedCount}`);

    } catch (error) {
        console.error(`❌ [CRON] Lỗi đồng bộ tự động ${type}:`, error.response?.data || error.message);
    }
};

/**
 * Hàm khởi tạo và đăng ký lịch chạy tự động bằng node-cron
 */
const initCronJobs = () => {
    // 1. Lịch chạy Hóa đơn mua vào (Purchase): Chạy lúc 1:30 sáng mỗi ngày
    cron.schedule('30 1 * * *', async () => {
        await syncInvoicesService('purchase');
    });

    // 2. Lịch chạy Hóa đơn bán ra (Sold): Chạy lúc 2:00 sáng mỗi ngày
    cron.schedule('0 2 * * *', async () => {
        await syncInvoicesService('sold');
    });

    console.log('🚀 Hệ thống Cron Job tự động đồng bộ hóa đơn Tổng cục Thuế đã khởi động thành công.');
};

module.exports = { initCronJobs, syncInvoicesService };