import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface StoredCredentialsFile {
  encrypted: boolean;
  payload: string;
  updatedAt: number;
}

function getCredentialsPath(): string {
  return join(app.getPath('userData'), 'exaone-credentials.json');
}

export async function hasStoredApiKey(): Promise<boolean> {
  const key = await getStoredApiKey();
  return Boolean(key && key.trim().length > 0);
}

export async function saveApiKey(
  rawKey: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return { ok: false, error: 'API 키를 입력해 주세요.' };
  }
  if (trimmed.length < 8) {
    return { ok: false, error: '유효하지 않은 API 키 형식입니다.' };
  }

  try {
    const filePath = getCredentialsPath();
    await mkdir(dirname(filePath), { recursive: true });

    const canEncrypt = safeStorage.isEncryptionAvailable();
    const payload = canEncrypt
      ? safeStorage.encryptString(trimmed).toString('base64')
      : Buffer.from(trimmed, 'utf-8').toString('base64');

    const record: StoredCredentialsFile = {
      encrypted: canEncrypt,
      payload,
      updatedAt: Date.now()
    };

    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `API 키 저장 실패: ${err.message}`
          : 'API 키 저장 중 알 수 없는 오류가 발생했습니다.'
    };
  }
}

export async function getStoredApiKey(): Promise<string | null> {
  try {
    const raw = await readFile(getCredentialsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentialsFile;
    if (!parsed.payload) return null;

    const buffer = Buffer.from(parsed.payload, 'base64');
    if (parsed.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString('utf-8');
  } catch {
    return null;
  }
}

export async function clearApiKey(): Promise<void> {
  try {
    await rm(getCredentialsPath(), { force: true });
  } catch {
    // 파일 미존재 시 무시
  }
}
