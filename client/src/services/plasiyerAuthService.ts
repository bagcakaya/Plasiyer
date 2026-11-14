import type {
  AuthUser,
  CompanyProfile,
  FirmAccountRole,
  PlasiyerAccount,
  SalesRep,
  ServerConfig,
} from '../types';
import { buildSqlHeaders, isDemoMode, resolveApiBaseUrlAsync } from './apiService';

const ACCOUNTS_STORAGE_KEY = 'plasiyer_rep_accounts';
const PROFILES_STORAGE_KEY = 'plasiyer_company_profiles';
const SERVER_CONFIG_KEY = 'plasiyer_server_config';
const REP_STORAGE_KEY = 'plasiyer_rep';
const AUTH_USER_KEY = 'plasiyer_auth_user';

export const ADMIN_COMPANY_CODE = 'POLATLAR';
export const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '16051990Sa.';

export const LICENSE_EXPIRED_MESSAGE =
  'Lisans süreniz dolmuştur. Lütfen servis sağlayıcınız ile görüşünüz';
export const LICENSE_EXPIRED_SESSION_KEY = 'polatlar_license_expired_notice';

export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isLicenseExpired(expireDate?: string | null): boolean {
  if (!expireDate) return false;
  const exp = expireDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
  return exp < getLocalTodayIso();
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

export function formatFullName(firstName: string, lastName: string): string {
  return [firstName?.trim() || '', lastName?.trim() || ''].filter(Boolean).join(' ').trim();
}

const makeAccountKey = (companyCode: string, repCode: string): string =>
  `${companyCode.trim().toUpperCase()}::${repCode.trim().toUpperCase()}`;

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function encodeBase64UrlUtf8(str: string): string {
  return encodeBase64Utf8(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlUtf8(encoded: string): string {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function isUntouchedDefaultServerConfig(cfg?: ServerConfig | null): boolean {
  if (!cfg || !cfg.companyCode) return true;
  const code = cfg.companyCode.trim().toUpperCase();
  if (!code || code === ADMIN_COMPANY_CODE) return true;
  const title = (cfg.companyTitle || '').trim();
  const host = (cfg.sqlHost || '').trim().toLowerCase();
  if (
    code === '01' &&
    (host === '' || host === 'localhost') &&
    (!title || title.includes('Ahmet Gıda') || title.includes('Demo & Çevrimdışı'))
  ) {
    return true;
  }
  return false;
}

export const plasiyerAuthService = {
  buildAdminHeaders(): Record<string, string> {
    return {
      'X-Admin-Auth': encodeBase64Utf8(
        `${ADMIN_COMPANY_CODE}:${ADMIN_USERNAME}:${ADMIN_PASSWORD}`
      ),
    };
  },

  buildRegistryAuthHeaders(overrideCompanyCode?: string): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
      const role = localStorage.getItem('b2b_user_role');
      const authRaw = localStorage.getItem(AUTH_USER_KEY);
      const authUser = authRaw ? (JSON.parse(authRaw) as AuthUser) : null;

      if (role === 'admin' || authUser?.role === 'admin') {
        return this.buildAdminHeaders();
      }

      const cCode = (overrideCompanyCode || authUser?.companyCode || '').trim().toUpperCase();
      const rCode = (authUser?.salesRepCode || authUser?.code || '').trim().toUpperCase();
      if (cCode && rCode) {
        const localAcc = this.getLocalAccounts().find(
          (a) => a.companyCode.toUpperCase() === cCode && a.repCode.toUpperCase() === rCode
        );
        if (localAcc?.password) {
          return {
            'X-Plasiyer-Auth': encodeBase64Utf8(
              JSON.stringify({
                companyCode: cCode,
                repCode: rCode,
                password: localAcc.password,
              })
            ),
          };
        }
      }
    } catch {
      // ignore storage errors
    }
    return {};
  },

  getLocalAccounts(): PlasiyerAccount[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // ignore parse errors
      }
    }

    // Henüz plasiyer hesabı tanımlanmadıysa mevcut ayarlarla başlangıç kaydı oluştur
    let defaultCompany = 'OSMANLI';
    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        if (cfg.companyCode?.trim()) {
          defaultCompany = cfg.companyCode.trim().toUpperCase();
        }
      }
    } catch {
      // ignore
    }

    let defaultCode = 'PLS01';
    let defaultFirst = 'Ahmet';
    let defaultLast = 'Yılmaz';
    let defaultPassword = '1234';
    try {
      const repRaw = localStorage.getItem(REP_STORAGE_KEY);
      if (repRaw) {
        const rep = JSON.parse(repRaw) as SalesRep;
        if (rep.code?.trim()) defaultCode = rep.code.trim().toUpperCase();
        if (rep.firstName !== undefined || rep.lastName !== undefined) {
          defaultFirst = rep.firstName || '';
          defaultLast = rep.lastName || '';
        } else if (rep.name) {
          const split = splitFullName(rep.name);
          defaultFirst = split.firstName;
          defaultLast = split.lastName;
        }
        if (rep.password) defaultPassword = rep.password;
      }
    } catch {
      // ignore
    }

    const seeded: PlasiyerAccount[] = [
      {
        id: `acc-${defaultCompany}-${defaultCode}`,
        companyCode: defaultCompany,
        repCode: defaultCode,
        firstName: defaultFirst || 'Ahmet',
        lastName: defaultLast || 'Yılmaz',
        password: defaultPassword,
        isDefaultSeed: true,
        updatedAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  },

  saveLocalAccounts(accounts: PlasiyerAccount[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  },

  hasOnlyDefaultSeed(): boolean {
    const list = this.getLocalAccounts();
    return list.length === 1 && Boolean(list[0]?.isDefaultSeed);
  },

  upsertAccountLocal(input: {
    companyCode: string;
    repCode: string;
    firstName: string;
    lastName: string;
    password: string;
    accountRole?: FirmAccountRole;
    updatedAt?: string;
  }): PlasiyerAccount {
    const companyCode = input.companyCode.trim().toUpperCase();
    const repCode = input.repCode.trim().toUpperCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const password = input.password;

    const current = this.getLocalAccounts().filter(
      (a) =>
        !a.isDefaultSeed ||
        makeAccountKey(a.companyCode, a.repCode) !== makeAccountKey(companyCode, repCode)
    );
    const targetKey = makeAccountKey(companyCode, repCode);
    const existingIdx = current.findIndex(
      (a) => makeAccountKey(a.companyCode, a.repCode) === targetKey
    );
    const existing = existingIdx >= 0 ? current[existingIdx] : undefined;
    const resolvedRole: FirmAccountRole =
      input.accountRole === 'manager' || input.accountRole === 'plasiyer'
        ? input.accountRole
        : existing?.accountRole === 'manager'
        ? 'manager'
        : 'plasiyer';

    const updatedAccount: PlasiyerAccount = {
      id: `acc-${companyCode}-${repCode}`,
      companyCode,
      repCode,
      firstName,
      lastName,
      password,
      accountRole: resolvedRole,
      isDefaultSeed: false,
      updatedAt: input.updatedAt || new Date().toISOString(),
    };

    let next: PlasiyerAccount[];
    if (existingIdx >= 0) {
      next = [...current];
      next[existingIdx] = updatedAccount;
    } else {
      const withoutUntouchedSeed = current.filter((a) => !a.isDefaultSeed);
      next = [...withoutUntouchedSeed, updatedAccount];
    }

    this.saveLocalAccounts(next);
    return updatedAccount;
  },

  async upsertAccount(
    input: {
      companyCode: string;
      repCode: string;
      firstName: string;
      lastName: string;
      password: string;
      accountRole?: FirmAccountRole;
    },
    serverConfig?: ServerConfig
  ): Promise<PlasiyerAccount> {
    const authHeaders = this.buildRegistryAuthHeaders(input.companyCode);
    const savedLocal = this.upsertAccountLocal(input);
    const payload = {
      companyCode: savedLocal.companyCode,
      repCode: savedLocal.repCode,
      firstName: savedLocal.firstName,
      lastName: savedLocal.lastName,
      password: savedLocal.password,
      accountRole: savedLocal.accountRole || 'plasiyer',
    };

    // 1. Merkezi bulut kaydına (ve buluttan erişilebiliyorsa SQL'e) yaz
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        await fetch('/api/plasiyers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(serverConfig && !isDemoMode(serverConfig) ? buildSqlHeaders(serverConfig) : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Çevrimdışı durumda yerel kayıt yeterlidir
      }

      // 2. Eğer yerel köprü (localhost:4000) kullanılıyorsa oraya da senkronize et
      if (serverConfig && !isDemoMode(serverConfig)) {
        try {
          const baseUrl = await resolveApiBaseUrlAsync(serverConfig);
          if (baseUrl !== '/api') {
            await fetch(`${baseUrl}/plasiyers`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                ...buildSqlHeaders(serverConfig),
              },
              body: JSON.stringify(payload),
            });
          }
        } catch {
          // ignore local bridge warning
        }
      }
    }

    return savedLocal;
  },

  async deleteAccount(
    companyCode: string,
    repCode: string,
    serverConfig?: ServerConfig
  ): Promise<PlasiyerAccount[]> {
    const targetKey = makeAccountKey(companyCode, repCode);
    const remaining = this.getLocalAccounts().filter(
      (a) => makeAccountKey(a.companyCode, a.repCode) !== targetKey
    );
    this.saveLocalAccounts(remaining);

    const authHeaders = this.buildRegistryAuthHeaders(companyCode);
    const qs = `companyCode=${encodeURIComponent(companyCode)}&repCode=${encodeURIComponent(repCode)}`;

    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        await fetch(`/api/plasiyers?${qs}`, {
          method: 'DELETE',
          headers: {
            ...authHeaders,
            ...(serverConfig && !isDemoMode(serverConfig) ? buildSqlHeaders(serverConfig) : {}),
          },
        });
      } catch {
        // ignore network error
      }

      if (serverConfig && !isDemoMode(serverConfig)) {
        try {
          const baseUrl = await resolveApiBaseUrlAsync(serverConfig);
          if (baseUrl !== '/api') {
            await fetch(`${baseUrl}/plasiyers?${qs}`, {
              method: 'DELETE',
              headers: {
                ...authHeaders,
                ...buildSqlHeaders(serverConfig),
              },
            });
          }
        } catch {
          // ignore
        }
      }
    }

    return remaining;
  },

  async syncAccountsFromSql(serverConfig?: ServerConfig): Promise<PlasiyerAccount[]> {
    const localList = this.getLocalAccounts();
    if (typeof navigator !== 'undefined' && !navigator.onLine) return localList;

    const targetCompany = (serverConfig?.companyCode || '').trim().toUpperCase();
    const authHeaders = this.buildRegistryAuthHeaders(targetCompany || undefined);
    const qs =
      targetCompany && targetCompany !== ADMIN_COMPANY_CODE
        ? `?companyCode=${encodeURIComponent(targetCompany)}`
        : '';

    try {
      const res = await fetch(`/api/plasiyers${qs}`, {
        headers: {
          ...authHeaders,
          ...(serverConfig && !isDemoMode(serverConfig) ? buildSqlHeaders(serverConfig) : {}),
        },
      });
      if (!res.ok) return localList;
      const data = await res.json();
      if (!Array.isArray(data?.accounts)) {
        return localList;
      }

      const map = new Map<string, PlasiyerAccount>();
      // Diğer firmalara ait yerel hesapları koru; hedef firmanın listesini bulut/SQL ile eşitle
      localList
        .filter((a) => !a.isDefaultSeed)
        .forEach((acc) => {
          if (!targetCompany || acc.companyCode.toUpperCase() !== targetCompany) {
            map.set(makeAccountKey(acc.companyCode, acc.repCode), acc);
          } else if (data.accounts.length === 0) {
            map.set(makeAccountKey(acc.companyCode, acc.repCode), acc);
          }
        });

      for (const remote of data.accounts as PlasiyerAccount[]) {
        if (!remote.companyCode || !remote.repCode || !remote.password) continue;
        const key = makeAccountKey(remote.companyCode, remote.repCode);
        map.set(key, {
          id: `acc-${remote.companyCode.toUpperCase()}-${remote.repCode.toUpperCase()}`,
          companyCode: remote.companyCode.toUpperCase(),
          repCode: remote.repCode.toUpperCase(),
          firstName: remote.firstName || '',
          lastName: remote.lastName || '',
          password: remote.password,
          accountRole: remote.accountRole === 'manager' ? 'manager' : 'plasiyer',
          isDefaultSeed: false,
          updatedAt: remote.updatedAt || new Date().toISOString(),
        });
      }

      const merged = Array.from(map.values());
      if (merged.length > 0) {
        this.saveLocalAccounts(merged);
        return merged;
      }
    } catch {
      // ignore offline error
    }

    return localList;
  },

  /**
   * Yetkili Kurum (Admin) için PC ve Mobil dahil tüm cihazlar arasında
   * müşteri firmalarını ve plasiyer hesaplarını merkezi bulut ile çift yönlü senkronize eder.
   */
  async syncAdminCloudRegistry(): Promise<{
    synced: boolean;
    profiles: CompanyProfile[];
    accounts: PlasiyerAccount[];
  }> {
    const localProfiles = this.getCompanyProfiles();
    const realFirmCodes = new Set(localProfiles.map((p) => p.code.trim().toUpperCase()));
    const localRealAccounts = this.getLocalAccounts()
      .filter((a) => !a.isDefaultSeed || realFirmCodes.has(a.companyCode.trim().toUpperCase()))
      .map((a) => (a.isDefaultSeed ? { ...a, isDefaultSeed: false } : a));

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: false, profiles: localProfiles, accounts: localRealAccounts };
    }

    try {
      const res = await fetch('/api/registry/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.buildAdminHeaders(),
        },
        body: JSON.stringify({
          profiles: localProfiles,
          accounts: localRealAccounts,
        }),
      });

      if (!res.ok) {
        return { synced: false, profiles: localProfiles, accounts: localRealAccounts };
      }

      const data = await res.json();
      if (!data?.success) {
        return { synced: false, profiles: localProfiles, accounts: localRealAccounts };
      }

      const cloudProfiles: CompanyProfile[] = Array.isArray(data.profiles) ? data.profiles : [];
      const cloudAccounts: PlasiyerAccount[] = Array.isArray(data.accounts) ? data.accounts : [];

      this.saveCompanyProfiles(cloudProfiles);
      this.saveLocalAccounts(cloudAccounts);

      // Eğer SERVER_CONFIG_KEY içindeki firma silinmişse tekrar dirilmesini önle
      try {
        const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
        if (cfgRaw) {
          const cfg = JSON.parse(cfgRaw) as ServerConfig;
          const activeCode = (cfg.companyCode || '').trim().toUpperCase();
          if (
            activeCode &&
            activeCode !== ADMIN_COMPANY_CODE &&
            !isUntouchedDefaultServerConfig(cfg)
          ) {
            const stillExists = cloudProfiles.some(
              (p) => p.code.trim().toUpperCase() === activeCode
            );
            if (!stillExists) {
              localStorage.removeItem(SERVER_CONFIG_KEY);
            }
          }
        }
      } catch {
        // ignore
      }

      return {
        synced: true,
        profiles: cloudProfiles,
        accounts: cloudAccounts,
      };
    } catch {
      return { synced: false, profiles: localProfiles, accounts: localRealAccounts };
    }
  },

  getCompanyProfiles(): CompanyProfile[] {
    if (typeof window === 'undefined') return [];
    let profiles: CompanyProfile[] = [];
    try {
      const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          profiles = parsed.filter(
            (p) => p?.code && p.code.trim().toUpperCase() !== ADMIN_COMPANY_CODE
          );
        }
      }
    } catch {
      profiles = [];
    }

    // Aktif serverConfig gerçek bir müşteri firmasıysa ve listede yoksa otomatik dahil et
    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        const activeCode = (cfg.companyCode || '').trim().toUpperCase();
        if (
          activeCode &&
          activeCode !== ADMIN_COMPANY_CODE &&
          !isUntouchedDefaultServerConfig(cfg)
        ) {
          const exists = profiles.some((p) => p.code.trim().toUpperCase() === activeCode);
          if (!exists) {
            profiles.unshift({
              id: `prof-${activeCode}`,
              name: cfg.companyTitle?.trim() || activeCode,
              code: activeCode,
              period: cfg.period || '2026',
              serverUrl: isDemoMode(cfg) ? 'demo' : '/api',
              companyTitle: cfg.companyTitle?.trim() || activeCode,
              sqlHost: cfg.sqlHost,
              sqlPort: cfg.sqlPort || '1433',
              sqlDatabase: cfg.sqlDatabase,
              sqlUser: cfg.sqlUser,
              sqlPassword: cfg.sqlPassword,
              licenseExpireDate: cfg.licenseExpireDate || '2027-12-31',
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // ignore
    }

    return profiles;
  },

  saveCompanyProfiles(profiles: CompanyProfile[]): void {
    if (typeof window === 'undefined') return;
    const filtered = profiles.filter(
      (p) => p?.code && p.code.trim().toUpperCase() !== ADMIN_COMPANY_CODE
    );
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(filtered));
  },

  saveCompanyProfileLocalOnly(
    profileInput: Omit<CompanyProfile, 'id'> & { id?: string }
  ): CompanyProfile {
    const codeUpper = profileInput.code.trim().toUpperCase();
    const profiles = this.getCompanyProfiles();

    const entry: CompanyProfile = {
      id: profileInput.id || `prof-${codeUpper}`,
      name: profileInput.companyTitle?.trim() || profileInput.name?.trim() || codeUpper,
      code: codeUpper,
      period: profileInput.period?.trim() || '2026',
      serverUrl: profileInput.serverUrl && profileInput.serverUrl !== 'demo' ? '/api' : 'demo',
      companyTitle: profileInput.companyTitle?.trim() || profileInput.name?.trim() || codeUpper,
      sqlHost: profileInput.sqlHost?.trim() || '',
      sqlPort: profileInput.sqlPort?.trim() || '1433',
      sqlDatabase: profileInput.sqlDatabase?.trim() || '',
      sqlUser: profileInput.sqlUser?.trim() || '',
      sqlPassword: profileInput.sqlPassword ?? '',
      licenseExpireDate: profileInput.licenseExpireDate?.trim() || '2027-12-31',
      isDefault: profileInput.isDefault,
      updatedAt: profileInput.updatedAt || new Date().toISOString(),
    };

    const idx = profiles.findIndex((p) => p.code.trim().toUpperCase() === codeUpper);
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...entry };
    } else {
      profiles.unshift(entry);
    }

    this.saveCompanyProfiles(profiles);
    return entry;
  },

  upsertCompanyProfile(profileInput: Omit<CompanyProfile, 'id'> & { id?: string }): CompanyProfile {
    const entry = this.saveCompanyProfileLocalOnly({
      ...profileInput,
      updatedAt: new Date().toISOString(),
    });

    // Arka planda merkezi buluta da gönder (Admin oturumu açıksa)
    const adminHeaders = this.buildRegistryAuthHeaders();
    if (adminHeaders['X-Admin-Auth'] && (typeof navigator === 'undefined' || navigator.onLine)) {
      fetch('/api/registry/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders,
        },
        body: JSON.stringify({ profile: entry }),
      }).catch(() => {});
    }

    return entry;
  },

  async upsertCompanyProfileAsync(
    profileInput: Omit<CompanyProfile, 'id'> & { id?: string }
  ): Promise<CompanyProfile> {
    const entry = this.saveCompanyProfileLocalOnly({
      ...profileInput,
      updatedAt: new Date().toISOString(),
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const res = await fetch('/api/registry/companies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAdminHeaders(),
          },
          body: JSON.stringify({ profile: entry }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.profiles)) {
            this.saveCompanyProfiles(data.profiles);
          }
        }
      } catch {
        // Çevrimdışı durumda yerel kayıt sonraki senkronda buluta aktarılır
      }
    }

    return entry;
  },

  deleteCompanyProfile(codeOrId: string): CompanyProfile[] {
    const target = codeOrId.trim().toUpperCase();
    // SERVER_CONFIG_KEY içinde aynı firma varsa temizle ki yeniden dirilmesin
    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        if ((cfg.companyCode || '').trim().toUpperCase() === target) {
          localStorage.removeItem(SERVER_CONFIG_KEY);
        }
      }
    } catch {
      // ignore
    }

    const remaining = this.getCompanyProfiles().filter(
      (p) => p.id.toUpperCase() !== target && p.code.trim().toUpperCase() !== target
    );
    this.saveCompanyProfiles(remaining);

    if (typeof navigator === 'undefined' || navigator.onLine) {
      fetch(`/api/registry/companies/${encodeURIComponent(target)}`, {
        method: 'DELETE',
        headers: this.buildAdminHeaders(),
      }).catch(() => {});
    }

    return remaining;
  },

  async deleteCompanyProfileAsync(codeOrId: string): Promise<CompanyProfile[]> {
    const remaining = this.deleteCompanyProfile(codeOrId);
    const target = codeOrId.trim().toUpperCase();
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const res = await fetch(`/api/registry/companies/${encodeURIComponent(target)}`, {
          method: 'DELETE',
          headers: this.buildAdminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.profiles)) {
            this.saveCompanyProfiles(data.profiles);
            return data.profiles;
          }
        }
      } catch {
        // ignore offline error
      }
    }
    return remaining;
  },

  profileToServerConfig(profile: CompanyProfile): ServerConfig {
    return {
      apiUrl: profile.serverUrl && profile.serverUrl !== 'demo' ? '/api' : 'demo',
      companyCode: profile.code.trim().toUpperCase(),
      period: profile.period || '2026',
      autoSync: true,
      companyTitle: profile.companyTitle || profile.name,
      sqlHost: profile.sqlHost,
      sqlPort: profile.sqlPort || '1433',
      sqlDatabase: profile.sqlDatabase,
      sqlUser: profile.sqlUser,
      sqlPassword: profile.sqlPassword,
      licenseExpireDate: profile.licenseExpireDate || '2027-12-31',
    };
  },

  upsertCompanyProfileFromConfig(config: ServerConfig): void {
    if (typeof window === 'undefined' || !config.companyCode?.trim()) return;
    if (isUntouchedDefaultServerConfig(config)) return;
    const codeUpper = config.companyCode.trim().toUpperCase();
    if (codeUpper === ADMIN_COMPANY_CODE) return;

    this.upsertCompanyProfile({
      id: `prof-${codeUpper}`,
      name: config.companyTitle?.trim() || codeUpper,
      code: codeUpper,
      period: config.period || '2026',
      serverUrl: isDemoMode(config) ? 'demo' : '/api',
      companyTitle: config.companyTitle?.trim() || codeUpper,
      sqlHost: config.sqlHost,
      sqlPort: config.sqlPort,
      sqlDatabase: config.sqlDatabase,
      sqlUser: config.sqlUser,
      sqlPassword: config.sqlPassword,
      licenseExpireDate: config.licenseExpireDate,
    });
  },

  findServerConfigByCompanyCode(companyCode: string): ServerConfig | null {
    if (typeof window === 'undefined' || !companyCode.trim()) return null;
    const codeUpper = companyCode.trim().toUpperCase();

    const profiles = this.getCompanyProfiles();
    const found = profiles.find((p) => p.code?.trim().toUpperCase() === codeUpper);
    if (found) {
      return this.profileToServerConfig(found);
    }

    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        if (cfg.companyCode?.trim().toUpperCase() === codeUpper) {
          return cfg;
        }
      }
    } catch {
      // ignore
    }

    return null;
  },

  syncLocalLicenseExpireDate(companyCode: string, licenseExpireDate?: string): void {
    if (typeof window === 'undefined' || !companyCode.trim() || !licenseExpireDate?.trim()) return;
    const codeUpper = companyCode.trim().toUpperCase();
    const exp = licenseExpireDate.trim();

    try {
      const profiles = this.getCompanyProfiles();
      let changed = false;
      const updatedProfiles = profiles.map((p) => {
        if (p.code?.trim().toUpperCase() === codeUpper && p.licenseExpireDate !== exp) {
          changed = true;
          return { ...p, licenseExpireDate: exp };
        }
        return p;
      });
      if (changed) {
        this.saveCompanyProfiles(updatedProfiles);
      }
    } catch {
      // ignore
    }

    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        if (cfg.companyCode?.trim().toUpperCase() === codeUpper && cfg.licenseExpireDate !== exp) {
          localStorage.setItem(
            SERVER_CONFIG_KEY,
            JSON.stringify({ ...cfg, licenseExpireDate: exp })
          );
        }
      }
    } catch {
      // ignore
    }
  },

  async checkCompanyLicenseStatus(companyCode?: string): Promise<{
    licenseExpired: boolean;
    licenseExpireDate?: string;
    matchedServerConfig?: ServerConfig | null;
    error?: string;
  }> {
    const codeUpper = (companyCode || '').trim().toUpperCase();
    if (!codeUpper || codeUpper === ADMIN_COMPANY_CODE) {
      return { licenseExpired: false };
    }

    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const res = await fetch(
          `/api/registry/license-status?companyCode=${encodeURIComponent(codeUpper)}`
        );
        if (res.ok) {
          const data = await res.json();
          const remoteCfg = (data?.matchedServerConfig as ServerConfig | null) || null;
          if (remoteCfg?.companyCode) {
            this.saveCompanyProfileLocalOnly({
              code: remoteCfg.companyCode,
              name: remoteCfg.companyTitle || remoteCfg.companyCode,
              companyTitle: remoteCfg.companyTitle || remoteCfg.companyCode,
              period: remoteCfg.period || '2026',
              serverUrl: isDemoMode(remoteCfg) ? 'demo' : '/api',
              sqlHost: remoteCfg.sqlHost,
              sqlPort: remoteCfg.sqlPort,
              sqlDatabase: remoteCfg.sqlDatabase,
              sqlUser: remoteCfg.sqlUser,
              sqlPassword: remoteCfg.sqlPassword,
              licenseExpireDate: remoteCfg.licenseExpireDate,
            });
          }
          if (data?.foundCompany && data?.licenseExpireDate) {
            this.syncLocalLicenseExpireDate(codeUpper, data.licenseExpireDate);
          }
          if (data?.licenseExpired || isLicenseExpired(data?.licenseExpireDate)) {
            return {
              licenseExpired: true,
              licenseExpireDate: data?.licenseExpireDate,
              matchedServerConfig: remoteCfg,
              error: LICENSE_EXPIRED_MESSAGE,
            };
          }
          if (data?.foundCompany) {
            return {
              licenseExpired: false,
              licenseExpireDate: data?.licenseExpireDate,
              matchedServerConfig: remoteCfg,
            };
          }
        }
      } catch {
        // Ağ hatasında yerel lisans tarihini kontrol et
      }
    }

    const localCfg = this.findServerConfigByCompanyCode(codeUpper);
    if (isLicenseExpired(localCfg?.licenseExpireDate)) {
      return {
        licenseExpired: true,
        licenseExpireDate: localCfg?.licenseExpireDate,
        matchedServerConfig: localCfg,
        error: LICENSE_EXPIRED_MESSAGE,
      };
    }

    return {
      licenseExpired: false,
      licenseExpireDate: localCfg?.licenseExpireDate,
      matchedServerConfig: localCfg,
    };
  },

  async authenticate(params: {
    companyCode: string;
    repCode: string;
    password: string;
  }): Promise<{
    success: boolean;
    isAdmin?: boolean;
    adminUser?: AuthUser;
    account?: PlasiyerAccount;
    matchedServerConfig?: ServerConfig | null;
    licenseExpired?: boolean;
    error?: string;
  }> {
    const cCode = params.companyCode.trim().toUpperCase();
    const rawUser = params.repCode.trim();
    const rCode = rawUser.toUpperCase();
    const pwd = params.password;

    if (!cCode) {
      return { success: false, error: 'Lütfen Firma Kodunu giriniz.' };
    }
    if (!rawUser) {
      return { success: false, error: 'Lütfen Kullanıcı / Plasiyer Kodunu giriniz.' };
    }
    if (!pwd) {
      return { success: false, error: 'Lütfen Şifrenizi giriniz.' };
    }

    // 0. YETKİLİ KURUM (POLATLAR YAZILIM) SÜPER ADMİN GİRİŞ KONTROLÜ
    if (cCode === ADMIN_COMPANY_CODE) {
      if (rawUser.toLowerCase() === ADMIN_USERNAME && pwd === ADMIN_PASSWORD) {
        return {
          success: true,
          isAdmin: true,
          adminUser: {
            id: 'admin-polatlar',
            role: 'admin',
            code: ADMIN_USERNAME,
            name: 'Polatlar Yazılım (Yetkili Kurum)',
            companyCode: ADMIN_COMPANY_CODE,
          },
        };
      }
      return {
        success: false,
        error: 'Yetkili Kurum (POLATLAR) kullanıcı adı veya şifresi hatalı!',
      };
    }

    // 1. Çevrimiçi ise önce Merkezi Bulut Kayıt Defterinden doğrula (yeni telefon/PC kurulum linki gerekmeden giriş yapabilsin)
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const cloudRes = await fetch('/api/registry/authenticate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyCode: cCode,
            repCode: rCode,
            password: pwd,
          }),
        });

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          if (cloudData?.licenseExpired) {
            if (cloudData.licenseExpireDate) {
              this.syncLocalLicenseExpireDate(cCode, cloudData.licenseExpireDate);
            }
            return {
              success: false,
              licenseExpired: true,
              error: LICENSE_EXPIRED_MESSAGE,
            };
          }

          if (cloudData?.authenticated && cloudData?.account) {
            const remoteCfg = (cloudData.matchedServerConfig as ServerConfig | null) || null;
            if (remoteCfg?.companyCode) {
              localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(remoteCfg));
              this.saveCompanyProfileLocalOnly({
                code: remoteCfg.companyCode,
                name: remoteCfg.companyTitle || remoteCfg.companyCode,
                companyTitle: remoteCfg.companyTitle || remoteCfg.companyCode,
                period: remoteCfg.period || '2026',
                serverUrl: isDemoMode(remoteCfg) ? 'demo' : '/api',
                sqlHost: remoteCfg.sqlHost,
                sqlPort: remoteCfg.sqlPort,
                sqlDatabase: remoteCfg.sqlDatabase,
                sqlUser: remoteCfg.sqlUser,
                sqlPassword: remoteCfg.sqlPassword,
                licenseExpireDate: remoteCfg.licenseExpireDate,
              });
            }

            const syncedAcc = this.upsertAccountLocal({
              companyCode: cloudData.account.companyCode || cCode,
              repCode: cloudData.account.repCode || rCode,
              firstName: cloudData.account.firstName || '',
              lastName: cloudData.account.lastName || '',
              password: pwd,
              accountRole: cloudData.account.accountRole === 'manager' ? 'manager' : 'plasiyer',
              updatedAt: cloudData.account.updatedAt,
            });

            return {
              success: true,
              account: syncedAcc,
              matchedServerConfig: remoteCfg || this.findServerConfigByCompanyCode(cCode),
            };
          }

          if (cloudData?.found && !cloudData?.authenticated) {
            const localMatch = this.getLocalAccounts().find(
              (a) =>
                a.companyCode.toUpperCase() === cCode &&
                a.repCode.toUpperCase() === rCode &&
                a.password === pwd
            );
            if (!localMatch) {
              return {
                success: false,
                error: cloudData.error || 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
              };
            }
          }
        }
      } catch {
        // Ağ hatasında yerel/SQL doğrulamaya devam et
      }
    }

    const matchedServerConfig = this.findServerConfigByCompanyCode(cCode);

    // Lisans Bitiş Tarihi kontrolü
    if (isLicenseExpired(matchedServerConfig?.licenseExpireDate)) {
      return {
        success: false,
        licenseExpired: true,
        error: LICENSE_EXPIRED_MESSAGE,
      };
    }

    // 2. Bağlı canlı SQL veritabanı (veya yerel köprü) varsa oradan doğrula
    if (matchedServerConfig && !isDemoMode(matchedServerConfig) && navigator.onLine) {
      try {
        const baseUrl = await resolveApiBaseUrlAsync(matchedServerConfig);
        const res = await fetch(`${baseUrl}/plasiyers/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildSqlHeaders(matchedServerConfig),
          },
          body: JSON.stringify({
            companyCode: cCode,
            repCode: rCode,
            password: pwd,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.licenseExpired) {
            if (data.licenseExpireDate) {
              this.syncLocalLicenseExpireDate(cCode, data.licenseExpireDate);
            }
            return {
              success: false,
              licenseExpired: true,
              error: LICENSE_EXPIRED_MESSAGE,
            };
          }
          if (data?.found && data?.authenticated && data?.account) {
            const syncedAcc = this.upsertAccountLocal({
              companyCode: data.account.companyCode || cCode,
              repCode: data.account.repCode || rCode,
              firstName: data.account.firstName || '',
              lastName: data.account.lastName || '',
              password: pwd,
              accountRole: data.account.accountRole === 'manager' ? 'manager' : 'plasiyer',
            });
            return {
              success: true,
              account: syncedAcc,
              matchedServerConfig,
            };
          }
          if (data?.found && !data?.authenticated) {
            const localAccounts = this.getLocalAccounts();
            const localMatch = localAccounts.find(
              (a) =>
                a.companyCode.toUpperCase() === cCode &&
                a.repCode.toUpperCase() === rCode &&
                a.password === pwd
            );
            if (localMatch) {
              return { success: true, account: localMatch, matchedServerConfig };
            }
            return {
              success: false,
              error: data.error || 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
            };
          }
        }
      } catch {
        // Ağ hatasında yerel kayıtlardan doğrulamaya devam et
      }
    }

    // 3. Yerel plasiyer hesaplarından doğrula (Çevrimdışı çalışma desteği)
    const accounts = this.getLocalAccounts();
    const companyAccounts = accounts.filter((a) => a.companyCode.toUpperCase() === cCode);
    if (companyAccounts.length === 0) {
      return {
        success: false,
        error: `"${cCode}" Firma Koduna ait tanımlı hesap bulunamadı. Firma Kodunu kontrol ediniz veya yetkili kurumdan destek alınız.`,
      };
    }

    const repAccount = companyAccounts.find((a) => a.repCode.toUpperCase() === rCode);
    if (!repAccount) {
      return {
        success: false,
        error: `"${cCode}" firmasında "${rCode}" kullanıcı/plasiyer kodu bulunamadı.`,
      };
    }

    if (repAccount.password !== pwd) {
      return {
        success: false,
        error: 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
      };
    }

    return {
      success: true,
      account: repAccount,
      matchedServerConfig,
    };
  },

  buildMobileInviteLink(account: PlasiyerAccount, serverConfig: ServerConfig): string {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://plasiyer.vercel.app';
    const payload = {
      v: 1,
      cfg: {
        apiUrl: isDemoMode(serverConfig) ? 'demo' : '/api',
        companyCode: account.companyCode.toUpperCase(),
        period: serverConfig.period || '2026',
        companyTitle: serverConfig.companyTitle || account.companyCode.toUpperCase(),
        sqlHost: serverConfig.sqlHost || '',
        sqlPort: serverConfig.sqlPort || '1433',
        sqlDatabase: serverConfig.sqlDatabase || '',
        sqlUser: serverConfig.sqlUser || '',
        sqlPassword: serverConfig.sqlPassword || '',
        licenseExpireDate: serverConfig.licenseExpireDate || '2027-12-31',
      },
      acc: {
        companyCode: account.companyCode.toUpperCase(),
        repCode: account.repCode.toUpperCase(),
        firstName: account.firstName,
        lastName: account.lastName,
        password: account.password,
        accountRole: account.accountRole || 'plasiyer',
      },
    };
    const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
    return `${origin}/?invite=${encoded}`;
  },

  buildCompanyInviteLink(profile: CompanyProfile, accounts?: PlasiyerAccount[]): string {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://plasiyer.vercel.app';
    const codeUpper = profile.code.trim().toUpperCase();
    const firmAccounts =
      accounts ??
      this.getLocalAccounts().filter(
        (a) => a.companyCode.toUpperCase() === codeUpper && !a.isDefaultSeed
      );
    const primaryAcc =
      firmAccounts.find((a) => a.accountRole === 'manager') || firmAccounts[0];

    const payload = {
      v: 2,
      cfg: {
        apiUrl: profile.serverUrl && profile.serverUrl !== 'demo' ? '/api' : 'demo',
        companyCode: codeUpper,
        period: profile.period || '2026',
        companyTitle: profile.companyTitle || profile.name || codeUpper,
        sqlHost: profile.sqlHost || '',
        sqlPort: profile.sqlPort || '1433',
        sqlDatabase: profile.sqlDatabase || '',
        sqlUser: profile.sqlUser || '',
        sqlPassword: profile.sqlPassword || '',
        licenseExpireDate: profile.licenseExpireDate || '2027-12-31',
      },
      acc: primaryAcc
        ? {
            companyCode: codeUpper,
            repCode: primaryAcc.repCode.toUpperCase(),
            firstName: primaryAcc.firstName,
            lastName: primaryAcc.lastName,
            password: primaryAcc.password,
            accountRole: primaryAcc.accountRole || 'plasiyer',
          }
        : undefined,
      accs: firmAccounts.map((a) => ({
        companyCode: codeUpper,
        repCode: a.repCode.toUpperCase(),
        firstName: a.firstName,
        lastName: a.lastName,
        password: a.password,
        accountRole: a.accountRole || 'plasiyer',
      })),
    };
    const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
    return `${origin}/?invite=${encoded}`;
  },

  consumeInviteFromUrl(): {
    imported: boolean;
    companyCode?: string;
    repCode?: string;
    licenseExpired?: boolean;
  } {
    if (typeof window === 'undefined') return { imported: false };
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get('invite');
      if (!token) return { imported: false };

      const decoded = JSON.parse(decodeBase64UrlUtf8(token));
      if (decoded?.cfg?.companyCode) {
        const importedCfg: ServerConfig = {
          apiUrl: decoded.cfg.apiUrl || '/api',
          companyCode: String(decoded.cfg.companyCode).toUpperCase(),
          period: decoded.cfg.period || '2026',
          autoSync: true,
          companyTitle: decoded.cfg.companyTitle,
          sqlHost: decoded.cfg.sqlHost,
          sqlPort: decoded.cfg.sqlPort || '1433',
          sqlDatabase: decoded.cfg.sqlDatabase,
          sqlUser: decoded.cfg.sqlUser,
          sqlPassword: decoded.cfg.sqlPassword,
          licenseExpireDate: decoded.cfg.licenseExpireDate,
        };
        localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(importedCfg));
        this.saveCompanyProfileLocalOnly({
          code: importedCfg.companyCode,
          name: importedCfg.companyTitle || importedCfg.companyCode,
          companyTitle: importedCfg.companyTitle || importedCfg.companyCode,
          period: importedCfg.period || '2026',
          serverUrl: isDemoMode(importedCfg) ? 'demo' : '/api',
          sqlHost: importedCfg.sqlHost,
          sqlPort: importedCfg.sqlPort,
          sqlDatabase: importedCfg.sqlDatabase,
          sqlUser: importedCfg.sqlUser,
          sqlPassword: importedCfg.sqlPassword,
          licenseExpireDate: importedCfg.licenseExpireDate,
        });
      }

      if (Array.isArray(decoded?.accs)) {
        for (const item of decoded.accs) {
          if (item?.companyCode && item?.repCode && item?.password) {
            this.upsertAccountLocal({
              companyCode: String(item.companyCode).toUpperCase(),
              repCode: String(item.repCode).toUpperCase(),
              firstName: String(item.firstName || ''),
              lastName: String(item.lastName || ''),
              password: String(item.password),
              accountRole: item.accountRole === 'manager' ? 'manager' : 'plasiyer',
            });
          }
        }
      } else if (decoded?.acc?.companyCode && decoded?.acc?.repCode && decoded?.acc?.password) {
        this.upsertAccountLocal({
          companyCode: String(decoded.acc.companyCode).toUpperCase(),
          repCode: String(decoded.acc.repCode).toUpperCase(),
          firstName: String(decoded.acc.firstName || ''),
          lastName: String(decoded.acc.lastName || ''),
          password: String(decoded.acc.password),
          accountRole: decoded.acc.accountRole === 'manager' ? 'manager' : 'plasiyer',
        });
      }

      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);

      return {
        imported: true,
        companyCode: decoded?.acc?.companyCode || decoded?.cfg?.companyCode,
        repCode: decoded?.acc?.repCode,
        licenseExpired: isLicenseExpired(decoded?.cfg?.licenseExpireDate),
      };
    } catch {
      return { imported: false };
    }
  },
};
