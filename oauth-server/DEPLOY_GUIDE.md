# OAuth Server 部署脚本使用指南

本目录包含自动化部署脚本，用于在 Linux 服务器上部署 OAuth Server。

## 📋 脚本说明

### deploy.sh (Linux - Docker)
使用原生 Docker 命令部署，完全控制容器配置。

**特点**：
- 完整的错误处理和日志输出
- 自动备份数据库
- 健康检查
- 详细的部署信息
- 支持首次部署和更新部署

## 🚀 使用方法

### 准备工作

1. **安装依赖**
   ```bash
   # Linux (Ubuntu/Debian)
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose git
   
   # CentOS/RHEL
   sudo yum install -y docker docker-compose git
   
   # macOS
   brew install docker docker-compose git
   ```

2. **配置脚本**
   
   编辑脚本文件，修改以下变量：
   ```bash
   REPO_URL="https://github.com/your-username/your-repo.git"  # 你的仓库地址
   BRANCH="master"  # 或 main
   PROJECT_DIR="/opt/oauth-server"  # 服务器上的安装目录
   ```

### Linux 部署

```bash
# 1. 手动克隆项目（首次部署）
sudo mkdir -p /opt
sudo chown $USER:$USER /opt
git clone git@github.com:your-username/your-repo.git /opt/oauth-server

# 2. 下载部署脚本（或直接使用项目中的脚本）
cd /opt/oauth-server/oauth-server
chmod +x deploy.sh

# 3. 编辑配置（可选）
nano deploy.sh  # 修改 BRANCH、PROJECT_DIR 等变量

# 4. 执行部署
sudo ./deploy.sh
```

## 🔄 更新部署

脚本会自动检测是否已有容器运行，执行以下步骤：
- 拉取最新代码
- 备份数据库
- 停止旧容器
- 构建新镜像
- 启动新容器
- 健康检查

直接再次运行脚本即可更新：

```bash
cd /opt/oauth-server/oauth-server
sudo ./deploy.sh
```

## 📊 部署后检查

### 1. 检查容器状态

```bash
docker ps | grep oauth-server
```

预期输出：
```
CONTAINER ID   IMAGE              STATUS         PORTS
abc123def456   oauth-server:latest   Up 2 minutes   0.0.0.0:3000->3000/tcp
```

### 2. 查看日志

```bash
docker logs -f oauth-server
```

### 3. 健康检查

```bash
curl http://localhost:3000/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "clients": 0,
  "sessions": 0,
  "uptime": 120
}
```

### 4. 访问管理界面

浏览器打开：`http://your-server-ip:3000/admin/admin.html`

## 🛠️ 常用命令

### 查看日志
```bash
docker logs -f oauth-server
```

### 停止服务
```bash
docker stop oauth-server
```

### 启动服务
```bash
docker start oauth-server
```

### 重启服务
```bash
docker restart oauth-server
```

### 进入容器
```bash
docker exec -it oauth-server sh
```

### 查看资源使用
```bash
docker stats oauth-server
```

## 🔧 故障排除

### 问题 1: 端口被占用

**错误**：
```
Error: bind: address already in use
```

**解决**：
```bash
# 查找占用端口的进程
sudo lsof -i :3000
# 或
sudo netstat -tulpn | grep 3000

# 停止占用端口的进程
sudo kill -9 <PID>
```

### 问题 2: 数据库文件权限错误

**错误**：
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**解决**：
```bash
# 修改数据库文件权限
sudo chmod 666 /opt/oauth-server/oauth-server/accounts.db
sudo chown 1000:1000 /opt/oauth-server/oauth-server/accounts.db
```

### 问题 3: Git 拉取失败

**错误**：
```
fatal: could not read Username for 'https://github.com'
```

**解决**：
```bash
# 使用 SSH 方式克隆（推荐）
# 修改脚本中的 REPO_URL 为：
REPO_URL="git@github.com:your-username/your-repo.git"

# 或配置 Git 凭据
git config --global credential.helper store
```

### 问题 4: Docker 构建失败

**错误**：
```
ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully
```

**解决**：
```bash
# 清理 Docker 缓存
docker system prune -a

# 重新运行部署脚本
sudo ./deploy.sh
```

## 📦 数据备份

### 自动备份

脚本会在每次更新前自动备份数据库：
```
/opt/oauth-server/oauth-server/accounts.db.backup.20240101_120000
```

只保留最近 5 个备份文件。

### 手动备份

```bash
# 备份数据库
cp /opt/oauth-server/oauth-server/accounts.db \
   /opt/oauth-server/oauth-server/accounts.db.backup.$(date +%Y%m%d)

# 备份整个目录
tar -czf oauth-server-backup-$(date +%Y%m%d).tar.gz \
   /opt/oauth-server/oauth-server/
```

### 恢复备份

```bash
# 停止容器
docker stop oauth-server

# 恢复数据库
cp /opt/oauth-server/oauth-server/accounts.db.backup.20240101 \
   /opt/oauth-server/oauth-server/accounts.db

# 启动容器
docker start oauth-server
```

## 🔐 安全建议

1. **使用 HTTPS**
   - 配置 Nginx 反向代理
   - 使用 Let's Encrypt 证书

2. **限制访问**
   - 配置防火墙规则
   - 使用 VPN 或 IP 白名单

3. **定期更新**
   - 定期运行部署脚本更新代码
   - 关注安全补丁

4. **监控日志**
   - 使用日志聚合工具（如 ELK）
   - 设置告警规则

## 📞 技术支持

如有问题，请查看：
- [OAuth Server README](README.md)
- [部署指南](../DEPLOYMENT.md)
- [项目主 README](../README.md)

或提交 Issue 到项目仓库。
