import type { AuthUser, CompanyProfile, PlasiyerAccount, SalesRep, ServerConfig } from '../types';
import { buildSqlHeaders, isDemoMode, resolveApiBaseUrlAsync } from './apiService';

const ACCOUNTS_STORAGE_KEY = 'plasiyer_rep_accounts';
const PROFILES_STORAGE_KEY = 'plasiyer_company_profiles';
const SERVER_CONFIG_KEY = 'plasiyer_server_config';
const REP_STORAGE_KEY = 'plasiyer_rep';

export const ADMIN_COMPANY_CODE = 'POLATLAR';
export const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '16051990Sa.';

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

function encodeBase64UrlUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export const plasiyerAuthService = {
  getLocalAccounts(): PlasiyerAccount[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
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
  }): PlasiyerAccount {
    const companyCode = input.companyCode.trim().toUpperCase();
    const repCode = input.repCode.trim().toUpperCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const password = input.password;

    const current = this.getLocalAccounts().filter((a) => !a.isDefaultSeed || makeAccountKey(a.companyCode, a.repCode) !== makeAccountKey(companyCode, repCode));
    const targetKey = makeAccountKey(companyCode, repCode);
    const updatedAccount: PlasiyerAccount = {
      id: `acc-${companyCode}-${repCode}`,
      companyCode,
      repCode,
      firstName,
      lastName,
      password,
      isDefaultSeed: false,
      updatedAt: new Date().toISOString(),
    };

    const existingIdx = current.findIndex(
      (a) => makeAccountKey(a.companyCode, a.repCode) === targetKey
    );

    let next: PlasiyerAccount[];
    if (existingIdx >= 0) {
      next = [...current];
      next[existingIdx] = updatedAccount;
    } else {
      // İlk özel hesap kaydedildiğinde varsayılan seed kaydı farklı firma/kod ise temizle
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
    },
    serverConfig?: ServerConfig
  ): Promise<PlasiyerAccount> {
    const savedLocal = this.upsertAccountLocal(input);

    if (serverConfig && !isDemoMode(serverConfig)) {
      try {
        const baseUrl = await resolveApiBaseUrlAsync(serverConfig);
        await fetch(`${baseUrl}/plasiyers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildSqlHeaders(serverConfig),
          },
          body: JSON.stringify({
            companyCode: savedLocal.companyCode,
            repCode: savedLocal.repCode,
            firstName: savedLocal.firstName,
            lastName: savedLocal.lastName,
            password: savedLocal.password,
          }),
        });
      } catch {
        // Çevrimdışı durumda yerel kayıt yeterlidir
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

    if (serverConfig && !isDemoMode(serverConfig)) {
      try {
        const baseUrl = await resolveApiBaseUrlAsync(serverConfig);
        await fetch(
          `${baseUrl}/plasiyers?companyCode=${encodeURIComponent(companyCode)}&repCode=${encodeURIComponent(repCode)}`,
          {
            method: 'DELETE',
            headers: buildSqlHeaders(serverConfig),
          }
        );
      } catch {
        // ignore network error
      }
    }

    return remaining;
  },

  async syncAccountsFromSql(serverConfig?: ServerConfig): Promise<PlasiyerAccount[]> {
    const localList = this.getLocalAccounts();
    if (!serverConfig || isDemoMode(serverConfig)) return localList;

    try {
      const baseUrl = await resolveApiBaseUrlAsync(serverConfig);
      const res = await fetch(`${baseUrl}/plasiyers`, {
        headers: buildSqlHeaders(serverConfig),
      });
      if (!res.ok) return localList;
      const data = await res.json();
      if (!Array.isArray(data?.accounts) || data.accounts.length === 0) {
        return localList;
      }

      const map = new Map<string, PlasiyerAccount>();
      localList
        .filter((a) => !a.isDefaultSeed)
        .forEach((acc) => map.set(makeAccountKey(acc.companyCode, acc.repCode), acc));

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

    // Aktif serverConfig bir müşteri firmasıysa ve listede yoksa otomatik dahil et
    try {
      const cfgRaw = localStorage.getItem(SERVER_CONFIG_KEY);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw) as ServerConfig;
        const activeCode = (cfg.companyCode || '').trim().toUpperCase();
        if (activeCode && activeCode !== ADMIN_COMPANY_CODE) {
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

  upsertCompanyProfile(profileInput: Omit<CompanyProfile, 'id'> & { id?: string }): CompanyProfile {
    const codeUpper = profileInput.code.trim().toUpperCase();
    const profiles = this.getCompanyProfiles();

    const entry: CompanyProfile = {
      id: profileInput.id || `prof-${codeUpper}`,
      name: profileInput.companyTitle?.trim() || profileInput.name?.trim() || codeUpper,
      code: codeUpper,
      period: profileInput.period?.trim() || '2026',
      serverUrl:
        profileInput.serverUrl && profileInput.serverUrl !== 'demo' ? '/api' : 'demo',
      companyTitle: profileInput.companyTitle?.trim() || profileInput.name?.trim() || codeUpper,
      sqlHost: profileInput.sqlHost?.trim() || '',
      sqlPort: profileInput.sqlPort?.trim() || '1433',
      sqlDatabase: profileInput.sqlDatabase?.trim() || '',
      sqlUser: profileInput.sqlUser?.trim() || '',
      sqlPassword: profileInput.sqlPassword ?? '',
      licenseExpireDate: profileInput.licenseExpireDate?.trim() || '2027-12-31',
      isDefault: profileInput.isDefault,
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

  deleteCompanyProfile(codeOrId: string): CompanyProfile[] {
    const target = codeOrId.trim().toUpperCase();
    const remaining = this.getCompanyProfiles().filter(
      (p) => p.id.toUpperCase() !== target && p.code.trim().toUpperCase() !== target
    );
    this.saveCompanyProfiles(remaining);
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

    const profiles = this.getCompanyProfiles();
    const found = profiles.find((p) => p.code?.trim().toUpperCase() === codeUpper);
    if (found) {
      return this.profileToServerConfig(found);
    }

    return null;
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

    const matchedServerConfig = this.findServerConfigByCompanyCode(cCode);

    // Lisans Bitiş Tarihi kontrolü
    if (matchedServerConfig?.licenseExpireDate) {
      const exp = matchedServerConfig.licenseExpireDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (exp < todayStr) {
          return {
            success: false,
            error: `"${cCode}" firmasının kullanım lisans süresi (${exp}) dolmuştur. Lütfen Polatlar Yazılım ile iletişime geçiniz.`,
          };
        }
      }
    }

    // 1. Önce bağlı canlı SQL veritabanı varsa oradan doğrula (farklı bilgisayardan eklenen plasiyerler için)
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
          if (data?.found && data?.authenticated && data?.account) {
            const syncedAcc = this.upsertAccountLocal({
              companyCode: data.account.companyCode || cCode,
              repCode: data.account.repCode || rCode,
              firstName: data.account.firstName || '',
              lastName: data.account.lastName || '',
              password: pwd,
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

    // 2. Yerel plasiyer hesaplarından doğrula (Firma Kodu + Plasiyer Kodu + Şifre)
    const accounts = this.getLocalAccounts();
    const companyAccounts = accounts.filter((a) => a.companyCode.toUpperCase() === cCode);
    if (companyAccounts.length === 0) {
      return {
        success: false,
        error: `"${cCode}" Firma Koduna ait tanımlı hesap bulunamadı. Firma Kodunu kontrol ediniz veya yetkili kurumdan kurulum bağlantısı talep ediniz.`,
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
    const primaryAcc = firmAccounts[0];

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
          }
        : undefined,
      accs: firmAccounts.map((a) => ({
        companyCode: codeUpper,
        repCode: a.repCode.toUpperCase(),
        firstName: a.firstName,
        lastName: a.lastName,
        password: a.password,
      })),
    };
    const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
    return `${origin}/?invite=${encoded}`;
  },

  consumeInviteFromUrl(): { imported: boolean; companyCode?: string; repCode?: string } {
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
        this.upsertCompanyProfileFromConfig(importedCfg);
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
        });
      }

      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);

      return {
        imported: true,
        companyCode: decoded?.acc?.companyCode || decoded?.cfg?.companyCode,
        repCode: decoded?.acc?.repCode,
      };
    } catch {
      return { imported: false };
    }
  },
};
