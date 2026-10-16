# KPI 2027 – Khối IID

Hệ thống quản lý, cascade và theo dõi đánh giá KPI 2027 dành cho Khối IID.

## 📌 Tính năng chính

- **Cascade mục tiêu xuyên suốt**: IID (Khối) → Bộ phận → Cá nhân.
- **Tuân thủ nguyên tắc tỷ trọng**:
  - Khối IID: 5 KPI cốt lõi, tổng 100%.
  - Bộ phận: 30–70% IID, 3–5 KPI riêng (30–70%), tổng 100%.
  - Cá nhân: 20–40% IID, 30–50% Bộ phận, 20–40% riêng (tối đa 8 KPI), tổng 100%.
  - Trần điểm KPI: 120%.
- **Theo dõi thực tế hàng tháng (Monthly Tracking)**: Nhập liệu inline 12 tháng, tự tính lũy kế theo các cơ chế (Cộng dồn / Trung bình / Kỳ gần nhất).
- **Review hàng quý (Quarterly Review)**: Tự đánh giá, quản lý phản hồi, chốt xếp loại A/B/C/D.
- **Cây liên kết KPI (Cascade Tree)**: Trực quan hóa mối quan hệ đóng góp giữa các cấp mục tiêu.
- **Kiểm tra nguyên tắc tự động**: Rà soát vi phạm tỷ trọng, cảnh báo KPI mồ côi hoặc vượt số lượng.
- **Phân quyền 4 cấp (RBAC) & Bảo mật dữ liệu**:
  - **Admin (Giám đốc Khối)**: Toàn quyền thiết lập mục tiêu, giám sát toàn khối, cấp tài khoản và đặt lại mật khẩu.
  - **Manager (Trưởng Bộ phận)**: Quản lý KPI phòng ban, cấp dưới, thực hiện đánh giá quý cho nhân viên.
  - **Leader (Trưởng nhóm)**: Giám sát tổ đội và KPI nhóm.
  - **Staff (Nhân viên)**: Chỉ thấy KPI cá nhân, tự đánh giá quý của bản thân, bảo mật dữ liệu riêng tư.
- **Tài khoản Email & Mật khẩu**:
  - Đăng nhập bảo mật bằng Email công việc và Mật khẩu cá nhân.
  - Mỗi cá nhân có thể tự đổi mật khẩu tài khoản trong trang hồ sơ.
  - Admin có quyền cấp mới tài khoản hoặc đặt lại mật khẩu cho thành viên.
  - Mật khẩu mặc định khởi tạo: `password123`.
- **Tổng hợp tự động (Auto Roll-up)**:
  - Tự động cộng dồn / tính trung bình kết quả từ Nhân viên lên KPI Bộ phận và mục tiêu Khối IID.
- **Sao lưu & phục hồi**: Xuất / nhập dữ liệu JSON trực tiếp trên trình duyệt qua LocalStorage.

## 🚀 Khởi chạy ứng dụng

Mở trực tiếp file `index.html` bằng trình duyệt web hoặc chạy qua live server:

```bash
npx serve .
```
Truy cập: `http://localhost:3000` (hoặc cổng được hiển thị).

