const axios = require('axios');

async function callScoinApi() {
  try {
    const response = await axios.get('https://scoin.vn/Handlers/FromScoinHandler.ashx', {
      params: {
        token: 'b216efb25101b5cb761b390fc34da495.639287999900344625',   //[cite: 1]
        serial: '123456',                       //[cite: 1]
        code: '123456',                         //[cite: 1]
        type: '10',                             //[cite: 1]
        gtoken: '0cAFcWeA7CWB7B3NxzCH6TKExTYCTzb_03gWoZn4af_Ni_OfI5-LJhw8dm7ldZZuzfRERL0alBIOrdDczgAxWCZxXyUOk3hU8QJavWMqQr7zEYFjL-t_J1R0l1sw3EIjXxaB-Q_dpXIolx6l-PtcqZvy06U-JcwzQgjs1XKatbFg7la5tvC-nc_jMgrhK9ROsGAkUkFY-j0nrj7KyQ5kpwb5o6JgCdd6PTokbYjXqRXA9kdaYu5bxJmrLY6aUh_UcvWPnIMcVok1YtKc2r4ps6mfLp3nR7PNXf0NYhikSCCQ0nQQYSCPEtEOITgEEjLwZrN1kt4khjUQ1x6bKP4uvhhY1dQoiG2gf8XWIZ6CJ83nLgKF3YuVPZkAZHksO06VNc4De3HF046uYXspQCx9Zu1akdx8gH1PfAIFQ0VM-KYRmFWq6Gqs3c8rWKkgTNhvNA9Rh7ctTnDoEGRiQiXvkm158MzTtpUy3JeryifO8K1zcnbTuW40PKoEm0RZcEqB8ATOjd9Q8FNdAKdkpUR7UoioA6h6hsO-xaqNQywqbp6NOZ2FSZRL3qhhMx44eHiLFaC7k49z7_MamihtbtTLSSV9qMRmjGsgfm0S9paFnYgER-JU_wEanerNU9vYor-BUtt83GtB084FSHtsT3GrUtc3kKo01PCjJ1JGAWylS7mRZ-od_gifGz9Bxr4rDiCwramnrMy_qbIMNjrYKGNnqkqbSkp4jHFUwOcMnl11YLLfP8FhYMZKN4d68MOUm20bv9YtVhtiNtSl7j7s3QRuDLN41thjvfAE_jrWar41GHReCzNpLiPDctXpHmkxuQv-plc9HszN3ciBJvGb3GaiVt-itN9Zy57JBzxoq2LLk7TewNkE9xOB8L-m96M8Rraljyc8b_qycYtNgn2FpP1AF_q59SgObgLTaLdz4YFzwoC3IZdcC97TpRTGMAlVsSdanKaCRLm9MIniNpYXKa3kPtKhRdf82jZQlX3TyxbB9N8rzjj4VWPQE3d7EERr0ZbupHs_ZjRvEHusKV-iJzxyBc5OLog1JgD6mYLIjUbWqS1D-lBfVxkwNtETFmMNljrmBzI_H_Lh2amyDCeRIy4mZgs9mcNJg4mhhhyhpiDSpK79WSpEI5t7Vo-3MBPwNrlfdtoIHhQNTZGDkuaTinh-C6DQXcafausN4yHdbRRfy3c_E8hqjaj1MNAOevu8jM6sJCxmZ0edPmnCBRatKpVaxGIqGsWPe31fxjCj03wrVrBHwjnCivx5VQ8NXCEZoPKpbR-G3ufcOl6-RGTjRUE6T8wbLauHrFANpo8JFS0T6uDXZc8zzwSfqouS6fh7ijDqE0sqc7JdbtIMW3-6dEOM3zMGanHGXCgZy2lehQ38xNNe3KfDsEZ8h7-h83QTs63dbE-wXhunaX54X7Q_RWu5GhdxsRVH66g7fxSm4pj0E83c2IDaMjJX1zXOV-pPygrK4ft0JKQ19wg_4T3_WHMnyb79PHMGJbMPaAqqaKMGPgw78jhnoJSoXn6Okfi-qEn7vyT5Hd5bH7F5mZp_G7mi-MBcDsLkHgbGjFkCEERF2tL95kLCSw0g_JfOJO4Y7qBfwTdEbtOaCQRdlDWZhuOOBq1zyFpAaHWYp3-I1TvkKSVEkoiPDoyuhA5IQle9IyEiZ5ZzOkuCPZool8Kvn0lroF8ag3OgiHEbfA7Mcz_J_6klnftQI2tkxwdvQ_9Qs2qlwtS7aNY2ljr82NaKPCP0c-Rv7PcXNWGu7zDLsQU84El9mprrBXSaOSKtQD60d1Eea-SzgMrf3Icra3_aJshRiEqTfNgFomW5UcLJIoDJai8qonoa0XxO58asnR0B0QqwHfwh3kT8hMVWwf2cEGo22cmtw4-GnyFuIcg0ui7l9Z66-s5x9Xgsp646J6uZz6FUgsc0rjALFma9hxmESjlmrzB1_EoFRFdP5RBol7MFpjVePKqr-NhLF3tsb8co6gtY1eMKaVieiOqKssPKVuxcWJh_a6OgI7FV-rc_fJDJ6fd8b8kh738SRnnawbvmKJam-8g2D2JzedWu8t0DxBdwICTJQEfwkMWPUSLPxTRGSzgmrNLUxiDvo4U9qGaoYIyYKkixaMOTR1alrDa2ZA0cenSkirEi9FwDXMuGCXZg1tiVBQlWFIUR3ckyFJMVFPaVzB1z5QRD0BiC5QaPFc2Kvs_uT3_pdhp-tDazJOP_IPNBEzhLUTJMeQTxGP5rKAzmIvl4vBGQbG8on13l_hdx6alPcS4bLwXDpx2LhtlfYWgBElUPWswQmB0uq9RFgYO0Iher7k8WJDkSuVNtUuz4q4TPXPBuV5ZkC3RVy8oFKs6hFAxp0utYfzyHsfH_sT89x0jpxotxU_7rt7wOw2J2qal7XHZdZNnwoKN5Mt6bBcAZURWkfsJImkwEGc45fG8iSqo_Q8HjhS0XsFenZK-WZ1cxBEb-2SWdafPA'    //[cite: 1]
      },
      headers: {
        'Cookie': 'ASP.NET_SessionId=wq5li2ymvela0drghg5jkwtv; NSC_mcwt_tdpjo.wo=ffffffff0901120545525d5f4f58455e445a4a423881'
      }
    });

    console.log('Kết quả trả về:', response.data);
  } catch (error) {
    console.error('Lỗi khi gọi API:', error.message);
  }
}

callScoinApi();