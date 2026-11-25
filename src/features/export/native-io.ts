import { Directory } from 'expo-file-system';
import { Share } from 'react-native';
import type { GeneratedExportArtifact } from './types';

/**
 * 调用系统目录选择器将结构化文件写入用户选定的本地文件夹（Android SAF，免额外存储权限）。
 */
export async function saveExportArtifactToDirectory(
  artifact: GeneratedExportArtifact
): Promise<{ saved: boolean; uri?: string }> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(artifact.filename, artifact.mimeType);
    file.writeSync(artifact.content);
    return { saved: true, uri: file.uri };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/cancel/i.test(message)) {
      return { saved: false };
    }
    throw err;
  }
}

/**
 * 通过系统分享面板发送标准结构化文本（JSON / CSV）。
 */
export async function shareExportArtifact(artifact: GeneratedExportArtifact): Promise<void> {
  await Share.share({
    title: artifact.filename,
    message: artifact.content,
  });
}
