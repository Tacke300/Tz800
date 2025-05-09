#!/bin/bash

echo "===== BẮT ĐẦU DEPLOY ====="

# Di chuyển đến thư mục dự án
cd /home/tacke300 || {
    echo "Không tìm thấy thư mục /home/tacke300"
    exit 1
}

echo "Đang reset local code..."
git reset --hard HEAD

echo "Đang thực hiện git pull (rebase)..."
git pull --rebase origin main || {
    echo "Lỗi khi pull từ git!"
    exit 1
}

echo "Pull thành công."

# Nếu cần chạy lệnh sau pull (ví dụ: khởi động bot)
# echo "Restart bot..."

echo "===== HOÀN TẤT DEPLOY ====="
