# Kho Ảnh Của Tôi (My Gallery App)

Ứng dụng quản lý kho ảnh cá nhân trực tuyến, tích hợp dịch vụ lưu trữ đám mây Cloudinary và cơ sở dữ liệu MongoDB Atlas.

## Tính năng nổi bật
- **Đăng nhập bảo mật:** Bảo vệ kho ảnh bằng tài khoản cố định (`midaika` / `mimi90`).
- **Tải ảnh trực tuyến:** Tải ảnh trực tiếp từ trình duyệt lên đám mây Cloudinary mà không qua server trung gian.
- **Lưu trữ dữ liệu:** Lưu trữ link ảnh và thông tin phân loại vào MongoDB Atlas (ở chế độ chạy online/local) hoặc lưu cục bộ khi chưa cấu hình.
- **Tối ưu hiển thị:** Sử dụng Cloudinary SDK để tối ưu hóa kích thước ảnh thumbnail ở màn hình lưới, giúp tải trang nhanh chóng.
- **Xem ảnh sắc nét & Tải về:** Hỗ trợ xem ảnh lớn chất lượng gốc 100% sắc nét và tải trực tiếp file gốc về máy tính dễ dàng.
- **Phân loại Album:** Quản lý và sắp xếp hình ảnh theo Album và Dòng thời gian trực quan.

## Hướng dẫn chạy dự án ở Local
1. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```
2. Tạo file `.env` ở thư mục gốc và cấu hình chuỗi kết nối MongoDB của bạn:
   ```text
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/gallery
   ```
3. Chạy dự án ở môi trường phát triển:
   ```bash
   npm run dev
   ```

## Triển khai lên Vercel
Dự án đã được cấu hình sẵn các Serverless Functions tương thích với Vercel. 
Khi liên kết dự án với Vercel, bạn chỉ cần cấu hình biến môi trường `MONGODB_URI` trong phần cài đặt của Vercel Dashboard là hệ thống sẽ tự động đồng bộ trực tuyến.
