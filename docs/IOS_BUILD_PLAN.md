# iOS 云端构建与 Android 本地构建

## 原项目基线

原仓库已提交 `android/` 和 Gradle wrapper，未提交 `ios/`、`@capacitor/ios` 或 `codemagic.yaml`。`capacitor.config.json` 的 `webDir` 指向 `.output/public`，Android app ID 为 `com.xiantinghua.couplespace`。后续采用自己控制的 app ID／bundle ID，首次安装前定案。Android 沿用 AGP 8.13.0、Gradle 8.14.3、API 36 编译与目标、minSdk 24，除非兼容验证要求调整。

## 两台 iPhone 的安装路径

| 路径 | 用法与约束 |
| --- | --- |
| Ad Hoc 签名 IPA | 优先方案。Apple Developer Program 成员注册两台设备的 UDID，准备 Apple Distribution 证书和包含两台设备的 profile，Codemagic 导出 IPA。通过受限分发入口安装并验证签名，记录证书和 profile 有效期。 [Apple 设备注册](https://developer.apple.com/help/account/devices/devices-overview/) · [Codemagic 签名](https://docs.codemagic.io/yaml-code-signing/signing-ios/) |
| TestFlight | 可选。保持私下按邮箱邀请。伴侣作为外部测试员时按 Apple 要求走 Beta App Review，测试构建最多可用 90 天。 [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) |
| 免费 Personal Team | 适合 Xcode 临时真机调试，设备、App ID、profile 有短期限制，通常需每 7 天重新配置。Windows + 云 CI 的两人持续使用按 Ad Hoc 签名门槛规划。 [Apple 账户说明](https://developer.apple.com/help/account/basics/about-your-developer-account/) |

Codemagic 个人账户当前每月含 500 分钟 macOS M2；苹果标准会员为 US$99/年，按可用当地币种计费。免费云编译和真机签名是独立条件。没有会员时可先云编译模拟器目标、在两台设备验证 Web/PWA 交互。 [Codemagic 个人额度](https://docs.codemagic.io/billing/pricing/) · [Apple 会员费用](https://developer.apple.com/help/account/membership/program-enrollment)

## macOS 构建步骤

1. 通过 Codemagic 连接自己的 fork。选 macOS M2、兼容 Capacitor 8 的已验证 Xcode 26 或更高版本和 Node 22+，将具体可用版本固定在 CI。首选 Capacitor 8 默认 Swift Package Manager。先核对所有保留插件的 iOS 和最低系统版本，只有验证发现插件需要才启用 CocoaPods。 [Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup) · [Codemagic Capacitor 配置](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/)
2. 首次在云 macOS 环境创建平台工程。将与 `@capacitor/core` 锁定版本一致的 `@capacitor/ios` 加到 npm 依赖，运行 `npm run generate`、`npx --no-install cap add ios`，审查并纳入 `ios/` 原生工程。日常构建只运行 `cap sync ios`。应用标识、版本号、图标、启动页、权限说明和包依赖均放进版本控制。
3. 配置两条 workflow。模拟器工作流执行 `npm ci`、`npm test`、`npm run generate`、`npx --no-install cap sync ios` 后，对实际生成的 `ios/App/App.xcodeproj` 和 App scheme 用 `xcodebuild` 编译 `generic/platform=iOS Simulator`，关闭签名。产物为模拟器 .app。
4. 签名工作流复用上述 Web 步骤，在信任的 ref 手动触发。配置实际 bundle ID 和 `ad_hoc` 分发类型，Codemagic 密钥库保存签名身份；使用 `xcode-project use-profiles` 和 `xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App`。必要时按生成工程调整路径。校验 `codesign`、嵌入的 profile、设备列表、bundle ID、版本和 IPA 哈希。签名证书私钥、App Store Connect API Key 与设备标识留在受控环境。
5. 只对两位成员开放构建产物。关闭自动公共发布。测试升级安装与登录、待上传队列恢复，以及旧证书失效前的更新。iOS 更新提示指向授权的 Ad Hoc 分发或 TestFlight 路径。

## Windows 构建 APK

安装 Android Studio 与 Android SDK 36，使用兼容当前 AGP／Capacitor 的 JDK 21（例如 Android Studio 对应 JBR），设置本机有效的 `JAVA_HOME` 和 SDK 路径。核对 `java -version`、`android\gradlew.bat --version`。随后用仓库的 npm 锁文件安装依赖。

```powershell
npm ci
npm run android:apk
# android/app/build/outputs/apk/debug/app-debug.apk
```

私下长期分发使用独立 release keystore，凭据通过本地私密配置注入。在 `android` 目录执行 `.\gradlew.bat assembleRelease`，使用 `apksigner verify` 和 `adb install -r` 验证签名及覆盖安装。保留同一签名、applicationId，递增 `versionCode`。密码、签名文件、`local.properties` 和环境专用配置由本机或 CI 管理。

## 原生验收

- **安全区域与键盘。** 沿用 `viewport-fit=cover`、`safe-area-inset-*`、`dvh`，测 iPhone 刘海屏、横竖屏和 Android edge-to-edge。验证聊天输入、录音按钮和表单在键盘弹出、收起及旋转时可用。以实际 WebView 行为决定是否引入 Keyboard 插件。
- **照片与视频。** 优先验证现有文件选择在两端能从系统相册拿到图片／视频，补必要的 picker 桥接。验证取消、有限相册访问、HEIC、MP4／MOV 和视频海报。只为实际调用的相册／拍摄接口加权限说明。
- **录音。** iOS 用 `NSMicrophoneUsageDescription`，Android 保留 `RECORD_AUDIO`，仅在录制语音或声音胶囊时请求。检查 WebKit `MediaRecorder.isTypeSupported`、实际 MIME 和另一端回放，测试拒绝、撤销、录音中断和关闭页面释放音轨。
- **去除权限。** iOS 不配置定位和来电能力，Android 以合并 manifest 为准，移除粗略／精确定位、全屏来电、悬浮窗、通话前台服务及相关插件。摄像头是否保留取决于媒体入口实测。独立保留纪念日、日历和签到的本地通知权限。
- **导航和 Auth。** Android 返回按弹层、当前面板、首页的顺序处理，首页再走系统返回。检查 iOS 深链接冷启动与前后台切换。OAuth／验证邮件用系统浏览器和明确允许的回调，验证 state、PKCE、重新打开与登出。测试原生两端来自独立账号的真实媒体、消息和提醒。
- **更新与签名。** 不同分发包只加载同一审核过的静态前端，启用 HTTPS。验证 Android 签名更新与 iOS 注册设备安装、过期前换包。R2、Supabase 管理与签名密钥不得进入应用包。
