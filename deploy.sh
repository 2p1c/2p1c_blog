#!/bin/bash

# Hugo 博客自动部署脚本
# 作者: 2p1c
# 日期: 2026-01-25

set -e  # 遇到错误立即退出

echo "🚀 开始 Hugo 博客部署流程..."
echo "================================"

# 1️⃣ 本地构建
echo "📦 步骤 1/3: 构建静态网站..."
hugo
if [ $? -eq 0 ]; then
    echo "✅ 构建成功！"
else
    echo "❌ 构建失败，退出部署"
    exit 1
fi

echo ""

# 2️⃣ 同步到服务器
echo "📤 步骤 2/3: 同步文件到服务器..."
rsync -av --delete public/ root@39.106.85.231:/var/www/html/
if [ $? -eq 0 ]; then
    echo "✅ 文件同步成功！"
else
    echo "❌ 文件同步失败，退出部署"
    exit 1
fi

echo ""

# 3️⃣ 服务器对齐权限（在同一个 SSH 会话中执行）
echo "🔧 步骤 3/3: 设置服务器文件权限..."
ssh root@39.106.85.231 "sudo /usr/local/bin/fix-web-permissions.sh"
if [ $? -eq 0 ]; then
    echo "✅ 权限设置成功！"
else
    echo "⚠️  权限设置可能失败，但部署基本完成"
fi

echo ""
echo "🎉 部署完成！"
echo "🌐 网站地址: http://39.106.85.231"
echo "================================"