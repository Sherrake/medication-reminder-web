# 将吃药提醒部署到 GitHub Pages（网页版）

本文件夹为独立网页版，可直接用于部署。按下面步骤即可在网页上运行；支持**同步码**，换设备输入同一码即可恢复数据（配置 Firebase 后为云端同步）。

---

## 一、部署到 GitHub Pages（必做）

### 准备工作

| 准备项 | 说明 |
|--------|------|
| **GitHub 账号** | 在 [github.com](https://github.com) 注册并登录。 |
| **本机已装 Git** | 在终端执行 `git --version` 能显示版本号即表示已安装；未安装可到 [git-scm.com](https://git-scm.com) 下载。 |
| **项目文件就绪** | 确保 `medication-reminder-web` 文件夹内已有 `index.html`、`styles.css`、`app.js`、`firebase-config.js`、`manifest.json`、`sw.js`、`README.md`、`DEPLOY.md`。 |

### 方式 A：本文件夹作为仓库根目录（推荐）

**步骤 1：在 GitHub 上创建空仓库**

1. 登录 GitHub，点击右上角 **+** → **New repository**。
2. **Repository name** 填：`medication-reminder`（或你喜欢的名字，如 `med-reminder`）。
3. **Description** 可填：吃药提醒网页版（可选）。
4. 选择 **Public**。
5. **不要**勾选 “Add a README file”、“Add .gitignore”、“Choose a license”，保持仓库为空。
6. 点击 **Create repository**。创建完成后会看到一个空仓库页面，记下你的**用户名**和**仓库名**（后面命令里要替换）。

**步骤 2：在本机把本文件夹推送到该仓库**

1. 打开终端（PowerShell 或 CMD），进入本文件夹：
   ```bash
   cd c:\Users\shichaoran1\Desktop\cursor-practice\medication-reminder-web
   ```
2. 依次执行（把 `你的用户名` 换成你的 GitHub 用户名，`medication-reminder` 换成你刚建的仓库名）：
   ```bash
   git init
   git add index.html styles.css app.js firebase-config.js manifest.json sw.js README.md DEPLOY.md
   git commit -m "吃药提醒 PWA with sync"
   git branch -M main
   git remote add origin https://github.com/你的用户名/medication-reminder.git
   git push -u origin main
   ```
3. 若提示输入账号密码：密码处需填 **Personal Access Token**（GitHub 已不再支持账号密码）。在 GitHub → **Settings → Developer settings → Personal access tokens** 中生成一个 token，用 token 当密码。

**步骤 3：开启 GitHub Pages**

1. 在 GitHub 上打开该仓库页面，点击 **Settings**。
2. 左侧找到 **Pages**。
3. 在 **Build and deployment** 下，**Source** 选 **Deploy from a branch**。
4. **Branch** 选 `main`，**Folder** 选 **/ (root)**，点击 **Save**。
5. 等待约 1～2 分钟，页面顶部会出现绿色提示：*Your site is live at https://你的用户名.github.io/medication-reminder/* 。

**步骤 4：访问网页**

在浏览器打开：**https://你的用户名.github.io/medication-reminder/** 即可使用吃药提醒。

**方式 B：本文件夹作为仓库里的 docs 目录**

1. 在项目根目录（上一级）有仓库时，将本文件夹内容放到 `docs/` 下，然后：

```bash
git add docs/
git commit -m "吃药提醒网页版"
git push
```

2. **Settings → Pages** 里 **Folder** 选 **/docs**。访问：**https://你的用户名.github.io/仓库名/**

---

## 二、Firebase 云端同步（可选）

- 打开 [Firebase 控制台](https://console.firebase.google.com)，创建项目。
- 添加「网页」应用，记下 `apiKey`、`authDomain`、`projectId` 等。
- 开通 **Firestore Database**（测试模式即可）。
- 在 **firebase-config.js** 中替换 `YOUR_API_KEY`、`YOUR_PROJECT_ID` 等。

若不配置 Firebase，数据仅存于当前浏览器的 localStorage，依靠同步码区分；配置后多设备输入同一同步码可云端同步。

---

## 三、使用方式

- 打开页面 → 输入**同步码**或点击「生成新码」→ 添加药物与服药时间。
- 到点会收到浏览器通知（需允许通知）。
- 换设备输入**同一同步码**即可恢复数据（已配置 Firestore 时）。
- 手机浏览器可「添加到主屏幕」当 App 使用。
