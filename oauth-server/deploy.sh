#!/bin/bash

# OAuth Server 部署脚本
# 用途：构建 Docker 镜像，创建/更新容器
# 注意：代码需要手动拉取后再运行此脚本

set -e  # 遇到错误立即退出

# 确定项目目录
# 1. 如果设置了环境变量 PROJECT_DIR，使用它
# 2. 如果脚本在项目目录下运行（包含 server.js），使用当前目录
# 3. 否则使用默认目录
if [ -n "$PROJECT_DIR" ]; then
    # 使用环境变量指定的目录
    PROJECT_DIR="$PROJECT_DIR"
elif [ -f "$(pwd)/deploy.sh" ] && [ -f "$(pwd)/server.js" ]; then
    # 脚本在项目目录下运行
    PROJECT_DIR="$(pwd)"
elif [ -n "$SUDO_USER" ]; then
    PROJECT_DIR="/opt/oauth-server"
else
    PROJECT_DIR="$HOME/oauth-server"
fi
CONTAINER_NAME="oauth-server"
IMAGE_NAME="oauth-server"
IMAGE_TAG="latest"

# MariaDB 备份配置（从 .env 读取）
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-oauth_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-oauth_server}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    echo_info "Docker 已安装: $(docker --version)"
}

# 检查 mysqldump 是否安装（用于备份 MariaDB）
check_mysqldump() {
    if ! command -v mysqldump &> /dev/null; then
        echo_warn "mysqldump 未安装，跳过数据库备份"
        return 1
    fi
    echo_info "mysqldump 已安装"
    return 0
}

# 检查项目目录
check_project_dir() {
    if [ ! -d "$PROJECT_DIR" ]; then
        echo_error "项目目录不存在: $PROJECT_DIR"
        echo_error "请确保在正确的目录下运行此脚本"
        exit 1
    fi

    echo_info "项目目录: $PROJECT_DIR"
    cd "$PROJECT_DIR"

    # 检查必要文件
    if [ ! -f "server.js" ]; then
        echo_error "未找到 server.js，请确认目录正确"
        exit 1
    fi

    if [ ! -f ".env" ]; then
        echo_warn ".env 文件不存在，请确保已配置数据库连接"
    fi

    echo_info "项目目录检查通过"
}

# 备份 MariaDB 数据库
backup_database() {
    if ! check_mysqldump; then
        return
    fi

    if [ -z "$DB_PASSWORD" ]; then
        echo_warn "数据库密码未配置，跳过备份"
        return
    fi

    BACKUP_DIR="$PROJECT_DIR/backups"
    mkdir -p "$BACKUP_DIR"

    BACKUP_FILE="$BACKUP_DIR/oauth_server_$(date +%Y%m%d_%H%M%S).sql"

    echo_info "备份 MariaDB 数据库到: $BACKUP_FILE"

    # 使用 mysqldump 备份数据库
    if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
        echo_info "数据库备份成功"

        # 压缩备份文件
        gzip "$BACKUP_FILE" && echo_info "备份文件已压缩"

        # 只保留最近 10 个备份
        ls -t "$BACKUP_DIR"/oauth_server_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
        echo_info "已清理旧备份（保留最近 10 个）"
    else
        echo_warn "数据库备份失败，继续部署..."
        rm -f "$BACKUP_FILE"
    fi
}

# 停止并删除旧容器
stop_old_container() {
    echo_info "检查旧容器状态..."

    # 检查容器是否存在
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        # 获取容器状态
        local container_status=$(docker inspect -f '{{.State.Status}}' $CONTAINER_NAME 2>/dev/null || echo "not found")
        echo_info "发现旧容器，状态: $container_status"

        # 如果容器正在运行，先停止
        if [ "$container_status" = "running" ]; then
            echo_info "停止运行中的容器..."
            if ! docker stop $CONTAINER_NAME 2>/dev/null; then
                echo_warn "正常停止失败，强制停止容器..."
                docker kill $CONTAINER_NAME 2>/dev/null || true
            fi
            # 等待容器完全停止
            sleep 2
        fi

        # 删除容器
        echo_info "删除旧容器..."
        if ! docker rm $CONTAINER_NAME 2>/dev/null; then
            echo_warn "正常删除失败，强制删除容器..."
            docker rm -f $CONTAINER_NAME 2>/dev/null || true
        fi

        # 验证容器已删除
        if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo_error "容器删除失败，请手动删除: docker rm -f $CONTAINER_NAME"
            exit 1
        fi

        echo_info "旧容器已成功删除"
    else
        echo_info "没有发现旧容器"
    fi
}

# 删除旧镜像（可选）
remove_old_image() {
    echo_info "检查旧镜像..."

    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:${IMAGE_TAG}$"; then
        echo_info "发现旧镜像: ${IMAGE_NAME}:${IMAGE_TAG}"

        # 检查是否有容器正在使用该镜像
        local using_containers=$(docker ps -a --filter "ancestor=${IMAGE_NAME}:${IMAGE_TAG}" --format '{{.Names}}' | wc -l)
        if [ "$using_containers" -gt 0 ]; then
            echo_warn "有 $using_containers 个容器正在使用该镜像，跳过删除"
            return
        fi

        echo_info "删除旧镜像..."
        if ! docker rmi "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null; then
            echo_warn "正常删除失败，强制删除镜像..."
            docker rmi -f "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null || true
        fi

        echo_info "旧镜像已删除"
    else
        echo_info "没有发现旧镜像"
    fi
}

# 构建 Docker 镜像
build_image() {
    echo_info "构建 Docker 镜像..."
    cd "$PROJECT_DIR"
    docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .
    echo_info "镜像构建完成"
}

# 启动容器
start_container() {
    echo_info "启动新容器..."
    cd "$PROJECT_DIR"

    # 检查 .env 文件是否存在
    if [ ! -f ".env" ]; then
        echo_error ".env 文件不存在，无法启动容器"
        exit 1
    fi

    docker run -d \
        --name $CONTAINER_NAME \
        -p 3000:3000 \
        -v "$PROJECT_DIR/.env:/app/.env:ro" \
        -e NODE_ENV=production \
        -e PORT=3000 \
        --restart unless-stopped \
        "${IMAGE_NAME}:${IMAGE_TAG}"

    echo_info "容器启动完成"
}

# 检查容器健康状态
check_health() {
    echo_info "等待服务启动..."
    sleep 5
    
    for i in {1..10}; do
        if docker exec $CONTAINER_NAME node -e "require('http').get('http://localhost:3000/api/stats', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" 2>/dev/null; then
            echo_info "服务健康检查通过 ✓"
            return 0
        fi
        echo_warn "等待服务启动... ($i/10)"
        sleep 3
    done
    
    echo_error "服务健康检查失败"
    echo_error "查看容器日志:"
    docker logs --tail 50 $CONTAINER_NAME
    return 1
}

# 显示部署信息
show_info() {
    echo ""
    echo_info "=========================================="
    echo_info "OAuth Server 部署完成！"
    echo_info "=========================================="
    echo_info "容器名称: $CONTAINER_NAME"
    echo_info "镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
    echo_info "数据库: MariaDB ($DB_HOST:$DB_PORT)"
    echo_info "访问地址: http://localhost:3000"
    echo_info "管理界面: http://localhost:3000/admin/admin.html"
    echo_info "健康检查: http://localhost:3000/health"
    echo ""
    echo_info "常用命令:"
    echo "  查看日志: docker logs -f $CONTAINER_NAME"
    echo "  停止服务: docker stop $CONTAINER_NAME"
    echo "  启动服务: docker start $CONTAINER_NAME"
    echo "  重启服务: docker restart $CONTAINER_NAME"
    echo "  进入容器: docker exec -it $CONTAINER_NAME sh"
    echo ""
    echo_info "数据库备份:"
    echo "  备份目录: $PROJECT_DIR/backups/"
    echo "  手动备份: mysqldump -h $DB_HOST -P $DB_PORT -u $DB_USER -p $DB_NAME > backup.sql"
    echo_info "=========================================="
}

# 主流程
main() {
    echo_info "=========================================="
    echo_info "开始部署 OAuth Server"
    echo_info "=========================================="
    echo_warn "注意：请确保已手动拉取最新代码"
    echo ""

    # 检查依赖
    check_docker

    # 检查项目目录
    check_project_dir

    # 备份 MariaDB 数据库
    backup_database

    echo ""
    echo_info "=========================================="
    echo_info "清理旧资源"
    echo_info "=========================================="

    # 停止旧容器
    stop_old_container

    # 删除旧镜像（可选，节省磁盘空间）
    remove_old_image

    echo ""
    echo_info "=========================================="
    echo_info "构建和启动新容器"
    echo_info "=========================================="

    # 构建新镜像
    build_image

    # 启动新容器
    start_container

    # 健康检查
    if check_health; then
        show_info
        exit 0
    else
        echo_error "部署失败，请检查日志"
        echo_error "查看日志命令: docker logs $CONTAINER_NAME"
        exit 1
    fi
}

# 执行主流程
main
