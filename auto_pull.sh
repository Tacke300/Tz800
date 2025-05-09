#!/bin/bash        
WORK_DIR=~         
cd "$WORK_DIR" || { echo "Không thể di chuyển đến thư mục $WORK_DIR"; exit 1; }
if [ -d ".git" ]; then                            
    echo "Đang thực hiện git pull..."
    git pull origin main || { echo "Lỗi khi pull từ git!"; exit 1; }                                
else                                              
    echo "Không phải là git repository. Bỏ qua git pull."                                           
fi                                      
echo "Hoàn thành pull và các tác vụ khác!"
