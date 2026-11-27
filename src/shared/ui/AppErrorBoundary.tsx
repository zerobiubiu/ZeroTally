import React from 'react';
import { Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  resetSeed: number;
  copied: boolean;
}

/**
 * 根级渲染崩溃兜底边界：
 * 捕获任意子树的未处理渲染/生命周期异常，避免白屏闪退；
 * 仅展示精简错误摘要（绝不输出账本数据或敏感凭据），支持一键安全重载界面与复制摘要。
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    resetSeed: 0,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 仅记录错误名与组件栈定位线索，避免泄露业务数据
    console.error('[AppErrorBoundary]', error.name, error.message, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState((prev) => ({
      error: null,
      copied: false,
      resetSeed: prev.resetSeed + 1,
    }));
  };

  private handleCopySummary = (): void => {
    const err = this.state.error;
    if (!err) {
      return;
    }
    const summary = `ZeroTally 异常摘要\n${err.name}: ${err.message}`;
    Clipboard.setString(summary);
    this.setState({ copied: true });
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return <React.Fragment key={this.state.resetSeed}>{this.props.children}</React.Fragment>;
    }

    const errorTitle = `${this.state.error.name || 'Error'}: ${this.state.error.message || '未知界面异常'}`;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.badge}>安全恢复</Text>
          <Text style={styles.title}>页面遇到意外错误</Text>
          <Text style={styles.subtitle}>
            本地 SQLite 账本数据完好无损。你可以直接重新加载界面，或复制异常摘要用于排查。
          </Text>

          <View style={styles.summaryBox}>
            <Text numberOfLines={4} style={styles.summaryText}>
              {errorTitle}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新加载界面"
            onPress={this.handleReload}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>重新加载界面</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="复制异常摘要"
            onPress={this.handleCopySummary}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>
              {this.state.copied ? '已复制异常摘要' : '复制异常摘要'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4f5f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(1, 120, 83, 0.10)',
    color: '#00522f',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#222435',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5c6479',
    marginTop: 8,
  },
  summaryBox: {
    backgroundColor: '#f4f5f7',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  summaryText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#494e62',
  },
  primaryBtn: {
    marginTop: 20,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#017853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 10,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#eaedf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#494e62',
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
