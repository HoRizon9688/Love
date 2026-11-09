# Love小家更新方式

## 网页和电脑软件

部署工作流根据 `package.json` 版本和 GitHub 提交 SHA 生成 `app-update.json`。在当前仓库的 GitHub Actions Variables 中设置 `APP_UPDATE_BASE_URL`，填写自己的 Web 应用 HTTPS 地址。发布较新的版本后，已打开的网页可通过更新提示刷新。桌面壳启动时加载其配置的 Web 应用。

## Android APK

1. 更新 `package.json` 版本。用 Windows 本地的 Android 构建环境运行 `npm run android:apk`，生成要发布的安装包。覆盖安装需要沿用同一个应用包名和签名。
2. 将签名后的安装包命名为 `Love小家-latest.apk`，上传到当前仓库中对应版本的 GitHub Release。
3. 在当前仓库的 GitHub Actions Variables 中设置 `APP_APK_RELEASE_TAG` 为该 Release 的标签。工作流从该仓库的指定 Release 取包。未设置标签或取包失败时，部署网页，安装包和清单的 APK 链接均省略。
4. 为 Android 安装包构建配置 `NUXT_PUBLIC_UPDATE_MANIFEST_URL`，指向自己的 HTTPS 更新清单，例如 `https://your-domain.example/app-update.json`。`APP_UPDATE_BASE_URL` 应与安装包所在 Web 应用的地址匹配。
5. 若要自定义更新文案，在 GitHub Actions Variables 中设置 `APP_UPDATE_NOTES`，多条说明用 `||` 分隔。

用户打开应用后可收到较新版本的提示。首次安装未知来源应用时，Android 可能要求用户允许浏览器或文件管理器安装，并在安装前确认。
