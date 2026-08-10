# PlaceDecide

Ứng dụng khám phá địa điểm, lưu địa điểm cá nhân/nhóm và gợi ý nơi đi dựa trên hoạt động, ngân sách, thời gian, bán kính và vị trí hiện tại.

## Chạy local

Yêu cầu: Node.js 20+, Docker Desktop và PowerShell (Windows).

```powershell
cd D:\Web\team-main
Copy-Item .env.example .env
docker run --name placedecide-db-5433 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=placedecide -p 5433:5432 -d postgres:17
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Mở `http://localhost:3000`. Nếu container đã tồn tại, dùng `docker start placedecide-db-5433` thay cho `docker run`.

`.env` tối thiểu:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/placedecide?schema=public"
AUTH_SECRET="thay-bang-chuoi-ngau-nhien-dai"
```

## Các lệnh kiểm tra

```powershell
npx prisma validate
npx prisma migrate status
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## Chức năng chính

- Đăng ký, đăng nhập, đăng xuất, đổi/quên mật khẩu.
- Email verification được phát hành để dùng khi cần, nhưng **không bắt buộc**: tài khoản mới ở trạng thái hoạt động và có thể đăng nhập ngay.
- Khám phá theo danh mục, tìm kiếm, bản đồ Leaflet với icon theo loại địa điểm.
- “Đi đâu bây giờ?”: nhập địa chỉ hoặc dùng GPS, tính khoảng cách và hỗ trợ lựa chọn `>10KM`.
- Lưu địa điểm, đánh dấu muốn đi/đã ghé, bộ sưu tập, nhóm và phân quyền nhóm.
- Import CSV/XLSX/XLS/TXT/DOCX/PDF, xem trước, chọn địa điểm và lưu vào cá nhân hoặc nhóm.

## Import file mẫu

File mẫu có sẵn tại `outputs/place-import-sample.xlsx`. Các cột nên có: `Tên`, `Địa chỉ`, `Danh mục`, `Khu vực`, `Giá`, `Mô tả`, `Điện thoại`, `Website`, `Vĩ độ`, `Kinh độ`, `Tags`.

Import được giới hạn 15 MB và tối đa 500 dòng để giảm rủi ro khi xử lý file không tin cậy.

## Ghi chú bảo mật

`npm audit --omit=dev` hiện báo một cảnh báo high từ `xlsx@0.18.5`; npm chưa cung cấp bản sửa tự động cho advisory này. Parser đã được giới hạn kích thước/số dòng và chỉ chạy ở server. Khi thư viện upstream có bản sửa tương thích, cần nâng dependency và chạy lại toàn bộ các lệnh kiểm tra ở trên.
