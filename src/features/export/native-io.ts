import { Directory, File } from 'expo-file-system';
import { Share } from 'react-native';

export interface SaveableJsonArtifact {
  filename: string;
  mimeType: string;
  content: string;
}

/**
 * 调用系统目录选择器将 JSON 文件写入用户选定的本地文件夹（Android SAF，免额外存储权限）。
 */
export async function saveExportArtifactToDirectory(
  artifact: SaveableJsonArtifact
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
 * 通过系统分享面板发送 JSON 文本。
 */
export async function shareExportArtifact(artifact: SaveableJsonArtifact): Promise<void> {
  await Share.share({
    title: artifact.filename,
    message: artifact.content,
  });
}

/**
 * 调用系统文件选择器读取本地 JSON 文本（使用 expo-file-system 原生 File.pickFileAsync，零额外原生依赖）。
 */
export async function pickJsonFileText(): Promise<{
  cancelled: boolean;
  filename?: string;
  content?: string;
}> {
  try {
    const picked = await File.pickFileAsync({
      mimeTypes: ['application/json', 'text/plain', '*/*'],
    });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) {
      return { cancelled: true };
    }
    const content = await file.text();
    const rawName = file.name || decodeURIComponent(file.uri.split('/').pop() ?? 'backup.json');
    return {
      cancelled: false,
      filename: rawName,
      content,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/cancel/i.test(message)) {
      return { cancelled: true };
    }
    throw err;
  }
}
