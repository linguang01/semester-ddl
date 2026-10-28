import {
  BackupError,
  buildBackupPayload,
  parseBackupText,
  type BackupPayload,
  type ParsedBackup,
} from './backup';

// GitHub Gist API 地址
const GIST_API = 'https://api.github.com/gists';
// 备份在 Gist 里的文件名
const GIST_FILE_NAME = 'ddl-backup.json';
// Token 与 Gist ID 的本地存储 key
const TOKEN_KEY = 'ddl-gist-token';
const GIST_ID_KEY = 'ddl-gist-id';

export interface GistUploadResult {
  gistId: string;
  htmlUrl: string;
  /** true=新建，false=更新已有 Gist */
  created: boolean;
}

// ===== 本地存储：Token / Gist ID =====
// 注意：Token 明文存在 localStorage 里，任何能注入脚本的 XSS 都可能读到。
// 建议用「细粒度 Token」，只授予 Gist 读写权限，并设置短有效期。

export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function getStoredGistId(): string {
  try {
    return localStorage.getItem(GIST_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // localStorage 不可用时静默跳过
  }
}

function saveGistId(id: string): void {
  try {
    localStorage.setItem(GIST_ID_KEY, id.trim());
  } catch {
    // ignore
  }
}

/** 构造 GitHub 请求头：Bearer Token + JSON */
function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/** 把错误响应翻译成用户能看懂的中文 */
function describeHttpError(status: number): string {
  if (status === 401) return 'Token 无效或已过期（401）';
  if (status === 403) return 'Token 权限不足或触发限流（403）';
  if (status === 404) return 'Gist 不存在或 Token 无权访问（404）';
  return `请求失败（HTTP ${status}）`;
}

/**
 * 上传备份到私有 Gist。
 * - 已保存过 gistId：PATCH 更新同一个 Gist（覆盖旧内容）；
 * - 否则 POST 新建私有 Gist 并保存其 id，下次直接更新。
 */
export async function uploadToGist(
  token: string,
  payload: BackupPayload,
  existingGistId: string,
): Promise<GistUploadResult> {
  const content = JSON.stringify(payload, null, 2);
  const description = `DDL 三件事 云备份 · ${new Date().toISOString()}`;
  const gistId = existingGistId.trim();

  // 已有 Gist → 更新；否则新建
  const isUpdate = gistId.length > 0;
  const url = isUpdate ? `${GIST_API}/${gistId}` : GIST_API;
  const method = isUpdate ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method,
    headers: authHeaders(token),
    body: JSON.stringify({
      description,
      public: false, // 私有 Gist，只有自己和被授权者可见
      files: {
        [GIST_FILE_NAME]: { content },
      },
    }),
  });

  if (!response.ok) {
    throw new BackupError(describeHttpError(response.status));
  }

  const data = (await response.json()) as { id: string; html_url: string };
  return { gistId: data.id, htmlUrl: data.html_url, created: !isUpdate };
}

/** 从 Gist 读取备份内容并解析校验（不写入数据库） */
export async function downloadFromGist(gistId: string, token: string): Promise<ParsedBackup> {
  const id = gistId.trim();
  const response = await fetch(`${GIST_API}/${id}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new BackupError(describeHttpError(response.status));
  }

  const data = (await response.json()) as {
    files?: Record<string, { filename: string; content?: string; truncated?: boolean; raw_url?: string }>;
  };
  const file = data.files?.[GIST_FILE_NAME];
  if (!file) {
    throw new BackupError(`Gist 里没有找到 ${GIST_FILE_NAME} 备份文件`);
  }

  let content = file.content ?? '';

  // 超过 1MB 时 GitHub 会截断 content（truncated=true），需再拉 raw_url
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: { Authorization: `Bearer ${token.trim()}` } });
    if (!raw.ok) throw new BackupError('读取备份内容失败');
    content = await raw.text();
  }

  // 复用 backup.ts 的解析：校验 app 标识与版本、规范化任务与今日选择
  return parseBackupText(content);
}

/**
 * 上传入口（设置页调用）：
 * 构造当前数据备份 → 上传到 Gist → 持久化 token 与 gist id。
 */
export async function backupToGist(token: string): Promise<GistUploadResult> {
  if (token.trim().length < 10) {
    throw new BackupError('请先填写有效的 Personal Access Token');
  }
  saveToken(token.trim());

  const payload = await buildBackupPayload();
  const result = await uploadToGist(token, payload, getStoredGistId());
  saveGistId(result.gistId);
  return result;
}
