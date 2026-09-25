import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  weight: ["400", "500", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Ximi Dịch · Độ Ximitech",
  description: "Ximi Dịch – phiên dịch trò chuyện hai chiều, 60 thứ tiếng, theo thời gian thực",
  applicationName: "Ximi Dịch",
  authors: [{ name: "Độ Ximitech" }],
  creator: "Độ Ximitech",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Bàn phím mở thì trang co lại (ô nhập không bị che).
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0b" },
    { media: "(prefers-color-scheme: light)", color: "#f2ebe0" },
  ],
};

// Mặc định giao diện Sáng; chỉ chuyển Tối nếu người dùng đã chọn (lưu trong localStorage).
// Chạy trước khi vẽ trang để không bị nháy màu.
const themeScript = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.removeAttribute("data-theme")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      data-theme="light"
      suppressHydrationWarning
      className={`${beVietnam.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Tiện ích trình duyệt (vd. đổi con trỏ chuột) hay chèn class vào body → bỏ qua cảnh báo lệch hydration. */}
      <body className="relative isolate h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
