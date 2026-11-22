# MINECRAFT_SNAS

一个为 **MINECRAFT_SNAS** 制作的 Minecraft 风格个人网站。使用原生 HTML / CSS / JavaScript 与 **Node.js** 编写，零第三方依赖。

网站当前展示的真实信息：

- 2018 年从网易版入坑
- 2019 年开始在花雨庭玩 PVP，进入 PVP 圈子
- 2020 年转到国际版，现在完全在国际版游玩
- 喜欢 PVP、生存、探索
- 自评：建筑 20、红石 2、PVP 50
- 皮肤：MINECRAFT_SNAS

没有作品展示和留言模块；虚构的项目、开发经历和留言数据已经移除。

## 快速开始

需要 Node.js 18 或更高版本。

```bash
cd HTML
npm start
```

打开终端输出的地址：

```text
http://127.0.0.1:3000
```

也可以直接双击 `public/index.html` 查看页面；静态资源都使用相对路径。正式使用仍推荐通过 Node.js 服务访问。

开发时可以启用自动重启：

```bash
npm run dev
```

也可以直接用 Node 启动：

```bash
node server.js
```

通过环境变量修改端口或监听地址：

```powershell
$env:PORT=8080
$env:HOST='0.0.0.0'
npm start
```

### 样式没有更新

`styles.css` 和 `script.js` 的链接带有 `?v=` 版本参数，用于绕过浏览器和 CDN 的旧缓存。修改 CSS 后如果仍看到旧页面，强制刷新一次：

```text
Ctrl + F5
```

### 端口被占用（EADDRINUSE）

同一个端口只能被一个进程监听。出现 `EADDRINUSE: address already in use 127.0.0.1:3000` 时：

1. 通常已经有一个 `npm start`、`npm run dev` 或 `node server.js` 在运行，直接打开 <http://127.0.0.1:3000> 即可。
2. 不要同时运行 `npm start` 和 `npm run dev`；先按 `Ctrl+C` 停掉旧的进程，再启动新的。
3. 或者换一个端口：

```powershell
$env:PORT=3001
npm start
```

Windows 下查看占用 3000 端口的进程：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
```

## 功能

- **开场动画**：`MINECRAFT_SNAS` 居中逐字出现，14 个字符分别使用弹出、坠落、翻转、展开、旋转等 14 组独立动效；支持跳过、`Esc` 和 `prefers-reduced-motion`。
- **关于与轨迹**：只使用已提供的真实信息，记录 2018 网易版、2019 花雨庭 PVP、2020 国际版到现在的经历。
- **三种玩法**：PVP、生存、探索，使用横向编辑排版而不是四卡片模板。
- **自评数据**：建筑 20、红石 2、PVP 50。
- **个人皮肤 / 3D 模型**：使用 MINECRAFT_SNAS 皮肤制作可旋转、行走的 CSS 3D 角色，并渲染第二层帽子/外层贴图；资料块使用皮肤脸部，网站图标保持原方块图标。
- **性能友好的 3D**：角色由 CSS 3D 方块搭建，使用单张皮肤贴图，不引入 WebGL / Three.js。
- **响应式布局**：桌面、平板和手机端分别适配，带可展开的移动端导航。
- **性能优化**：开场动画只使用 `transform` / `opacity`，结束后整层从 DOM 移除；页面不可见或 Hero 离开视口时暂停装饰动画；静态资源支持 Brotli / gzip 压缩和 ETag 304 协商缓存。
- **无障碍**：键盘焦点、跳过链接、开场期间背景 `inert`、`aria-live` 状态提示，并支持减少动态效果。
- **安全响应头**：CSP、`nosniff`、`X-Frame-Options`、权限策略等。
- **自定义 404 页面**。

## 文件结构

```text
HTML/
├─ package.json          # 启动脚本与 Node 版本要求
├─ server.js             # 零依赖 Node.js 静态服务器 + 健康检查 API
├─ README.md
├─ config.yml            # 用户自己的 Cloudflare Tunnel 配置
├─ preview/              # 页面预览截图
└─ public/
   ├─ index.html         # 页面结构与内联 SVG 插画
   ├─ styles.css         # 全部视觉、动画与响应式样式
   ├─ script.js          # 开场、滚动、导航和复制 ID 交互
   ├─ assets/
   │  ├─ skin.png        # MINECRAFT_SNAS 完整 64×64 皮肤贴图
   │  ├─ skin-face.png   # 从 MINECRAFT_SNAS 皮肤裁出的 8×8 脸部
   │  └─ skin-face-64.png
   ├─ favicon.svg
   └─ 404.html
```

## 修改内容

- **个人信息**：编辑 `public/index.html`。搜索 `2018`、`PVP`、`建筑`、`红石` 可定位相关文案。
- **自评分数**：修改 Hero 中的 `data-count="20"`、`data-count="50"`，以及 About 中 `style="--value: 20%"`、`2%`、`50%`。
- **喜欢的事**：编辑 `#craft` 下的 `.like-row` 横向列表。
- **时间线**：编辑 `#journey` 下的 `.timeline-item`。
- **颜色**：所有主题色集中在 `public/styles.css` 顶部的 `:root`。
- **皮肤头像**：替换 `public/assets/skin-face.png` 和 `skin-face-64.png` 即可。
- **3D 皮肤**：角色由 `index.html` 中的 `.skin-*` 方块和 `public/assets/skin.png` 驱动；替换皮肤文件即可换装。

> 如果之后要恢复作品展示，请直接提供真实的项目名、类型、年份和一句简介。不会再使用占位项目或虚构经历。

## API

### `GET /api/health`

```json
{
  "ok": true,
  "status": "online",
  "uptime": 42,
  "node": "v24.21.0"
}
```

留言接口和 `data/guestbook.json` 已随留言模块一起删除。

---

在方块与冒险之间，继续探索。
