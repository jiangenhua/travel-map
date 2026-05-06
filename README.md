# 🌍 我的世界旅行地图

一个简洁优雅的世界旅行记录可视化工具，让你能够在世界地图上标记去过的国家，上传旅行照片，记录每段珍贵的旅程。

![预览](https://img.shields.io/badge/状态-在线使用-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ 功能特性

- 🗺️ **交互式世界地图** — 基于 Leaflet 的高性能地图，支持缩放和悬停查看
- ✅ **一键标记国家** — 点击国家即可标记为「已去过」，已访问国家会高亮显示
- 📸 **照片记录** — 为每个国家上传多张照片，自动压缩存储
- ⭐ **评分与笔记** — 给每段旅程打分并记录感受
- 📊 **实时统计** — 已去过国家数、照片数量、覆盖大洲、世界探索进度
- 🔍 **搜索过滤** — 快速搜索已记录的国家或城市
- 💾 **本地存储** — 数据保存在浏览器本地，隐私安全
- 📤 **导入/导出** — 支持 JSON 格式数据备份与迁移
- 📱 **响应式设计** — 适配桌面端和移动端

## 🚀 快速开始

### 在线使用

直接打开 [GitHub Pages 链接](https://jiangenhua.github.io/travel-map/) 即可使用（部署后）。

### 本地运行

由于现代浏览器对 `file://` 协议有跨域限制，需要通过本地服务器运行：

```bash
# 克隆仓库
git clone https://github.com/jiangenhua/travel-map.git
cd travel-map

# 方法一：使用 Python（推荐）
python3 -m http.server 8000

# 方法二：使用 Node.js
npx serve .

# 方法三：使用 PHP
php -S localhost:8000
```

然后在浏览器中打开 [http://localhost:8000](http://localhost:8000)

## 📖 使用指南

### 标记一个国家

1. 在地图上找到你去过的国家，点击它
2. 在弹出的窗口中打开「已去过这里」开关
3. 填写访问日期、城市、评分、笔记
4. 上传照片（支持多张）
5. 点击「保存」

### 查看记录

- **侧边栏列表**：按访问日期倒序展示所有已访问国家
- **点击列表项**：可重新打开该国家的详情进行编辑
- **搜索框**：按国家名或城市筛选

### 备份数据

- 点击右上角「**📤 导出**」按钮，下载 JSON 文件
- 点击「**📥 导入**」按钮，可恢复之前导出的数据
- 导入时可以选择「**合并**」（保留现有数据）或「**覆盖**」

## 🏗️ 技术栈

- **HTML5 + CSS3** — 原生 Web 标准，无需构建步骤
- **JavaScript (ES6+)** — 纯原生 JS，零运行时依赖
- **[Leaflet 1.9](https://leafletjs.com/)** — 轻量级开源地图库
- **[Natural Earth](https://www.naturalearthdata.com/)** — 高质量国家边界 GeoJSON 数据
- **[CartoDB](https://carto.com/basemaps/)** — 简洁地图底图
- **localStorage** — 浏览器本地数据持久化

## 📁 项目结构

```
travel-map/
├── index.html       # 主页面
├── style.css        # 样式表
├── script.js        # 主要逻辑
├── countries.js     # 国家数据（中英文名、国旗、大洲）
├── README.md        # 本文档
└── .gitignore
```

## 🔒 隐私说明

- ✅ **数据本地化**：所有数据（包括照片）仅存储在你的浏览器 localStorage 中
- ✅ **无服务端**：本项目是纯静态网站，没有任何后端服务收集数据
- ✅ **无追踪**：不使用任何分析或追踪服务
- ⚠️ **浏览器限制**：localStorage 通常限制 5-10 MB，建议定期导出备份
- ⚠️ **清除浏览器数据会清除记录**：请记得导出 JSON 备份

## 🛠️ 自定义

### 添加新的国家

编辑 `countries.js`，按以下格式添加：

```javascript
"ISO_CODE": { 
    zh: "中文名", 
    en: "English Name", 
    flag: "🏴", 
    continent: "所属大洲" 
}
```

### 修改地图样式

在 `script.js` 的 `getCountryStyle` 函数中调整颜色：

```javascript
return {
    fillColor: isVisited ? '#你的颜色' : '#e5e7eb',
    // ...
};
```

或更换底图，在 `initMap` 中替换 tileLayer：

```javascript
// 卫星图：'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
// 暗色：'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
```

## 📦 部署到 GitHub Pages

1. Fork 或克隆此仓库到你的 GitHub 账号
2. 进入仓库设置 `Settings` → `Pages`
3. Source 选择 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
4. 保存后等待几分钟，即可通过 `https://你的用户名.github.io/travel-map/` 访问

## 📄 License

MIT License — 自由使用、修改、分发

## 🙏 致谢

- [Leaflet](https://leafletjs.com/) — 优秀的开源地图库
- [Natural Earth](https://www.naturalearthdata.com/) — 公共领域地图数据
- [CartoDB](https://carto.com/) — 漂亮的地图底图

---

愿你的足迹遍布世界 ✈️ 🌍 ✨
