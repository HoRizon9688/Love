# 准备云端媒体测试环境

先创建一个全新的 Supabase Free 项目和一个 R2 Standard 私有桶。下面先完成账号控制台里的配置，再回到当前聊天接着做数据库初始化、Worker 配置和三账号验收。

## 1. 创建 Supabase 测试项目

打开 [Supabase 控制台](https://supabase.com/dashboard)，选择自己的组织并创建项目。

- 项目名称可填 `love-home-test`，组织使用 Free 方案。
- 设置数据库密码并保存到自己的密码管理器。
- 选择靠近实际使用地点的区域，等待项目创建完成。
- 从项目的 Connect 面板或 Data API 设置取得项目 URL。
- 打开 Settings → API Keys，取得 Publishable key 和 Secret key。Secret key 只用于 Worker 和后台测试。现有代码也兼容旧版 anon 和 service_role。[Supabase API 密钥](https://supabase.com/docs/guides/getting-started/api-keys)

接下来把 URL 填入本机配置的 `SUPABASE_URL`，Publishable key 填入 `SUPABASE_PUBLIC_KEY`，Secret key 填入 `SUPABASE_SERVICE_KEY`。

新项目的数据库会在下一步通过本仓库的 `supabase/bootstrap/` 迁移链初始化。测试账号随后由后台预置。

## 2. 创建 R2 私有测试桶

打开 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 Storage & databases → R2 → Overview。

- 首次开通会出现 R2 订阅结算页面，按页面提示完成。R2 按月计量，Standard 包含每月 10 GB-month 存储、100 万次 A 类操作和 1,000 万次 B 类操作的免费额度，超出部分计费。[开通说明](https://developers.cloudflare.com/r2/get-started/) · [计费说明](https://developers.cloudflare.com/r2/pricing/)
- 创建桶，名称填 `love-home-media-test`，存储类别选择 Standard。
- 在桶的 Settings 中确认 Public Development URL 为关闭状态，公开自定义域名列表为空。
- 记下 Cloudflare Account ID，填入 `R2_ACCOUNT_ID`。
- `R2_BUCKET_NAME` 填 `love-home-media-test`。

## 3. 创建桶专用 S3 凭据

从 R2 Overview 进入 Manage API Tokens，创建 Account API token 或 User API token。

- 名称可填 `love-home-media-test`。
- 权限选择 Object Read & Write。
- 作用范围选择指定桶，只选 `love-home-media-test`。
- 保存显示的 Access Key ID 和 Secret Access Key，分别填入 `R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。这两个值用于 S3 签名。[R2 凭据配置](https://developers.cloudflare.com/r2/api/tokens/)

## 4. 填入本机文件

我已提供 [本机配置模板](../workers/media/.dev.vars.example)。在 Windows PowerShell 中从项目根目录执行下面命令。若 `.dev.vars` 已存在，直接在 VS Code 打开并编辑。

```powershell
if (!(Test-Path -LiteralPath 'D:\love\workers\media\.dev.vars')) {
  Copy-Item -LiteralPath 'D:\love\workers\media\.dev.vars.example' -Destination 'D:\love\workers\media\.dev.vars'
}
```

用 VS Code 打开 `D:\love\workers\media\.dev.vars`，替换六个 `replace-with` / `replace-project-ref` 占位值。桶名和 `ALLOWED_ORIGINS` 已填好本地验收默认值。真实文件已被 Git 忽略，密钥无需发到聊天。

此文件供本地 Worker 使用。云端 Worker 的 Secret 和公开配置会在后续部署时分别设置，不能只复制本地文件就视为已部署。

## 5. 继续验收

完成后回复「测试项目、R2 桶和 .dev.vars 已准备好」，并提供项目名和桶名即可。后续工作按下面顺序进行。

1. 只检查本机配置是否齐全，确认目标是新测试项目。
2. 在新项目应用 `supabase/bootstrap/` 迁移链，创建两位情侣成员和一位越权测试账号。
3. 将 Worker 绑定到测试桶，设置 Secrets 和允许来源，并配置桶 CORS。
4. 用真实 R2 验证签名直传、视频 Range 播放、录音、下载和跨账户拒绝，再检查原生端来源。

数据库密码、Supabase Secret key 和 R2 Secret Access Key 留在本机或云端 Secrets 中。部署和验收细节见 [媒体存储说明](MEDIA_STORAGE.md)。
