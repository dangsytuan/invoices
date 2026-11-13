const { PrismaClient } = require('@prisma/client');
const TaxService = require('./src/services/TaxService');

const prisma = new PrismaClient();
const taxService = new TaxService();

async function getInvoiceByDetails({ nbmst, khmshdon, khhdon, shdon }) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        nbmst: nbmst,       // Mã số thuế người bán
        khmshdon: khmshdon, // Ký hiệu mẫu số (Int)
        khhdon: khhdon,     // Ký hiệu hóa đơn (String)
        shdon: shdon,       // Số hóa đơn (Int)
      },
      include: {
        details: true,          // Lấy kèm chi tiết dòng hàng (nếu cần)
        stockTransactions: true // Lấy kèm lịch sử kho (nếu cần)
      }
    });

    if (!invoice) {
      console.log("Không tìm thấy hóa đơn phù hợp.");
      return null;
    }

    return invoice;
  } catch (error) {
    console.error("Lỗi khi truy vấn hóa đơn:", error);
    throw error;
  }
}

async function updateNewVoice(data, type, isSco = false) {
  data.forEach(async detailData =>{
    console.log(`Đang xử lý hoá đơn: ${detailData.shdon}`);
    const existing = await prisma.invoice.findFirst({
              where: {
                nbmst: detailData.nbmst,
                khhdon: detailData.khhdon,
                shdon: Number(detailData.shdon),
                khmshdon: Number(detailData.khmshdon)
              }
    });
    if(existing){
      console.log(`+ hoá đơn đã tồn tại: ${existing.shdon}`);
      return;
    }

    let detailType = 'sold';
    detailType = type === 'sold' ? 'sold' : 'purchase';
    detailType = isSco ? 'sco' : detailType;
    console.log(`detailType: ${detailType}`);

    await taxService.sleep(10000);

    const detail = await taxService.getInvoiceDetail(detailData.nbmst, detailData.khhdon, detailData.shdon, detailData.khmshdon, detailType);
    

    const invoicePayload = {
              type: type === 'sold' ? 'OUTBOUND' : 'INBOUND',
              isSco: isSco,
              nbmst: detailData.nbmst || '',
              nbten: detailData.nbten || '',
              nbdchi: detailData.nbdchi || '',
              nbsdthoai: detailData.nbsdthoai || '',
              nmmst: detailData.nmmst || '',
              nmten: detailData.nmten || '',
              nmdchi: detailData.nmdchi || '',
              nmsdthoai: detailData.nmsdthoai || '',
              khmshdon: Number(detailData.khmshdon) || 1,
              khhdon: detailData.khhdon || '',
              shdon: Number(detailData.shdon) || 0,
              hdon: detailData.hdon || '01',
              thdon: detailData.thdon || 'Hóa đơn giá trị gia tăng',
              tthai: Number(detailData.tthai) || 1,
              cqt: detailData.cqt,
              hsgcma: detailData.hsgcma,
              mhdon: detailData.mhdon,
              ncma: detailData.ncma ? new Date(detailData.ncma) : null,
              nky: detailData.nky ? new Date(detailData.nky) : null,
              tdlap: detailData.tdlap ? new Date(detailData.tdlap) : new Date(),
              dvtte: detailData.dvtte || 'VND',
              tgtcthue: Number(detailData.tgtcthue) || 0,
              tgtthue: Number(detailData.tgtthue) || 0,
              tgtttbso: Number(detailData.tgtttbso) || 0,
              tgtttbchu: detailData.tgtttbchu,
              thtttoan: detailData.thtttoan
    };

    const createNew = await prisma.invoice.create({
        data: invoicePayload
    });

    console.log(`+ đã tạo mới: ${createNew.shdon} type: ${type} isSco: ${isSco}`);
    console.log(`+ thêm sản phẩm cho: ${createNew.id}`);

    // Lưu danh sách sản phẩm chi tiết (InvoiceDetail)
    if (detail.hdhhdvu && Array.isArray(detail.hdhhdvu)) {
              for (const item of detail.hdhhdvu) {
              
                await prisma.invoiceDetail.create({
                  data: {
                    invoiceId: createNew.id,
                    stt: Number(item.stt) || 1,
                    ten: item.ten || 'Hàng hóa không tên',
                    dvtinh: item.dvtinh,
                    sluong: Number(item.sluong) || 0,
                    dgia: Number(item.dgia) || 0,
                    thtien: Number(item.thtien) || 0,
                    tsuat: Number(item.tsuat) || 0,
                    ltsuat: item.ltsuat || String(item.tsuat),
                    stckhau: Number(item.stckhau) || 0
                  }
                });
              
              console.log(`+ cập nhật sản phẩm: ${item.ten}`);
              }
    }

    

  });
}

async function getNewInvoices() {
  const now = new Date();

  const fromDay = new Date();
  fromDay.setDate(now.getDate() - 7);

  const toDay = new Date(now);

  const soldInvoice = await taxService.getSoldInvoices(fromDay, toDay);
  if (soldInvoice.success === true) {
      const data = soldInvoice.data;
      await updateNewVoice(data, 'sold', false);
  }
  await taxService.sleep(10000);


  const purchases = await taxService.getPurchaseInvoices(fromDay, toDay);
  if (purchases.success === true) {
      const data = purchases.data;
      await updateNewVoice(data, 'purchase', false);
  }
  await taxService.sleep(10000);


  const purchaseCash = await taxService.getPurchaseFromCashRegister(fromDay, toDay);
  if (purchaseCash.success === true) {
      const data = purchaseCash.data;
      await updateNewVoice(data, 'purchase', true);
  }
  await taxService.sleep(10000);

}

async function BuildProduct() {
  console.log('🧹 Đang tiến hành dọn dẹp bảng Product...');
  await prisma.product.deleteMany();

  const allDetails = await prisma.invoiceDetail.findMany({
    where: {
      invoice: {
        type: 'INBOUND' // Lọc các invoiceDetail mà invoice liên quan có type là 'INBOUND'
      }
    },
    include: {
      invoice: true // Kèm theo thông tin chi tiết của invoice đó
    }
  });

  console.log(`Tìm thấy ${allDetails.length} giao dịch`);

  let bd_product = 0;
  for (const detail of allDetails) {
      const productName = detail.ten.trim();
      const unitVal = detail.dvtinh || null;
      const txType = detail.invoice.type; // 'INBOUND' hoặc 'OUTBOUND'

      // Tìm xem sản phẩm đã tồn tại trong DB chưa
      let product = await prisma.product.findFirst({
        where: {
          name: {
            equals: productName, // Khớp chính xác chuỗi đã trim
            mode: 'insensitive'  // Không phân biệt hoa thường (A == a)
          }
        }
      });

      // Nếu sản phẩm chưa tồn tại:
      if (!product) {
        // CHỈ TẠO MỚI PRODUCT NẾU ĐÂY LÀ HÓA ĐƠN MUA VÀO (INBOUND)
        if (txType === 'INBOUND') {
          product = await prisma.product.create({
            data: {
              name: productName,
              unit: unitVal,
              stockBalance: 0,
              totalImported: 0,
              totalExported: 0
            }
          });

          bd_product++;

        }
      }
    }

    console.log(`đã thêm ${bd_product} sản phẩm mới`);
}

async function BuildStock() {
  console.log('🧹 Đang tiến hành dọn dẹp bảng StockTransaction...');
  await prisma.stockTransaction.deleteMany();

  const allDetails = await prisma.invoiceDetail.findMany({
    include: {
      invoice: true
    }
  });

  console.log(`Tìm thấy ${allDetails.length} giao dịch`);

  let bd_product = 0;
  for (const detail of allDetails) {
    const productName = detail.ten.trim();
    const unitVal = detail.dvtinh || null;
    const txType = detail.invoice.type; // 'INBOUND' hoặc 'OUTBOUND'

    await prisma.stockTransaction.create({
        data: {
          invoiceId: detail.invoiceId,
          type: txType,
          productName: detail.ten,
          unit: detail.dvtinh,
          quantity: detail.sluong,
          unitPrice: detail.dgia,
          totalAmount: detail.thtien,
          transactionDate: detail.invoice.tdlap
        }
    });

    bd_product++;

  }

  console.log(`đã thêm ${bd_product} sản phẩm mới`);
}

async function StockLinked() {
  console.log('Tạo mã liên kết cho Stock');

  // 1. Lấy các giao dịch chưa có productId (productId = null)
  const stockTrans = await prisma.stockTransaction.findMany({
    where: {
      productId: null
    }
  });

  // 2. Lấy toàn bộ danh sách sản phẩm chuẩn trong hệ thống một lần duy nhất
  const allProducts = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, unit: true }
  });

  let linkedCount = 0;
  for (const trans of stockTrans) {
    if (!trans.productName) continue;

    const matchedProduct = allProducts.find(p => {
      if (!p.name) return false;
      return p.name.toLowerCase() === trans.productName.toLocaleLowerCase();
    });

    if (matchedProduct) {
      await prisma.stockTransaction.update({
        where: { id: trans.id },
        data: { productId: matchedProduct.id }
      });

      linkedCount++;
    }
  }

  console.log(`\nHoàn tất! Đã liên kết thành công ${linkedCount}/${stockTrans.length} giao dịch.`);

}

async function BuildProductAndStockTransaction() {
  try{

    console.log('🧹 Đang tiến hành dọn dẹp bảng StockTransaction và Product...');
    await prisma.$transaction([
      prisma.stockTransaction.deleteMany(), // Xóa giao dịch kho trước
      prisma.product.deleteMany(),         // Sau đó mới xóa sản phẩm
    ]);

    const allDetails = await prisma.invoiceDetail.findMany({
      include: {
        invoice: true 
      }
    });

    console.log(`Tổng nhập/xuất: ${allDetails.length}`);

    let bd_product = 0;
    let bd_stock = 0;

    for (const detail of allDetails) {
      const productName = detail.ten.trim();
      const unitVal = detail.dvtinh || null;
      const txType = detail.invoice.type; // 'INBOUND' hoặc 'OUTBOUND'

      // Tìm xem sản phẩm đã tồn tại trong DB chưa
      let product = await prisma.product.findFirst({
        where: { name: productName }
      });

      // Nếu sản phẩm chưa tồn tại:
      if (!product) {
        // CHỈ TẠO MỚI PRODUCT NẾU ĐÂY LÀ HÓA ĐƠN MUA VÀO (INBOUND)
        if (txType === 'INBOUND') {
          product = await prisma.product.create({
            data: {
              name: productName,
              unit: unitVal,
              stockBalance: 0,
              totalImported: 0,
              totalExported: 0
            }
          });

          bd_product++;

        }
      }

      // Tạo lịch sử giao dịch kho (StockTransaction) cho cả INBOUND và OUTBOUND
      await prisma.stockTransaction.create({
        data: {
          invoiceId: detail.invoiceId,
          productId: product?.id || null,
          type: txType,
          productName: detail.ten,
          unit: detail.dvtinh,
          quantity: detail.sluong,
          unitPrice: detail.dgia,
          totalAmount: detail.thtien,
          transactionDate: detail.invoice.tdlap
        }
      });

      bd_stock++;
    }

    console.log(`đã thêm ${bd_product} sản phẩm mới, ${bd_stock} giao dịch`);

  }catch(err){
    console.log(`BuildProductTable Err: ${err.message}`);
  }
  

}

async function BuildComboBK() {
  console.log('Đang kiểm tra giao dịch...');
  
  const stockTrans = await prisma.stockTransaction.findMany({
    where: {
      productId: null,
      type: 'OUTBOUND',
      productName: {
        contains: 'Bộ máy tính để bàn',
        mode: 'insensitive' // Không phân biệt hoa thường (hỗ trợ tốt trên PostgreSQL)
      }
    }
  });

  console.log(`Tìm thấy ${stockTrans.length} giao dịch`);
  return;

  // 2. Lấy toàn bộ danh sách sản phẩm chuẩn trong hệ thống một lần duy nhất
  const allProducts = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, unit: true }
  });

  let matchedCount = 0; // Đếm số giao dịch khớp được với sản phẩm lẻ
  let unmatchedCount = 0; // Đếm số giao dịch không tìm thấy

  // 3. Duyệt qua từng giao dịch chưa liên kết để kiểm tra xem có sản phẩm lẻ không
  for (const trans of stockTrans) {
    // Kiểm tra xem tên sản phẩm trong giao dịch (trans.productName) có chứa hoặc trùng với sản phẩm nào trong DB không
    const foundProduct = allProducts.find(p => {
      // Kiểm tra nếu 1 trong 2 bị null/undefined thì bỏ qua để tránh crash app
      if (!trans.productName || !p.name) return false;

      // So sánh tuyệt đối sau khi đã cắt khoảng trắng thừa và đồng bộ chữ thường
      return trans.productName.trim().toLowerCase() === p.name.trim().toLowerCase();
    });
    if (foundProduct) {
      matchedCount++;
      console.log(`[KHỚP] Giao dịch: "${trans.productName}" ---> Trùng với sản phẩm: "${foundProduct.name}"`);
      
      // (Tùy chọn) Nếu bạn muốn update luôn productId vào database cho giao dịch này:
      /*
      await prisma.stockTransaction.update({
        where: { id: trans.id },
        data: { productId: foundProduct.id }
      });
      */
    } else {
      unmatchedCount++;
      console.log(`[KHÔNG TÌM THẤY] Giao dịch: "${trans.productName}"`);
    }
  }

  console.log(`\n--- TỔNG KẾT ---`);
  console.log(`Tổng số giao dịch chưa liên kết: ${stockTrans.length}`);
  console.log(`- Số giao dịch CÓ THỂ map với sản phẩm lẻ: ${matchedCount}`);
  console.log(`- Số giao dịch KHÔNG tìm thấy sản phẩm tương ứng: ${unmatchedCount}`);
}

async function BuildCombo() {
  console.log('Đang kiểm tra và xử lý giao dịch xuất kho combo...');
  
  // 1. Lấy các giao dịch OUTBOUND chưa có productId và có chứa từ khóa bộ máy tính
  const stockTrans = await prisma.stockTransaction.findMany({
    where: {
      productId: null,
      type: 'OUTBOUND',
      OR: [
        { productName: { contains: 'Bộ máy tính để bàn', mode: 'insensitive' } },
        { productName: { contains: 'Bộ máy vi tính để bàn', mode: 'insensitive' } }
      ]
    },
    include: {
      invoice: true // Lấy kèm thông tin hóa đơn nếu cần
    }
  });

  console.log(`Tìm thấy ${stockTrans.length} giao dịch combo cần xử lý.`);

  let bd_product = 0;

  for (const trans of stockTrans) {
    // Lấy tên gốc của combo từ trans.productName
    const rawComboName = trans.productName ? trans.productName.trim() : "";
    const unitVal = trans.unit || "Bộ";

    if (!rawComboName) continue;

    // 2. Tìm hoặc Tạo mới sản phẩm COMBO trong bảng Product
    let bundleProduct = await prisma.product.findFirst({
      where: {
        name: {
          equals: rawComboName,
          mode: 'insensitive'
        }
      }
    });

    if (!bundleProduct) {
      bundleProduct = await prisma.product.create({
        data: {
          name: rawComboName,
          unit: unitVal,
          isBundle: true, // Đánh dấu đây là sản phẩm dạng combo
          stockBalance: 0,
          totalImported: 0,
          totalExported: 0
        }
      });
      bd_product++;
    }

    // 3. Cập nhật ngược lại productId cho giao dịch stockTransaction trỏ vào sản phẩm combo này
    await prisma.stockTransaction.update({
      where: { id: trans.id },
      data: { productId: bundleProduct.id }
    });

    // 4. Bóc tách các linh kiện lẻ nằm bên trong chuỗi tên combo
    const componentParts = parseComponentsFromComboString(rawComboName);

    // 5. Xử lý từng linh kiện lẻ: Tìm trong DB -> Tạo mới nếu chưa có -> Gắn vào bảng ProductComponent
    for (const compName of componentParts) {
      const cleanCompName = compName.trim();

      // Tìm linh kiện lẻ trong DB
      let componentProduct = await prisma.product.findFirst({
        where: {
          name: {
            equals: cleanCompName,
            mode: 'insensitive'
          },
          isBundle: false // Chỉ tìm các linh kiện đơn lẻ
        }
      });

      // Nếu linh kiện chưa có trong hệ thống, tự động tạo mới
      if (!componentProduct) {
        console.log(`Không tìm thấy ${cleanCompName}`);
        continue;
        /*
        componentProduct = await prisma.product.create({
          data: {
            name: cleanCompName,
            unit: "Cái",
            isBundle: false,
            stockBalance: 0
          }
        });
        */
      }

      // 6. Liên kết linh kiện vào Combo thông qua bảng ProductComponent (Tránh lỗi trùng lặp bằng upsert)
      await prisma.productComponent.upsert({
        where: {
          bundleId_componentId: {
            bundleId: bundleProduct.id,
            componentId: componentProduct.id
          }
        },
        update: {
          quantity: 1 // Hoặc tăng số lượng nếu xuất hiện nhiều lần
        },
        create: {
          bundleId: bundleProduct.id,
          componentId: componentProduct.id,
          quantity: 1
        }
      });
    }
  }

  console.log(`Hoàn tất! Đã tạo mới ${bd_product} sản phẩm combo và map các linh kiện thành công.`);
}

// Hàm phụ trợ giúp bóc tách chuỗi linh kiện bên trong ngoặc hoặc dấu chấm phẩy của hóa đơn
function parseComponentsFromComboString(rawString) {
  // 1. Lấy nội dung nằm bên trong cặp ngoặc đơn chính của chuỗi
  // Sử dụng regex để tìm cặp ngoặc ngoài cùng, tránh bị nhầm với ngoặc con (như (16g X2))
  const firstOpen = rawString.indexOf('(');
  const lastClose = rawString.lastIndexOf(')');
  
  if (firstOpen === -1 || lastClose === -1 || lastClose <= firstOpen) {
    return [];
  }

  const innerContent = rawString.substring(firstOpen + 1, lastClose);

  // 2. Tách các sản phẩm dựa trên các ký tự phân cách (; hoặc / hoặc các trường hợp đặc biệt)
  // Lưu ý: Tránh tách nhầm dấu '-' nằm trong tên model (ví dụ: i7-14700KF, RTX-3050)
  // Ta sẽ tách chủ yếu bằng dấu ';' và dấu '/', hoặc phân tách linh hoạt:
  let parts = innerContent
    .split(/;|\//) // Tách theo dấu chấm phẩy hoặc dấu gạch chéo
    .map(item => item.trim())
    .filter(item => item.length > 3); // Lọc bỏ các khoảng trắng hoặc ký tự rác rưởi

  return parts;
}

async function recalculateStockBalance() {
  console.log('🔄 Bắt đầu quá trình tính toán lại tồn kho...');

  try {
    // 1. Reset lại toàn bộ các giá trị tồn kho, tổng nhập, tổng xuất về 0 cho tất cả sản phẩm
    console.log('🧹 Đang reset lại các giá trị trong bảng Product về 0...');
    await prisma.product.updateMany({
      data: {
        totalImported: 0,
        totalExported: 0,
        stockBalance: 0,
      },
    });

    // 2. Lấy tất cả các giao dịch hợp lệ:
    // - Có liên kết với sản phẩm (productId != null)
    // - Thuộc hóa đơn có trạng thái status là 1 hoặc 2
    const validTransactions = await prisma.stockTransaction.findMany({
      where: {
        productId: {
          not: null,
        },
        invoice: {
          tthai: {
            in: [1, 2], // Chỉ lấy hóa đơn có status là 1 hoặc 2
          },
        },
      },
      select: {
        productId: true,
        type: true,      // 'INBOUND' (Nhập) hoặc 'OUTBOUND' (Xuất)
        quantity: true,  // Số lượng giao dịch
      },
    });

    console.log(`📊 Tìm thấy ${validTransactions.length} giao dịch hợp lệ để tính toán.`);

    // 3. Gom nhóm (Aggregate) số liệu cộng dồn vào một Object trên RAM để tối ưu tốc độ xử lý
    // Cấu trúc map: { [productId]: { imported: 0, exported: 0 } }
    const productStats = {};

    for (const tx of validTransactions) {
      const pId = tx.productId;
      const qty = tx.quantity || 0;

      if (!productStats[pId]) {
        productStats[pId] = { imported: 0, exported: 0 };
      }

      if (tx.type === 'INBOUND') {
        productStats[pId].imported += qty; // Nhập -> Tăng thêm
      } else if (tx.type === 'OUTBOUND') {
        productStats[pId].exported += qty; // Xuất -> Giảm đi
      }
    }

    // 4. Duyệt qua từng sản phẩm đã gom nhóm và cập nhật vào Database
    let updatedCount = 0;
    for (const [productId, stats] of Object.entries(productStats)) {
      const totalImported = stats.imported;
      const totalExported = stats.exported;
      const stockBalance = totalImported - totalExported; // Tồn kho = Tổng nhập - Tổng xuất

      await prisma.product.update({
        where: { id: productId },
        data: {
          totalImported: totalImported,
          totalExported: totalExported,
          stockBalance: stockBalance,
        },
      });

      updatedCount++;
    }

    console.log(`✅ Hoàn tất! Đã cập nhật lại tồn kho thành công cho ${updatedCount} sản phẩm.`);
  } catch (error) {
    console.error('❌ Lỗi khi tính toán lại tồn kho:', error);
  }
}

async function UpdateRelationInvoices() {

  const invoices = await prisma.invoice.findMany({
    where: {
      tthai: {
        not: 1 // tthai khác 1
      },
      // relNbmst: null,    // MST liên quan là null
      // relKhmshdon: null, // Mẫu số liên quan là null
      // relKhhdon: null,   // Ký hiệu liên quan là null
      // relShdon: null     // Số hóa đơn liên quan là null
      relatedInvoiceId: null
    }
  });

  console.log(`Tìm thấy ${invoices.length} hoá đơn`);

  for(const detail of invoices){
    if(detail.isSco){

    }else{
      const type = detail.type === 'INBOUND' ? 'sold' : 'purchase';

      taxService.sleep(10000);
      const relInvoice = await taxService.getRelativeInvoices(detail.nbmst, detail.khmshdon, detail.khhdon, detail.shdon, type);

      if(relInvoice){

        console.log(`Lấy thông tin hoá đơn liên quan từ database`);

        const invoice = await prisma.invoice.findFirst({
          where: {
            nbmst: relInvoice[0].nbmst,
            khmshdon: relInvoice[0].khmshdon,
            khhdon: relInvoice[0].khhdon,
            shdon: relInvoice[0].shdon
          }
        });
        if(invoice){

          console.log(`Update thông tin hoá đơn hiện tại: ${detail.id}`);
        
          const updateCurrentInvoice = await prisma.invoice.update({
            where: {
              id: detail.id
            },
            data: {
              relNbmst: relInvoice[0].nbmst,
              relKhmshdon: relInvoice[0].khmshdon,
              relKhhdon: relInvoice[0].khhdon,
              relShdon: relInvoice[0].shdon,
              relatedInvoiceId: invoice.id
            }
          });

          console.log(`+ Update ${updateCurrentInvoice.shdon} OK`);

          console.log('Cập nhật trạng thái hoá đơn liên quan trong database');
          const updateStatusInvoice = await prisma.invoice.update({
            where: {
              id: invoice.id
            },
            data: {
              tthai: relInvoice[0].tthai
            }
          });
          console.log(`+ Update ${updateStatusInvoice.shdon} OK`);
        }else{
          console.log('Không tìm thấy hoá đơn liên quan trong database');
        }
      }
    }
    
  }

}


(async () => {
  try {
    // const invoice = await getInvoiceByDetails('3200730390', 1, 'C26THT', 44);
    // console.log(invoice.id);
    // await getNewInvoices();

    // await BuildProductTable();
    // await BuildCombo();
    // await BuildProduct();
    // await BuildStock();
    // await StockLinked();

    // await recalculateStockBalance();
    await UpdateRelationInvoices();

  } catch (error) {
    console.error('Lỗi khi chạy test:', error.message);
  } finally {
    await prisma.$disconnect(); // Nhớ ngắt kết nối Prisma sau khi test xong
  }
})();