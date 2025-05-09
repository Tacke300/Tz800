#!/bin/bash

echo "===== BẮT ĐẦU DEPLOY ====="

# B1: Di chuyển đến thư mục dự án
cd /home/tacke300 || {
    echo "[B1] Không tìm thấy thư mục /home/tacke300"
    exit 1
}
echo "[B1] Đã vào thư mục dự án."

# B2: Reset code local về HEAD
echo "[B2] Đang reset local code về HEAD..."
git reset --hard HEAD || {
    echo "[B2] Lỗi khi reset code!"
    exit 1
}
echo "[B2] Reset thành công."

# B3: Git pull với rebase
echo "[B3] Đang thực hiện git pull --rebase origin main..."
git pull --rebase origin main || {
    echo "[B3] Lỗi khi pull từ git!"
    exit 1
}
echo "[B3] Pull thành công."

# B4: (Tuỳ chọn) Restart bot nếu cần
# echo "[B4] Đang restart bot với PM2..."
# pm2 restart tz800 || {
#     echo "[B4] Lỗi khi restart bot!"
#     exit 1
# }
# echo "[B4] Bot đã được restart."

echo "===== HOÀN TẤT DEPLOY ====="
