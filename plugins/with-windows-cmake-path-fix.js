const { withAppBuildGradle } = require('expo/config-plugins');

const GRADLE_HOOK_MARKER = '// [keep-accounts] windows-cmake-short-autolink-dirs';

const GRADLE_HOOK_SNIPPET = `
${GRADLE_HOOK_MARKER}
android {
    externalNativeBuild {
        cmake {
            buildStagingDirectory = file("\${rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()}/.c")
        }
    }
}

afterEvaluate {
    tasks.matching { it.name == "generateAutolinkingNewArchitectureFiles" }.configureEach {
        doLast {
            def cmakeFile = file("$buildDir/generated/autolinking/src/main/jni/Android-autolinking.cmake")
            if (!cmakeFile.exists()) return

            def projRoot = rootDir.getAbsoluteFile().getParentFile()
            def shortRoot = new File(projRoot, ".c")
            shortRoot.mkdirs()

            def updated = cmakeFile.text
                .replace("rngesturehandler_codegen_autolinked_build", "g")
                .replace("rnreanimated_autolinked_build", "r")
                .replace("safeareacontext_autolinked_build", "s")
                .replace("rnscreens_autolinked_build", "n")
                .replace("rnworklets_autolinked_build", "w")

            if (System.getProperty("os.name").toLowerCase().contains("windows")) {
                def pkgs = [
                    "1": "react-native-gesture-handler",
                    "2": "react-native-reanimated",
                    "3": "react-native-safe-area-context",
                    "4": "react-native-screens",
                    "5": "react-native-worklets",
                ]
                def projRootSlash = projRoot.getAbsolutePath().replace("\\\\", "/")
                pkgs.each { alias, pkgName ->
                    def target = new File(projRoot, "node_modules/" + pkgName)
                    if (target.exists()) {
                        def linkDir = new File(shortRoot, alias)
                        if (!linkDir.exists()) {
                            ["cmd", "/c", "mklink", "/J", linkDir.getAbsolutePath(), target.getAbsolutePath()].execute().waitFor()
                        }
                        if (linkDir.exists()) {
                            updated = updated.replace(
                                projRootSlash + "/node_modules/" + pkgName,
                                projRootSlash + "/.c/" + alias
                            )
                        }
                    }
                }
            }

            cmakeFile.write(updated, "UTF-8")
        }
    }
}
`;

/**
 * 修复 Windows（LongPathsEnabled=0）下 Win32 mkdir 248 字符与 Ninja 260 字符路径上限问题：
 * 1. 将 CMake staging 目录缩短至项目根 .c/；
 * 2. 缩短 Android-autolinking.cmake 中 add_subdirectory 内部构建目录别名；
 * 3. 在 Windows 下通过 .c/1..5 目录联接（mklink /J）缩短原生包源码路径（无需管理员权限）。
 */
function withWindowsCmakePathFix(config) {
  return withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    if (contents.includes(GRADLE_HOOK_MARKER)) {
      return mod;
    }
    mod.modResults.contents = `${contents.trimEnd()}\n${GRADLE_HOOK_SNIPPET}`;
    return mod;
  });
}

module.exports = withWindowsCmakePathFix;
