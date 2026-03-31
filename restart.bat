@echo off
chcp 65001 >nul
title OmniChat Dev Server - Restart Tool
color 0B

echo ========================================================
echo        STEPWELL OMNICHAT - KHỞI ĐỘNG LẠI DỰ ÁN
echo ========================================================
echo.
echo Đang dập tắt ngầm các tiến trình hệ thống cũ (nếu có)...
echo.

:: Tắt giao diện Electron cũ đang treo
taskkill /F /IM electron.exe /T >nul 2>&1

:: Tắt tiến trình Node.js (Vite)
taskkill /F /IM node.exe /T >nul 2>&1

echo [OK] Đã dọn dẹp sạch sẽ bộ nhớ RAM!
echo.
echo Đang biên dịch lại mã nguồn nội gián (Preload Script)...
echo Khởi động Server Vite & ứng dụng OmniChat...
echo.
echo Chú ý: Cửa sổ đen này sẽ biến thành máy chủ dự án. Vui lòng không X TẮT nó khi đang chat Zalo.
echo ========================================================
echo.

:: Di chuyển đúng ổ đĩa và đường dẫn dự án
cd /d "d:\UNGDUNG\Chatportal\omnichat"

:: Trực tiếp kích hoạt lệnh NPM
call npm run dev

echo.
pause
