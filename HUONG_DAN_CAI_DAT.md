# Cài Thi CBKT trên WordPress Hosting iNET

Gói này là **Node.js App chạy cùng tài khoản cPanel**, không phải plugin
WordPress. Cách an toàn nhất là đặt ứng dụng tại một subdomain riêng, ví dụ
`https://thi.tenmien.vn`, trong khi website WordPress tiếp tục chạy ở tên miền
chính.

## 1. Kiểm tra gói hosting

Trong cPanel phải có mục **Software → Setup Node.js App** và cho phép chọn Node.js
20 trở lên. Nếu không có mục này, hãy yêu cầu iNET bật tính năng hoặc nâng cấp
gói hosting. Hướng dẫn chính thức:

https://helpdesk.inet.vn/knowledgebase/huong-dan-cai-dat-nodejs-tren-cpanel-hosting

## 2. Tạo ứng dụng

1. Tạo subdomain, ví dụ `thi.tenmien.vn`.
2. Tải ZIP lên File Manager và giải nén vào một thư mục riêng, ví dụ
   `/home/TAIKHOAN/thi-cbkt`.
3. Mở **Setup Node.js App → Create Application**.
4. Chọn:
   - Node.js version: 20 hoặc 22.
   - Application mode: Production.
   - Application root: thư mục vừa giải nén.
   - Application URL: subdomain đã tạo.
   - Application startup file: `app.js`.
5. Bấm **Run NPM Install**.

## 3. Biến môi trường

Khai báo trong phần Environment Variables của Node.js App:

```text
NODE_ENV=production
DATABASE_URL=file:./production.db
WEB_ORIGIN=https://thi.tenmien.vn
WEB_DIST=public
HOST=0.0.0.0
COOKIE_SECURE=true
```

Không tự đặt `PORT` nếu cPanel đã cấp biến này. `WEB_ORIGIN` phải đúng tuyệt đối
với địa chỉ HTTPS thực tế và không có dấu `/` ở cuối.

Sau đó bấm **Restart Application**.

## 4. Kiểm tra sau cài đặt

- Trang chính: `https://thi.tenmien.vn`
- Health check: `https://thi.tenmien.vn/api/public/health`
- Quản trị mặc định:
  - Email: `admin@cbkt.local`
  - Mật khẩu: `Cbkt@2026!`

Đăng nhập quản trị, vào **Tổng quan & cấu hình → Đổi mật khẩu quản trị** và đổi
mật khẩu ngay. Sau đó cấu hình thời gian kỳ thi, Đội và danh sách thí sinh.

## 5. Dữ liệu và sao lưu

Dữ liệu nằm trong `prisma/production.db`. Cần sao lưu tệp này trước khi:

- cập nhật phiên bản;
- di chuyển hosting;
- thao tác lớn với danh sách hoặc ngân hàng câu hỏi.

Không ghi đè `prisma/production.db` khi cập nhật nếu muốn giữ dữ liệu thật.

## 6. Cập nhật phiên bản sau này

1. Sao lưu `prisma/production.db`.
2. Tải mã mới lên nhưng giữ lại tệp cơ sở dữ liệu trên.
3. Chạy **Run NPM Install**.
4. Trong Terminal của Node.js App chạy `npm run db:push`.
5. Restart Application và kiểm tra `/api/public/health`.

## Lưu ý

- Bắt buộc dùng HTTPS trong môi trường thật.
- Không giải nén gói này vào thư mục plugin WordPress.
- Nếu chỉ có WordPress/PHP/MySQL mà không có Setup Node.js App, gói này không thể
  chạy trực tiếp; cần iNET bật Node.js App hoặc dùng Cloud Server/VPS.
