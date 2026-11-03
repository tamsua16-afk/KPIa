# KPI 2027 – Khối IID (Chạy thử từ Tháng 12/2026)

Hệ thống quản lý, cascade và theo dõi đánh giá KPI 2027 dành cho Khối IID (hỗ trợ chạy thử hệ thống từ **Tháng 12/2026**).

## 📌 Tính năng chính

- **Cascade mục tiêu xuyên suốt**: IID (Khối) → Bộ phận → Cá nhân.
- **Set KPI theo từng tháng cho đến từng cá nhân**:
  - Hỗ trợ đặt chỉ tiêu KPI riêng cho từng tháng (gồm **Tháng 12/2026 chạy thử** và 12 tháng **T1–T12/2027**) cho từng cá nhân, bộ phận và toàn khối.
  - Công cụ phân bổ nhanh: Chia đều từ Mục tiêu năm, Áp dụng mức T12/2026 cho cả năm 2027, hoặc Tự động cộng dồn từ các tháng lên Mục tiêu năm.
  - Bảng tổng hợp Set KPI tháng cho toàn bộ nhân sự trên cùng một màn hình hoặc cửa sổ chi tiết cho từng cá nhân.
- **Tuân thủ nguyên tắc tỷ trọng**:
  - Khối IID: 5 KPI cốt lõi, tổng 100%.
  - Bộ phận: 30–70% IID, 3–5 KPI riêng (30–70%), tổng 100%.
  - Cá nhân: 20–40% IID, 30–50% Bộ phận, 20–40% riêng (tối đa 8 KPI), tổng 100%.
  - Trần điểm KPI: 120%.
- **Theo dõi thực tế & Thiết lập hàng tháng (Monthly Tracking & Target Setup)**:
  - Ba chế độ linh hoạt: **Nhập Thực tế tháng (Actual)**, **Set KPI theo tháng (Target)**, và **Song song (MT & Thực tế)**.
  - Bổ sung kỳ **Tháng 12/2026 (`T12/26`)** để chạy thử nghiệm hệ thống trước khi bước vào năm 2027.
- **Review theo kỳ chạy thử T12/2026 & hàng quý (Q1–Q4/2027)**: Tự đánh giá, quản lý phản hồi, chốt xếp loại A/B/C/D.
- **Cây liên kết KPI (Cascade Tree)**: Trực quan hóa mối quan hệ đóng góp giữa các cấp mục tiêu.
- **Kiểm tra nguyên tắc tự động**: Rà soát vi phạm tỷ trọng, cảnh báo KPI mồ côi hoặc vượt số lượng.
- **Phân quyền 4 cấp (RBAC) & Bảo mật dữ liệu**:
  - **Admin (Giám đốc Khối)**: Toàn quyền thiết lập mục tiêu, giám sát toàn khối, cấp tài khoản và đặt lại mật khẩu.
  - **Manager (Trưởng Bộ phận)**: Quản lý KPI phòng ban, cấp dưới, set KPI tháng và thực hiện đánh giá quý cho nhân viên.
  - **Leader (Trưởng nhóm)**: Giám sát tổ đội và KPI nhóm.
  - **Staff (Nhân viên)**: Xem KPI cá nhân, theo dõi chỉ tiêu tháng, nhập thực tế hàng tháng và tự đánh giá.
- **Tài khoản Email & Mật khẩu**:
  - Đăng nhập bảo mật bằng Email công việc và Mật khẩu cá nhân.
  - Mỗi cá nhân có thể tự đổi mật khẩu tài khoản trong trang hồ sơ.
  - Admin có quyền cấp mới tài khoản, import danh sách nhân sự từ CSV/Excel hoặc đặt lại mật khẩu.
  - Mật khẩu mặc định khởi tạo: `password123`.
- **Tổng hợp tự động (Auto Roll-up)**:
  - Tự động cộng dồn / tính trung bình cả **Mục tiêu tháng (Monthly Targets)** và **Kết quả thực tế (Monthly Actuals)** từ Nhân viên lên KPI Bộ phận và mục tiêu Khối IID.
- **Sao lưu & phục hồi**: Xuất / nhập dữ liệu JSON trực tiếp trên trình duyệt qua LocalStorage.

## 🚀 Khởi chạy ứng dụng

Mở trực tiếp file `index.html` bằng trình duyệt web hoặc chạy qua live server:

```bash
npx serve .
```
Truy cập: `http://localhost:3000` (hoặc cổng được hiển thị).
