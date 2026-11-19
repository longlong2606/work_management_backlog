# Gắn thẻ khóa cửa với Nhân sự (1 người 1 thẻ)

Ngày: 2026-11-19 · Đã duyệt: Bao

## Mục đích
Thẻ chỉ được gắn cho người có trong Nhân sự (bảng `users`), chọn bằng ô thả xuống có tìm kiếm. Không gõ tên tự do → không còn tên sai / tên lạ; lịch sử ra vào luôn ra đúng người.

## Quyết định (Bao chốt)
- 1 người 1 thẻ.
- Ô chọn: Combobox của **Base UI** (cách A). Bỏ `<datalist>` (giao diện không đồng nhất, không hiện "đã có thẻ") và tự viết (dễ sai bàn phím / trình đọc màn hình).
- Chọn người đã có thẻ → hỏi "Thay thẻ cũ?"; đồng ý thì xóa thẻ cũ, gắn thẻ mới.

## Thiết kế
- Database: dùng cột có sẵn `door_cards.user_id`, không đổi cấu trúc.
- Server (thêm / sửa thẻ khi có `user_id`):
  - `user_id` phải có trong `users`, nếu không → 400.
  - Người đó đã có thẻ khác: không có `replace=1` → 409 (kèm mã thẻ cũ); có `replace=1` → xóa thẻ cũ rồi gắn.
  - `card_holder` tự lấy theo `users.full_name`.
- Danh sách thẻ / lịch sử: tên hiển thị lấy theo `users.full_name` khi thẻ có `user_id` (đổi tên ở Nhân sự thì thẻ và lịch sử đổi theo).
- Khóa (key) vẫn thêm thẻ không gắn người (thẻ Master, đẩy thẻ cũ). Web hiện "Chưa gắn người" + ô chọn người.
- Giao diện: hộp Thêm/Sửa thẻ và khung "Thẻ vừa chạm" thay ô tên bằng ô chọn người. Mỗi dòng: họ tên, tên đăng nhập; người đã có thẻ có dòng phụ "đã có thẻ XX XX XX XX".
- Thẻ cũ gõ tay (không có `user_id`) hiện "Chưa gắn người" để gắn lại.

## Không làm
- Không tạo người mới từ trang Khóa cửa (tạo ở trang Nhân sự).
- Không cho 1 người nhiều thẻ.
