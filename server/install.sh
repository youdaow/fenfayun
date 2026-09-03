#!/usr/bin/env bash
# 一键部署脚本：在 Linux 服务器上安装并常驻运行视频中转服务
# 用法：curl -fsSL https://你的域名/install.sh | bash  或  bash install.sh
set -euo pipefail

APP_DIR="/opt/vd-relay"
SERVICE_NAME="vd-relay"
PORT="${PORT:-3880}"
# 生成随机密钥（若未手动指定）
TOKEN="${TOKEN:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)}"

echo "=============================================="
echo "  视频中转服务器 一键部署"
echo "=============================================="

# 1. 检查依赖
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未检测到 Node.js，请先安装 Node 18+"
  echo "   推荐：curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
  exit 1
fi
NODE_VER=$(node -v)
echo "✅ Node 版本：${NODE_VER}"

# 2. 创建目录并部署代码
mkdir -p "${APP_DIR}"
cp server.js "${APP_DIR}/server.js"
echo "✅ 代码已部署到 ${APP_DIR}"

# 3. 写 systemd 服务
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Video Relay Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=TOKEN=${TOKEN}
Environment=DATA_DIR=${APP_DIR}/uploads
Environment=MAX_SIZE=2000
ExecStart=$(command -v node) ${APP_DIR}/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
systemctl restart "${SERVICE_NAME}"

echo "✅ 服务已启动并设为开机自启"
echo ""
echo "=============================================="
echo "  部署完成！"
echo "=============================================="
IP=$(curl -fsSL ifconfig.me 2>/dev/null || echo "你的公网IP")
echo " 服务地址：  http://${IP}:${PORT}"
echo " 鉴权密钥：  ${TOKEN}"
echo " 健康检查：  curl http://${IP}:${PORT}/ping"
echo ""
echo " 查看日志：  journalctl -u ${SERVICE_NAME} -f"
echo " 查看状态：  systemctl status ${SERVICE_NAME}"
echo ""
echo " ⚠️  请务必开放防火墙端口："
echo "     ufw allow ${PORT}/tcp    (Ubuntu/Debian)"
echo "     firewall-cmd --add-port=${PORT}/tcp --permanent && firewall-cmd --reload   (CentOS)"
echo ""
echo " 📱 把下面的信息填到「视频分发」工具的 设置→远程中转："
echo "     服务器地址： http://${IP}:${PORT}"
echo "     密钥 Token： ${TOKEN}"
echo ""
echo " 🔐 建议后续配 Nginx + HTTPS（见 nginx.conf.example）"
