@echo off
echo 启动小兔的梦幻世界笔记本后端服务器...
echo.

cd /d "%~dp0"

echo 检查PM2是否已安装...
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo PM2未安装，正在安装...
    npm install -g pm2
)

echo 启动服务器...
pm2 start ecosystem.config.js

echo.
echo 服务器启动完成！
echo 访问地址: http://localhost:3000
echo 健康检查: http://localhost:3000/api/v1/health
echo.
echo 常用命令:
echo   pm2 status     - 查看服务状态
echo   pm2 logs       - 查看日志
echo   pm2 restart    - 重启服务
echo   pm2 stop       - 停止服务
echo   pm2 delete     - 删除服务
echo.
pause
