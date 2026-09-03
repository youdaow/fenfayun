# 视频中转服务器（公网版）

一个零依赖的 Node.js 中转服务，解决「iPad 在外面也能把视频传到电脑」的问题。

架构：iPad 上传到本服务器 → 电脑端（视频分发工具）定时拉取 → 落到本地素材库。

## 一键部署（Linux，推荐）

```bash
# 把 server/ 目录上传到服务器后执行，或直接：
bash install.sh
```

脚本会自动：装到 `/opt/vd-relay`、生成随机密钥、写 systemd 服务并设为开机自启、
开放防火墙提示。跑完会打印「服务器地址 + 密钥」，直接填到工具里。

## 手动部署

```bash
npm install   # 无第三方依赖，可跳过
PORT=3880 TOKEN=你的密钥 node server.js
```

环境变量配置：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3880` |
| `TOKEN` | 上传/下载鉴权密钥（必填，否则不安全） | 空 |
| `DATA_DIR` | 视频存储目录 | `./uploads` |
| `MAX_SIZE` | 单文件大小上限（MB） | `2000` |

## 生产环境 HTTPS（强烈建议）

参考 `nginx.conf.example`，用 Nginx + certbot 配免费 HTTPS 证书。
配好后工具里的服务器地址填 `https://你的域名`。

## Docker

```bash
docker run -d --name vd-relay \
  -p 3880:3880 \
  -e TOKEN=你的密钥 \
  -v /data/vd-uploads:/app/uploads \
  -v $(pwd)/server.js:/app/server.js \
  node:18-alpine node /app/server.js
```

## 接口

- `GET /ping` — 健康检查
- `GET /` — iPad 上传页（自带）
- `GET /list?token=xxx` — 列出所有待拉取文件
- `POST /upload?token=xxx` — 上传（multipart，字段名 file）
- `GET /download/:name?token=xxx` — 下载
- `POST /delete/:name?token=xxx` — 删除（电脑拉取完成后调用）

## 电脑端配置

在视频分发工具「设置 → 远程中转」里填：
- 服务器地址（如 `https://你的域名` 或 `http://1.2.3.4:3880`）
- 密钥（与服务器 TOKEN 一致）
- 拉取间隔（默认 60 秒）

电脑会定时轮询 `/list`，发现新文件就下载到素材库并自动登记，随后调用 `/delete` 清理服务器端。

## 安全提示

- `TOKEN` 务必设置，否则任何人都能上传/下载你的文件。
- 建议放 Nginx 后面加 HTTPS，避免明文传输。
- 如果服务器磁盘小，可改为对接对象存储（OSS/COS），本脚本只做中转，替换 `saveFile`/`readFile` 即可。
