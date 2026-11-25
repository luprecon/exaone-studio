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
  if (typeof rawKey !== 'string') {
    return { ok: false, error: '유효하지 않은 API 키 형식입니다.' };
  }
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return { ok: false, error: 'API 키를 입력해 주세요.' };
  }
  if (!/^[\x21-\x7e]{8,512}$/.test(trimmed)) {
    return {
      ok: false,
      error:
        '유효하지 않은 API 키 형식입니다. 공백·줄바꿈 없는 영문/숫자/특수문자 키(8~512자)를 입력해 주세요.'
    };
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error:
        '현재 OS 암호화 저장소(safeStorage)를 사용할 수 없어 API 키 평문 저장을 차단했습니다.'
    };
  }

  try {
    const filePath = getCredentialsPath();
    await mkdir(dirname(filePath), { recursive: true });

    const payload = safeStorage.encryptString(trimmed).toString('base64');
    const record: StoredCredentialsFile = {
      encrypted: true,
      payload,
      updatedAt: Date.now()
    };

    await writeFile(filePath, JSON.stringify(record, null, 2), {
      encoding: 'utf-8',
      mode: 0o600
    });
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
    if (!parsed.payload || !parsed.encrypted) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;

    const buffer = Buffer.from(parsed.payload, 'base64');
    return safeStorage.decryptString(buffer);
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
