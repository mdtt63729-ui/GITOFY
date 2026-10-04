import { SecureStore } from './secureStore';
import { destroyKey, keyStrength } from './crypto';
import { AuthConfig } from './config';
import type { AccountRecord, DeviceFlowSession, GitHubAccount, WebPkceSession } from './types';

/**
 * TokenRepository (§11, §7.1). The only place tokens are read/written.
 * Accounts are keyed by GitHub user id so a rename keeps the same entry (§7.5).
 * A `refresh()` seam exists for a future GitHub App migration with short-lived
 * tokens (§7.2).
 */
export interface TokenRepository {
  listAccounts(): Promise<GitHubAccount[]>;
  getRecord(id: number): Promise<AccountRecord | null>;
  getToken(id: number): Promise<string | null>;
  saveRecord(record: AccountRecord): Promise<void>;
  deleteAccount(id: number): Promise<void>;
  getActiveAccountId(): Promise<number | null>;
  setActiveAccountId(id: number | null): Promise<void>;
  getDeviceSession(): Promise<DeviceFlowSession | null>;
  setDeviceSession(session: DeviceFlowSession | null): Promise<void>;
  getWebSession(): Promise<WebPkceSession | null>;
  setWebSession(session: WebPkceSession | null): Promise<void>;
  clearAll(): Promise<void>;
  storageKind(): string;
}

const { storageKeys } = AuthConfig;

function accountKey(id: number): string {
  return `account:${id}`;
}

class SecureTokenRepository implements TokenRepository {
  async listAccounts(): Promise<GitHubAccount[]> {
    const ids = (await SecureStore.getJson<number[]>(storageKeys.accountsIndex)) ?? [];
    const records = await Promise.all(ids.map((id) => this.getRecord(id)));
    return records.filter((r): r is AccountRecord => !!r).map((r) => r.account);
  }

  async getRecord(id: number): Promise<AccountRecord | null> {
    return SecureStore.getJson<AccountRecord>(accountKey(id));
  }

  async getToken(id: number): Promise<string | null> {
    const rec = await this.getRecord(id);
    return rec?.token ?? null;
  }

  async saveRecord(record: AccountRecord): Promise<void> {
    await SecureStore.setJson(accountKey(record.account.id), record);
    const ids = (await SecureStore.getJson<number[]>(storageKeys.accountsIndex)) ?? [];
    if (!ids.includes(record.account.id)) {
      ids.push(record.account.id);
      await SecureStore.setJson(storageKeys.accountsIndex, ids);
    }
  }

  async deleteAccount(id: number): Promise<void> {
    await SecureStore.remove(accountKey(id));
    const ids = (await SecureStore.getJson<number[]>(storageKeys.accountsIndex)) ?? [];
    await SecureStore.setJson(
      storageKeys.accountsIndex,
      ids.filter((x) => x !== id)
    );
  }

  async getActiveAccountId(): Promise<number | null> {
    return SecureStore.getJson<number | null>(storageKeys.activeAccount);
  }

  async setActiveAccountId(id: number | null): Promise<void> {
    if (id === null) await SecureStore.remove(storageKeys.activeAccount);
    else await SecureStore.setJson(storageKeys.activeAccount, id);
  }

  async getDeviceSession(): Promise<DeviceFlowSession | null> {
    return SecureStore.getJson<DeviceFlowSession>(storageKeys.deviceSession);
  }

  async setDeviceSession(session: DeviceFlowSession | null): Promise<void> {
    if (!session) await SecureStore.remove(storageKeys.deviceSession);
    else await SecureStore.setJson(storageKeys.deviceSession, session);
  }

  async getWebSession(): Promise<WebPkceSession | null> {
    return SecureStore.getJson<WebPkceSession>(storageKeys.webSession);
  }

  async setWebSession(session: WebPkceSession | null): Promise<void> {
    if (!session) await SecureStore.remove(storageKeys.webSession);
    else await SecureStore.setJson(storageKeys.webSession, session);
  }

  async clearAll(): Promise<void> {
    await SecureStore.clear();
    await destroyKey();
  }

  storageKind(): string {
    return `IndexedDB + AES-GCM (${keyStrength()})`;
  }
}

export const tokenRepository: TokenRepository = new SecureTokenRepository();
