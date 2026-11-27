const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING_MARKER = '// [zerotally] strict-release-signing';

const RELEASE_SIGNING_SNIPPET = `
${SIGNING_MARKER}
def ztStoreFile = findProperty("ZEROTALLY_RELEASE_STORE_FILE") ?: System.getenv("ZEROTALLY_KEYSTORE_PATH")
def ztStorePassword = findProperty("ZEROTALLY_RELEASE_STORE_PASSWORD") ?: System.getenv("ZEROTALLY_KEYSTORE_PASSWORD")
def ztKeyAlias = findProperty("ZEROTALLY_RELEASE_KEY_ALIAS") ?: System.getenv("ZEROTALLY_KEY_ALIAS")
def ztKeyPassword = findProperty("ZEROTALLY_RELEASE_KEY_PASSWORD") ?: System.getenv("ZEROTALLY_KEY_PASSWORD")
def ztAllowDebugSigning = (findProperty("zerotallyAllowDebugSigning") ?: "false").toString().toBoolean()
def ztHasFormalSigning = ztStoreFile && ztStorePassword && ztKeyAlias && ztKeyPassword

android {
    signingConfigs {
        if (ztHasFormalSigning) {
            release {
                storeFile file(ztStoreFile)
                storePassword ztStorePassword
                keyAlias ztKeyAlias
                keyPassword ztKeyPassword
            }
        }
    }
    buildTypes {
        release {
            if (ztHasFormalSigning) {
                signingConfig signingConfigs.release
            } else if (ztAllowDebugSigning) {
                println("[ZeroTally WARNING] 显式启用本地测试调试签名（zerotallyAllowDebugSigning=true），产物严禁对外分发。")
                signingConfig signingConfigs.debug
            }
        }
    }
}

gradle.taskGraph.whenReady { taskGraph ->
    def isReleaseTask = taskGraph.allTasks.any { t ->
        def n = t.name.toLowerCase()
        n.contains("release") && (n.contains("assemble") || n.contains("bundle") || n.contains("package"))
    }
    if (isReleaseTask && !ztHasFormalSigning && !ztAllowDebugSigning) {
        throw new GradleException(
            "ZeroTally 发布门禁拦截：未检测到正式发布 Keystore 配置，已拒绝隐式回退 debug 签名。" +
            "请运行 bun run keystore:init 生成正式签名并配置环境变量/signing.local.json，" +
            "如仅需本机自测请显式传入 --allow-debug-signing。"
        )
    }
}
`;

function upsertGradleProp(props, key, value) {
  const existing = props.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    props.push({ type: 'property', key, value });
  }
}

/**
 * 正式发布签名硬门禁 + R8 代码与资源压缩瘦身插件：
 * 1. 默认在 Release 构建中启用 R8 混淆压缩与无用资源裁剪（缩小 APK 体积）；
 * 2. 读取正式 Release Keystore（来自环境变量或 Gradle 参数），缺失时强制中断拒绝静默回退 debug 签名；
 * 3. 仅在显式传入 zerotallyAllowDebugSigning=true 时放行本机自测打包。
 */
function withReleaseSigningAndShrink(config) {
  const withProps = withGradleProperties(config, (mod) => {
    upsertGradleProp(mod.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    upsertGradleProp(mod.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return mod;
  });

  return withAppBuildGradle(withProps, (mod) => {
    if (mod.modResults.contents.includes(SIGNING_MARKER)) {
      return mod;
    }
    mod.modResults.contents = `${mod.modResults.contents.trimEnd()}\n${RELEASE_SIGNING_SNIPPET}`;
    return mod;
  });
}

module.exports = withReleaseSigningAndShrink;
