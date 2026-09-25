# Ximi Dịch – phiên dịch trò chuyện hai chiều, 60 thứ tiếng

**Ximi Dịch** (thiết kế & phát triển bởi Độ Ximitech) là web app phiên dịch cuộc họp theo thời gian thực: đối tác nói một trong 60 thứ tiếng (Trung, Anh, Hàn, Nhật, Thái…), chữ tiếng Việt tự hiện ra. Nhận giọng nói và dịch bằng [Soniox](https://soniox.com) (hoặc chế độ tiết kiệm dùng giọng nói của trình duyệt), AI (Groq, dự phòng Gemini) dịch lại cho đúng nghĩa bản xứ và tóm tắt.

> **Trạng thái:** Đang chạy tại https://phien-dich-hop.vercel.app – nghe và dịch liên tục 60 thứ tiếng → tiếng Việt, **tóm tắt ngay trong lúc họp**, gợi ý trả lời, 2 chế độ nghe (Chính xác / Tiết kiệm), tự lưu vào máy (localStorage), lịch sử cuộc họp, chỉ số mạng, copy, đọc to, tự kết nối lại khi mất mạng.

## Cách dùng (cho người dùng)

1. Mở app và nhập mật khẩu. Máy sẽ nhớ, lần sau không phải nhập lại.
2. Lần đầu: vào **Cài đặt → Ngôn ngữ cuộc họp**, chọn thứ tiếng đối tác nói (mặc định tiếng Trung).
3. Đặt điện thoại giữa bàn họp, bấm **nút micro**. Đối tác nói thì chữ tiếng Việt tự hiện ra (bên trái). Lời mình nói tiếng Việt được ghi lại bên phải, không dịch.
4. Bấm **✨ Tóm tắt** (cạnh nút micro) bất cứ lúc nào để xem: ý chính, quyết định đã chốt, việc cần làm (ai – việc gì – hạn), số liệu quan trọng. Có nút chép bản Việt, và bản dịch sang tiếng của đối tác nếu cần.
5. Mỗi câu có nút **chép** và nút **đọc to** bản dịch.
6. Góc trên có **4 vạch sóng**: xanh là mạng tốt, vàng là mạng hơi chậm, đỏ là mạng yếu hoặc mất mạng.
7. Bấm nút micro lần nữa để dừng. Muốn làm cuộc họp mới thì bấm **+** ở góc trên.
8. Nội dung tự lưu trong máy: tải lại trang hay tắt trình duyệt vẫn còn. Bấm **+** thì cuộc cũ được cất vào lịch sử (giữ 30 cuộc gần nhất).
9. Vào **Cài đặt** (góc trên phải) để gõ tên sếp, tên công ty, sản phẩm… giúp app nghe đúng hơn, và để chọn giao diện **Tối/Sáng**.

Màn hình luôn sáng trong lúc nghe. Nếu mạng chập chờn, app tự kết nối lại và vẫn giữ nguyên nội dung cũ.

### Các tính năng khác
- **Mọi kiểu trò chuyện** (Cài đặt → Kiểu trò chuyện): Tự hiểu (mặc định, AI đoán theo nội dung) / Công việc / Người yêu / Bạn bè. Quyết định giọng văn và xưng hô: công việc, người yêu → "anh – em" theo giọng nam/nữ; bạn bè → "mình – bạn". Lời dặn AI (dịch, tóm tắt, gợi ý trả lời, hỏi đáp) không còn giả định "họp với sếp".
- **Đọc sau mỗi câu** (mặc định khi bật loa): người kia nói hết câu mới đọc cho dễ tập trung; đợi bản AI dịch chuẩn tối đa 1,5 giây, quá thì đọc bản dịch nhanh đã sửa xưng hô. Có thể chọn "Đọc ngay khi đang nói" (từng vế, nhanh nhất). Tắt loa thì app không gọi dịch vụ đọc (không tốn tiền giọng đọc).
- **Cài đặt gọn**: Trò chuyện (ngôn ngữ, kiểu trò chuyện) → Đọc to → Hiển thị (pinyin chỉ hiện khi người kia nói tiếng Trung) → Nâng cao (gập sẵn: tên riêng, bối cảnh, tên của em, dịch lại chuẩn nghĩa, tự tạm dừng, chế độ nghe).
- **60 thứ tiếng** (Cài đặt → Ngôn ngữ cuộc họp): chọn thứ tiếng đối tác nói (Trung, Anh, Hàn, Nhật, Thái…, hoặc "Nhiều thứ tiếng – tự nhận") và tiếng của mình (mặc định tiếng Việt). Mọi câu của đối tác được dịch sang tiếng của mình; mình nói tiếng của mình thì không dịch. Chọn sẵn đúng thứ tiếng thì nghe chính xác nhất. Tiếng Trung có lời dặn AI riêng (giọng vùng miền, thành ngữ, 块 = tệ…), các thứ tiếng khác dùng lời dặn chung theo nghĩa người bản xứ.
- **Tự đọc bản dịch** (nút loa trên cùng, bật mặc định): đối tác nói tới đâu, app đọc to bản dịch tiếng Việt tới đó bằng giọng AI của Soniox (Hương/Linh/Mai, chọn và nghe thử trong Cài đặt). Trình duyệt nối thẳng tới Soniox bằng khoá tạm (`/api/tts-token`), mỗi vế câu có tiếng sau ~0,4–0,7 giây; bị tụt lại thì tự đọc nhanh dần. Cài đặt có 2 cách: *Đọc ngay* (từng vế, nhanh nhất – mặc định) và *Đọc bản chuẩn* (đợi AI dịch lại hết câu, chậm hơn ~2 giây). Lỗi thì đọc qua máy chủ (`/api/tts`), rồi giọng có sẵn của máy. Câu máy đọc lọt vào micro tự được bỏ qua. Chi phí thêm ~$0,70 cho mỗi giờ *giọng được đọc* (họp 1 giờ, đối tác nói ~40 phút ≈ 12.000đ). Nên đeo tai nghe.
- **Dịch và đọc cả hai bên**: Soniox dịch hai chiều trong cùng luồng nghe (`two_way`, không tốn thêm). Mình nói tiếng Việt → bản dịch sang tiếng đối tác hiện dưới câu của mình và được đọc to ra loa cho đối tác (sau khi nói xong câu, micro tạm ngắt trong lúc đọc). Tắt riêng chiều này bằng "Đọc cả lời em cho đối tác nghe" trong Cài đặt; chọn giọng đọc cho từng bên. Chế độ "Nhiều thứ tiếng (tự nhận)" thì lời mình được AI dịch sang thứ tiếng đối tác nói nhiều nhất.
- **Xưng hô theo giới tính người nói**: app đo cao độ giọng của từng câu ngay trên máy (giọng nam ~85–160 Hz, nữ ~165–260 Hz) → người nói nam: "anh… em", nữ: "em… anh"; đọc bằng giọng nam/nữ tương ứng (chọn giọng nam/nữ riêng trong Cài đặt). Chạm tên người nói để chỉnh tay Nam/Nữ. AI dịch lại nhận thêm mạch hội thoại 6 câu gần nhất của cả hai bên để hiểu đang nói chuyện gì. Bản dịch nhanh đọc ngay chỉ tự sửa "tôi/bạn/chúng tôi"; muốn xưng hô chuẩn tuyệt đối thì chọn "Đọc bản chuẩn".
- **Giới hạn Groq miễn phí**: mỗi model 200.000 token/ngày (~150 câu dịch lại). Họp dài hoặc thử nhiều trong ngày có thể hết lượt → app vẫn đọc/hiện bản dịch nhanh của Soniox, chỉ mất bước dịch lại chuẩn nghĩa. Nâng Groq lên gói Dev (trả theo dùng, rất rẻ) để không bị giới hạn.
- **🎯 Dịch lại chuẩn nghĩa bản địa** (bật mặc định, tắt trong Cài đặt): Soniox dịch nhanh trong lúc nói, sếp dứt câu thì AI dịch lại theo đúng ý người Trung đại lục – thành ngữ (拍板, 画饼…), khẩu ngữ, tiếng lóng, thuật ngữ thương mại (回款, 账期, 压货…) – kèm giải thích 💡. Câu đã dịch lại có dấu "✓ chuẩn".
- **Phiên âm pinyin** (bật mặc định, tắt trong Cài đặt): hiện cách đọc pinyin có dấu thanh ngay dưới câu tiếng Trung, kể cả lúc sếp đang nói dở câu. Chạy ngay trên máy bằng thư viện `pinyin-pro`, không tốn tiền, không cần mạng.
- **⏸ Tự tạm dừng khi phòng im lặng** (mặc định 3 phút, đổi trong Cài đặt): ngắt Soniox để khỏi tốn tiền, có người nói là tự nghe tiếp (giữ sẵn ~3 giây nên không mất chữ đầu câu).
- **🔔 Báo khi sếp gọi tên em:** nhập tên trong Cài đặt (vd. `小阮, Nguyễn`), sếp nhắc tới thì máy rung + thông báo, câu đó được làm nổi bật.
- **📌 Nhãn thông tin quan trọng** tự hiện dưới câu: 📅 ngày/thứ, ⏰ giờ, 💰 tiền, 📦 số lượng, 📊 phần trăm.
- **⭐ Đánh dấu câu quan trọng:** tóm tắt sẽ ưu tiên các câu này; trong Lịch sử có lọc "Chỉ câu ⭐".
- **🤖 Trợ lý** (nút bên phải micro): *Gợi ý trả lời* (3 cách nói + tiếng Trung + pinyin + đọc to + đưa sếp xem) và *Hỏi về cuộc họp* (vd. "Ai phải làm gì, hạn khi nào?").
- **✨ Tóm tắt cuốn chiếu:** tự cập nhật mỗi 5 phút trong lúc họp, mỗi lần chỉ gửi phần mới nên họp dài mấy tiếng vẫn tóm tắt được.
- **📄 Bối cảnh cuộc họp:** dán chương trình họp trong Cài đặt để nghe đúng thuật ngữ và gợi ý sát chủ đề hơn.
- **🕐 Lịch sử** (nút đồng hồ góc trên): xem lại từng cuộc họp, tóm tắt, **chia sẻ biên bản** qua Zalo/Messenger, tải `.md`, chép, xoá.
- Mỗi câu có **giờ:phút:giây** lúc nói.

## Vì sao dùng Soniox mà không dùng nhận giọng miễn phí của Google?

Chrome có sẵn nhận giọng nói miễn phí (Web Speech API), nhưng không hợp với cuộc họp:

- Chỉ nghe **một ngôn ngữ** mỗi lần. Người dùng phải tự bấm chọn Trung hay Việt trước mỗi câu.
- **Không có dịch.** Phải gọi thêm một dịch vụ dịch khác, và độ trễ sẽ cao hơn.
- **Không phân biệt người nói**, và không cho nhập tên riêng hay thuật ngữ.
- Hay **tự tắt** sau vài chục giây im lặng. Trên iPhone chạy rất chập chờn.

Soniox nghe, tự nhận ra ngôn ngữ, phân biệt người nói và dịch Trung → Việt **trong một luồng duy nhất**, có nhận danh sách thuật ngữ. Giá khoảng **$0.12 một giờ** (khoảng 3.000đ), đã gồm dịch. Độ chính xác với giọng địa phương vẫn cần test bằng ghi âm thật: dùng trang `/spike`.

## Chi phí (ước tính)

| Phần | Dùng gì | Giá |
|---|---|---|
| Nghe + dịch, chế độ **Chính xác** | Soniox `stt-rt-v5` | ~$0.12/giờ ≈ 3.000đ/giờ |
| Nghe + dịch, chế độ **Tiết kiệm** | Giọng nói trình duyệt (miễn phí) + Gemini 3.5 Flash-Lite dịch từng câu | vài trăm đồng/giờ |
| Tóm tắt | Gemini 3.8 Flash | ~vài trăm đồng/lần bấm |

Giá Gemini: gói trả phí ($0.75 / $3.75 mỗi 1 triệu token vào/ra với 3.8 Flash, áp dụng đến hết 2026). Ở gói trả phí Google **không** dùng nội dung để huấn luyện, còn gói miễn phí thì có dùng, nên cần bật thanh toán để giữ bí mật nội dung họp.

---

## 1. Lấy API key Soniox

1. Vào <https://console.soniox.com> và đăng ký hoặc đăng nhập.
2. Nạp tiền vào tài khoản (mục **Billing**). Soniox tính tiền theo số phút âm thanh.
3. Vào **API Keys**, bấm **Create API key**, rồi copy khoá (dạng chuỗi dài).

⚠️ Khoá này **chỉ để trên server** (file `.env.local` hoặc Environment Variables trên Vercel). Không dán vào code, không gửi qua chat.

## 1b. Lấy API key Gemini

1. Vào <https://aistudio.google.com/apikey> và bấm **Create API key**.
2. Bật thanh toán cho project (Google Cloud Billing), để dùng gói trả phí.
3. Dán khoá vào `GEMINI_API_KEY`.

## 2. Cài đặt và chạy trên máy tính

Cần Node.js 20 trở lên.

```bash
npm install
cp .env.example .env.local
```

Mở `.env.local` và điền:

```
SONIOX_API_KEY=khoá_vừa_copy
APP_PASSWORD=mat-khau-cua-ban   # mật khẩu vào app (tự đặt, đừng chia sẻ)
GEMINI_API_KEY=...      # khoá Gemini để tóm tắt + dịch ở chế độ tiết kiệm
GROQ_API_KEY=...        # (tuỳ chọn) có khoá này thì tóm tắt dùng Groq (miễn phí, giới hạn ~15–20 phút họp/lần)
```

Chạy:

```bash
npm run dev
```

Mở <http://localhost:3000> để dùng app, hoặc <http://localhost:3000/spike> để mở trang kiểm tra kỹ thuật.

## 3. Trang kiểm tra kỹ thuật `/spike`

**Test bằng file ghi âm** (nên làm trước):

1. Đăng nhập ở trang chính trước.
2. Mở `/spike` và chọn **File ghi âm**, rồi chọn file (.m4a của Ghi âm iPhone, .mp3, .wav…).
3. Bấm **Bắt đầu**. File được phát **đúng tốc độ thật** như đang họp, nên độ trễ đo được cũng giống lúc họp thật.
4. Đọc từng câu: câu gốc tiếng Trung, bản dịch tiếng Việt, người nói, độ trễ.
5. Xong thì bấm **Tải .txt** để soát lỗi, hoặc **Tải .json** để có đầy đủ dữ liệu thô.

**Test nói trực tiếp:** chọn **Nói trực tiếp**, bấm **Bắt đầu** và cho phép micro.

Các thông số trên trang này chỉ để thử nghiệm. App chính luôn dùng bộ thông số đã chỉnh sẵn (`DEFAULT_STT_OPTIONS` trong `src/lib/soniox/config.ts`).

**Thử tham số** (mục "Tham số nhận dạng & thuật ngữ"):

- **Thuật ngữ:** tên người, công ty, sản phẩm. Ví dụ `王总`, `深圳华强`.
- **Dịch cố định:** mỗi dòng `nguồn => đích`. Ví dụ `王总 => Tổng giám đốc Vương`.
- **Bối cảnh:** mô tả cuộc họp. Mặc định đã ghi rõ 3 sếp nói phổ thông giọng Quảng Đông, Hồ Nam và Bắc Kinh.
- **Độ nhạy tách câu / mức giảm trễ / chờ tối đa:** đánh đổi giữa tốc độ và độ chính xác.

Nên chạy cùng một file 2 lần, có và không có thuật ngữ, để so sánh.

## 4. Test trên điện thoại (cùng Wi-Fi)

Trình duyệt chỉ cho dùng micro trên **HTTPS**. Có hai cách:

- **Cách A: HTTPS tại máy**

  ```bash
  npm run dev:https
  ```

  Trên điện thoại mở `https://<IP máy tính>:3000`. Xem IP bằng lệnh `ipconfig getifaddr en0` trên macOS. Trình duyệt sẽ cảnh báo chứng chỉ tự ký: trên iPhone bấm **Hiển thị chi tiết → truy cập trang web này**, trên Android bấm **Nâng cao → Tiếp tục**.

- **Cách B: deploy lên Vercel** (xem mục 5). Đơn giản nhất và giống thật nhất.

Chế độ **File ghi âm** chạy được cả trên `http://` vì không cần micro.

## 5. Deploy lên Vercel

1. Đẩy code lên GitHub (repo riêng tư).
2. Vào <https://vercel.com/new> và import repo.
3. Ở **Environment Variables**, thêm `SONIOX_API_KEY`, `APP_PASSWORD` và `GEMINI_API_KEY`.
4. Bấm **Deploy**, rồi mở `https://<tên-app>.vercel.app`.

Khi đổi biến môi trường, vào **Deployments → Redeploy** để áp dụng.

## Bảo mật

- Khoá Soniox thật chỉ nằm ở server. Nhập đúng mật khẩu thì trình duyệt mới nhận được **khoá tạm sống 60 giây, dùng 1 lần**, chỉ đủ để mở kết nối.
- Mật khẩu không phân biệt chữ hoa/thường. Nhập sai sẽ bị làm chậm để chống dò. Đổi `APP_PASSWORD` thì mọi máy phải đăng nhập lại.
