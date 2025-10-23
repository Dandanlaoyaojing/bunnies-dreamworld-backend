@echo off
echo 停止小兔的梦幻世界笔记本后端服务器...
echo.

cd /d "%~dp0"

echo 停止PM2服务...
pm2 stop bunnies-dreamworld-backend

echo 删除PM2服务...
pm2 delete bunnies-dreamworld-backend

echo.
echo 服务器已停止！
echo.
pause
