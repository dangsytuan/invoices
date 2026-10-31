const TaxService = require('./src/services/TaxService');

async function main() {
  const taxService = new TaxService();

  try {
    const hasValidToken = taxService.loadSavedToken();
    if (!hasValidToken) {
      console.log('🔄 Token không tồn tại hoặc đã hết hạn. Bắt đầu luồng đăng nhập mới...');

      const username = '3200758117';
      const password = '1234567@Abc';
      const isLogin = await taxService.login(username, password);
      if(isLogin === false){
        console.log('login lỗi');
        return;
      }
    } else {
      console.log('⚡ Bỏ qua đăng nhập, tiếp tục sử dụng token hiện có.');
    }

    // Tự động lấy sạch tất cả hóa đơn bán ra trong 1 tháng qua
  // const allSold = await taxService.getSoldInvoices();
  // console.log(`Tổng số hóa đơn bán ra lấy được: ${allSold.length}`);

  // Hoặc lấy sạch hóa đơn mua vào
  const allPurchase = await taxService.getPurchaseFromCashRegister();
  console.log(`Tổng số hóa đơn mua vào lấy được: ${allPurchase.length}`);

  } catch (error) {
    console.error('Quy trình chạy thất bại:', error);
  }
}

main();