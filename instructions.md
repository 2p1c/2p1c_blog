# ✍️ Write a new post or change JS or CSS

（windows 版本）
1️⃣ 本地构建

`hugo`

2️⃣ 同步到服务器

`wsl rsync -av --delete public/ root@39.106.85.231:/var/www/html/`

3️⃣ 服务器对齐权限

`sudo /usr/local/bin/fix-web-permissions.sh`
（Mac 版本）

# 1️⃣ 本地构建

hugo

# 2️⃣ 同步到服务器

rsync -av --delete public/ root@39.106.85.231:/var/www/html/

# 3️⃣ 服务器对齐权限

ssh root@39.106.85.231 sudo /usr/local/bin/fix-web-permissions.sh
