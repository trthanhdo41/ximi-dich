# Ximi Dịch

Web app phiên dịch trò chuyện **hai chiều, theo thời gian thực, 60 thứ tiếng**. Đặt điện thoại giữa hai người: ai nói tiếng gì, app hiện bản dịch và đọc to cho bên kia nghe. Dùng được cho công việc, người yêu, bạn bè…

Thiết kế & phát triển bởi **Độ Ximitech**.

## Tính năng

- **Nghe và dịch hai chiều** giữa tiếng của mình và 1 trong 60 thứ tiếng (hoặc tự nhận nhiều thứ tiếng), phân biệt từng người nói.
- **Dịch theo nghĩa người bản xứ**: AI dịch lại từng câu cho đúng thành ngữ, tiếng lóng, kèm giải thích.
- **Đọc to bản dịch** bằng giọng AI tự nhiên, sau mỗi câu hoặc ngay khi đang nói. Tắt được để đỡ tốn tiền.
- **Xưng hô đúng**: đoán giọng nam/nữ ngay trên máy (nam "anh – em", nữ "em – anh"; bạn bè "mình – bạn").
- **Tóm tắt, gợi ý câu trả lời, hỏi AI** về nội dung đang nói.
- Pinyin cho tiếng Trung, đánh dấu câu quan trọng, báo khi có người gọi tên mình.
- Tự tạm dừng khi im lặng, tự kết nối lại khi mất mạng.
- Nội dung chỉ lưu trong trình duyệt (localStorage). Lịch sử giữ 30 cuộc, chia sẻ hoặc tải `.md`.
- Giao diện tiếng Việt, tối/sáng, tối ưu cho điện thoại.

## Công nghệ

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion

| Phần | Dịch vụ |
|---|---|
| Nghe + dịch real-time | [Soniox](https://soniox.com) `stt-rt-v5` (WebSocket, dịch `two_way`) |
| Giọng đọc | Soniox TTS `tts-rt-v2` |
| Dịch lại, tóm tắt, gợi ý | [Groq](https://groq.com) (Qwen, gpt-oss), dự phòng Gemini |
| Chế độ tiết kiệm | Web Speech API của trình duyệt |

## Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install
cp .env.example .env.local   # rồi điền khoá (xem bảng dưới)
npm run dev                  # http://localhost:3000
```

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `SONIOX_API_KEY` | Có | Lấy tại [console.soniox.com](https://console.soniox.com) |
| `APP_PASSWORD` | Có | Mật khẩu vào app, tự đặt |
| `GROQ_API_KEY` | Nên có | Dịch lại chuẩn nghĩa, tóm tắt, gợi ý. Lấy tại [console.groq.com/keys](https://console.groq.com/keys) |
| `GEMINI_API_KEY` | Không | Dự phòng khi Groq hết lượt |

- **Thử trên điện thoại cùng Wi-Fi:** chạy `npm run dev:https`, mở `https://<IP máy tính>:3000`. Micro chỉ chạy trên HTTPS.
- **Trang kiểm tra kỹ thuật:** `/spike` để thử độ chính xác và độ trễ bằng file ghi âm.

## Deploy lên Vercel

1. Import repo tại [vercel.com/new](https://vercel.com/new), hoặc chạy `vercel deploy --prod`.
2. Thêm các biến môi trường ở trên vào **Settings → Environment Variables**.
3. Đổi biến môi trường xong thì phải deploy lại mới có tác dụng.

## Chi phí (ước tính)

| Phần | Giá |
|---|---|
| Nghe + dịch (Soniox) | ~$0,12/giờ (≈ 3.000đ), tính cả lúc im lặng |
| Giọng đọc (Soniox) | ~$0,70 mỗi giờ giọng được đọc ra |
| Dịch lại, tóm tắt (Groq) | Gói miễn phí: 200.000 token/ngày mỗi model (khoảng 150 câu dịch lại) |

## Bảo mật

- Khoá API chỉ nằm ở máy chủ. Trình duyệt chỉ nhận **khoá tạm**:
  - nghe: sống 60 giây, dùng 1 lần;
  - đọc: chỉ dùng được cho giọng đọc, hết hạn sau 1 giờ.
- Phải nhập đúng mật khẩu mới dùng được app. Nhập sai bị làm chậm để chống dò.
- Không commit `.env.local`. File này đã có trong `.gitignore`.
