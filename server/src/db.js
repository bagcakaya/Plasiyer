import sql from 'mssql';
import { AsyncLocalStorage } from 'async_hooks';
import { execFile } from 'child_process';
import util from 'util';
import dotenv from 'dotenv';
import { sqlCloudRelay } from './sqlCloudRelay.js';
dotenv.config();

const execFilePromise = util.promisify(execFile);

export const sqlContext = new AsyncLocalStorage();

const DB_SERVER = process.env.DB_SERVER || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 1434;
const DB_USER = process.env.DB_USER || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || 'polatlar4555.';
const DB_NAME = process.env.DB_NAME || 'OSMANLIGIDA';

let defaultPoolPromise = null;
const dynamicPools = new Map(); // poolKey -> Promise<sql.ConnectionPool>

function parseHostAndPort(rawHost, rawPort) {
  let cleanHost = String(rawHost || DB_SERVER)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');

  let parsedPort = parseInt(String(rawPort || '').trim(), 10);

  // "88.250.63.243,4555" veya "88.250.63.243:4555" formatlarını da destekle
  if (cleanHost.includes(',')) {
    const [h, p] = cleanHost.split(',');
    cleanHost = h.trim();
    if (!parsedPort && p) parsedPort = parseInt(p.trim(), 10);
  } else if (cleanHost.includes(':') && !cleanHost.startsWith('[')) {
    const [h, p] = cleanHost.split(':');
    cleanHost = h.trim();
    if (!parsedPort && p) parsedPort = parseInt(p.trim(), 10);
  }

  let instanceName;
  if (cleanHost.includes('\\')) {
    const [h, inst] = cleanHost.split('\\');
    cleanHost = h.trim();
    instanceName = inst?.trim() || undefined;
  }

  if (!parsedPort || isNaN(parsedPort)) {
    parsedPort = cleanHost === 'localhost' || cleanHost === '127.0.0.1' ? DB_PORT : 1433;
  }

  return { cleanHost, parsedPort, instanceName };
}

function isLocalServer(host) {
  const h = String(host || '').trim().toLowerCase();
  return !h || h === 'localhost' || h === '127.0.0.1' || h === '.';
}

export function formatSqlError(err, host, port, database, user) {
  const rawMsg = err?.originalError?.message || err?.message || String(err);
  const code = err?.code || '';

  if (code === 'ELOGIN' || rawMsg.includes('Login failed')) {
    if (rawMsg.includes('Cannot open database')) {
      return `SQL sunucusuna (${host}:${port}) ulaşıldı ancak [${database}] veritabanı bulunamadı veya '${user}' kullanıcısının bu veritabanına yetkisi yok. (${rawMsg})`;
    }
    return `SQL sunucusuna (${host}:${port}) ulaşıldı ancak kullanıcı adı ('${user}') veya şifre hatalı! SQL Server Authentication yetkilerini kontrol ediniz. (${rawMsg})`;
  }

  if (
    code === 'ESOCKET' ||
    code === 'ETIMEOUT' ||
    code === 'ECONNREFUSED' ||
    rawMsg.includes('Failed to connect') ||
    rawMsg.includes('timeout')
  ) {
    if (process.env.VERCEL) {
      return `SQL Server adresine (${host}:${port}) bulut üzerinden TCP bağlantısı kurulamadı. Port (${port}) Türkiye içinden açık ancak buluttan erişilemiyorsa, karşı sunucu güvenlik duvarında (FortiGate / MikroTik / Modem) "Yurt Dışı IP Engelleme (GeoIP)" aktif olabilir. (${rawMsg})`;
    }
    return `SQL Server adresine (${host}:${port}) TCP bağlantısı kurulamadı. Statik IP, SQL portu (${port}) yönlendirmesini ve güvenlik duvarını kontrol ediniz. (${rawMsg})`;
  }

  return `SQL Hatası (${host}:${port} -> ${database}): ${rawMsg}`;
}

export function getActiveSqlConfig() {
  const ctx = sqlContext.getStore();
  if (ctx && ctx.sqlHost && String(ctx.sqlHost).trim() !== '') {
    const { cleanHost, parsedPort, instanceName } = parseHostAndPort(ctx.sqlHost, ctx.sqlPort);
    const database = String(ctx.sqlDatabase || DB_NAME).trim();
    const user = String(ctx.sqlUser ?? '').trim();
    const password = String(ctx.sqlPassword ?? '');

    // Eğer localhost ise ve kullanıcı adı boş bırakıldıysa varsayılan yerel yapılandırmayı kullan
    if (isLocalServer(cleanHost) && !user && database === DB_NAME) {
      return null;
    }

    return {
      isCustom: true,
      server: cleanHost,
      port: parsedPort,
      instanceName,
      database,
      user: user || DB_USER,
      password: user ? password : DB_PASSWORD,
    };
  }
  return null;
}

export function getActiveDbKey() {
  const cfg = getActiveSqlConfig();
  if (!cfg) return `DEFAULT:${DB_SERVER}:${DB_PORT}:${DB_NAME}`;
  return `CUSTOM:${cfg.server}:${cfg.port}:${cfg.database}:${cfg.user}`;
}

function buildMssqlConfig(cfg) {
  const options = {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  };
  if (cfg.instanceName && !cfg.port) {
    options.instanceName = cfg.instanceName;
  }

  const mssqlCfg = {
    user: cfg.user,
    password: cfg.password,
    server: cfg.server,
    database: cfg.database,
    options,
    pool: {
      max: 8,
      min: 0,
      idleTimeoutMillis: 25000,
    },
    connectionTimeout: process.env.VERCEL ? 3500 : 10000,
    requestTimeout: 30000,
  };

  if (cfg.port) {
    mssqlCfg.port = cfg.port;
  }

  return mssqlCfg;
}

async function getDynamicPool(cfg) {
  const key = `${cfg.server}:${cfg.port}:${cfg.database}:${cfg.user}:${cfg.password}`;
  let existing = dynamicPools.get(key);
  if (existing) {
    try {
      const pool = await existing;
      if (pool && pool.connected) return pool;
    } catch {
      dynamicPools.delete(key);
    }
  }

  const poolInstance = new sql.ConnectionPool(buildMssqlConfig(cfg));
  const connectPromise = poolInstance
    .connect()
    .then((pool) => {
      pool.on('error', (err) => {
        console.warn(`⚠️ Dinamik SQL havuz uyarısı (${cfg.server}:${cfg.port}):`, err.message);
        dynamicPools.delete(key);
      });
      return pool;
    })
    .catch((err) => {
      dynamicPools.delete(key);
      throw new Error(formatSqlError(err, cfg.server, cfg.port, cfg.database, cfg.user));
    });

  dynamicPools.set(key, connectPromise);
  return connectPromise;
}

async function getDefaultPool() {
  if (!defaultPoolPromise) {
    const defaultCfg = {
      server: DB_SERVER,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
    };
    const poolInstance = new sql.ConnectionPool({
      ...buildMssqlConfig(defaultCfg),
      connectionTimeout: 2500,
    });
    defaultPoolPromise = poolInstance
      .connect()
      .then((pool) => {
        pool.on('error', (err) => {
          console.warn('⚠️ MSSQL havuz arka plan uyarısı:', err.message);
          defaultPoolPromise = null;
        });
        return pool;
      })
      .catch((err) => {
        console.warn('⚠️ Varsayılan MSSQL TCP bağlantısı kurulamadı:', err.message);
        defaultPoolPromise = null;
        return null;
      });
  }
  return defaultPoolPromise;
}

/**
 * Doğrudan Girilen SQL Server Ayarlarını Canlı Test Et
 */
export async function testDirectSqlConnection(rawConfig) {
  const { cleanHost, parsedPort, instanceName } = parseHostAndPort(
    rawConfig?.sqlHost,
    rawConfig?.sqlPort
  );
  const database = String(rawConfig?.sqlDatabase || DB_NAME).trim();
  const user = String(rawConfig?.sqlUser || '').trim();
  const password = String(rawConfig?.sqlPassword || '');

  // Yerel Windows Auth fallback kontrolü
  if (isLocalServer(cleanHost) && !user && process.platform === 'win32' && !process.env.VERCEL) {
    const ok = await testConnection();
    if (ok) {
      return {
        success: true,
        dbName: database,
        message: `SQL Server Bağlantısı Başarılı: ${cleanHost}:${parsedPort} -> [${database}] veritabanına yerel erişim doğrulandı.`,
      };
    }
  }

  if (!user) {
    return {
      success: false,
      message: `Uzak SQL Server (${cleanHost}:${parsedPort}) bağlantısı için SQL Kullanıcı Adı (örn: sa veya yetkili kullanıcı) ve şifre girilmelidir.`,
    };
  }

  const cfg = {
    server: cleanHost,
    port: parsedPort,
    instanceName,
    database,
    user,
    password,
  };

  // Bulut (Vercel) ortamında ve uzak Türkiye SQL sunucusu ise önce Canlı Türkiye Tüneli üzerinden test et (GeoIP engelini sıfır gecikmeyle aşar)
  if (process.env.VERCEL && !isLocalServer(cleanHost)) {
    try {
      const relayedTest = await sqlCloudRelay.remoteTestConnection({
        sqlHost: cleanHost,
        sqlPort: String(parsedPort),
        sqlDatabase: database,
        sqlUser: user,
        sqlPassword: password,
      });
      if (relayedTest && typeof relayedTest.success === 'boolean') {
        return relayedTest;
      }
    } catch {
      // Tünel yanıt vermezse doğrudan TCP bağlantısına düş
    }
  }

  let tempPool = null;
  try {
    tempPool = new sql.ConnectionPool({
      ...buildMssqlConfig(cfg),
      pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
      connectionTimeout: process.env.VERCEL ? 3500 : 9000,
    });
    await tempPool.connect();

    const probe = await tempPool.request().query(`
      SELECT 
        DB_NAME() AS dbName,
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE') AS tableCount,
        CASE WHEN OBJECT_ID('dbo.CARI') IS NOT NULL THEN 1 ELSE 0 END AS hasCari,
        CASE WHEN OBJECT_ID('dbo.STOK') IS NOT NULL THEN 1 ELSE 0 END AS hasStok
    `);

    const row = probe.recordset?.[0] || {};
    let tableInfo = `Toplam ${row.tableCount || 0} tablo erişilebilir`;

    if (row.hasCari && row.hasStok) {
      const countsRes = await tempPool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.CARI WITH(NOLOCK) WHERE AKTIF = 1) AS cariCount,
          (SELECT COUNT(*) FROM dbo.STOK WITH(NOLOCK) WHERE AKTIF = 1) AS stokCount
      `).catch(() => null);
      const cnt = countsRes?.recordset?.[0];
      tableInfo = cnt
        ? `ERP12 doğrulandı: ${cnt.cariCount} aktif cari, ${cnt.stokCount} aktif stok`
        : `ERP12 tabloları doğrulandı (${row.tableCount} tablo)`;
    } else {
      const dbsRes = await tempPool.request().query(`
        SELECT TOP 8 name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name
      `).catch(() => null);
      const otherDbs = (dbsRes?.recordset || []).map((d) => d.name).filter(Boolean);
      if (otherDbs.length > 0) {
        tableInfo += ` | Sunucudaki veritabanları: ${otherDbs.join(', ')}`;
      }
    }

    await tempPool.close().catch(() => {});

    return {
      success: true,
      dbName: row.dbName || database,
      tableCount: row.tableCount || 0,
      hasErpTables: Boolean(row.hasCari && row.hasStok),
      message: `SQL Server Bağlantısı Başarılı! ${cleanHost}:${parsedPort} -> [${row.dbName || database}] veritabanına doğrudan erişim sağlandı (${tableInfo}).`,
    };
  } catch (err) {
    if (tempPool) {
      await tempPool.close().catch(() => {});
    }
    return {
      success: false,
      message: formatSqlError(err, cleanHost, parsedPort, database, user),
    };
  }
}

/**
 * PowerShell Fallback SQL Runner (Yalnızca Yerel Windows Sunucu İçin)
 */
async function executeJsonQueryViaPowerShell(query, dbName = DB_NAME) {
  if (process.platform !== 'win32' || process.env.VERCEL) {
    throw new Error('SQL Server bağlantısı kurulamadı.');
  }

  const psScript = `
    Add-Type -AssemblyName System.Web.Extensions;
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=${DB_SERVER};Database=${dbName};Integrated Security=True;TrustServerCertificate=True;");
    $conn.Open();
    $cmd = $conn.CreateCommand();
    $cmd.CommandTimeout = 45;
    $cmd.CommandText = @'
${query}
'@;
    $reader = $cmd.ExecuteReader();
    $dt = New-Object System.Data.DataTable;
    $dt.Load($reader);
    $conn.Close();
    $rows = New-Object System.Collections.ArrayList;
    foreach ($r in $dt.Rows) {
      $dict = @{};
      foreach ($col in $dt.Columns) {
        $val = $r[$col.ColumnName];
        if ($val -is [System.DBNull]) { $dict[$col.ColumnName] = $null }
        else { $dict[$col.ColumnName] = $val }
      }
      [void]$rows.Add($dict);
    }
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer;
    $ser.MaxJsonLength = [int]::MaxValue;
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    Write-Output ($ser.Serialize($rows));
  `;

  const { stdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    {
      maxBuffer: 30 * 1024 * 1024,
      encoding: 'utf8',
    }
  );

  const text = stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

async function executeNonQueryViaPowerShell(query, dbName = DB_NAME) {
  if (process.platform !== 'win32' || process.env.VERCEL) {
    throw new Error('SQL Server bağlantısı kurulamadı.');
  }

  const psScript = `
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=${DB_SERVER};Database=${dbName};Integrated Security=True;TrustServerCertificate=True;");
    $conn.Open();
    $cmd = $conn.CreateCommand();
    $cmd.CommandTimeout = 45;
    $cmd.CommandText = @'
${query}
'@;
    $affected = $cmd.ExecuteNonQuery();
    $conn.Close();
    Write-Output $affected;
  `;

  const { stdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { encoding: 'utf8' }
  );
  return parseInt(stdout.trim(), 10);
}

function parseRecordsetJson(result) {
  if (!result || !result.recordset || result.recordset.length === 0) return [];
  const firstRow = result.recordset[0];
  const firstCol = Object.keys(firstRow)[0];
  if (firstCol && firstCol.startsWith('JSON_')) {
    const jsonStr = result.recordset.map((row) => Object.values(row)[0]).join('');
    return JSON.parse(jsonStr || '[]');
  }
  return result.recordset;
}

/**
 * Yüksek Performanslı JSON Sorgu Yürütücü (Çoklu Firma / Dinamik SQL Destekli)
 */
export async function executeJsonQuery(query) {
  const activeCfg = getActiveSqlConfig();

  // 1. Özel / Uzak SQL Server yapılandırması aktifse:
  // Bulut (Vercel) üzerindeyken GeoIP engelini aşmak için önce Canlı Türkiye Tüneli üzerinden sorgula
  if (activeCfg) {
    if (process.env.VERCEL && !isLocalServer(activeCfg.server)) {
      const relayedRows = await sqlCloudRelay.remoteExecuteJsonQuery(activeCfg, query);
      if (relayedRows !== null) {
        return relayedRows;
      }
    }
    const pool = await getDynamicPool(activeCfg);
    const result = await pool.request().query(query);
    return parseRecordsetJson(result);
  }

  // 2. Varsayılan yerel SQL bağlantısı
  try {
    const pool = await getDefaultPool();
    if (pool) {
      const result = await pool.request().query(query);
      return parseRecordsetJson(result);
    }
  } catch (directErr) {
    console.warn('⚠️ MSSQL pool sorgu hatası, yerel PowerShell ile deneniyor:', directErr.message);
    if (defaultPoolPromise) {
      defaultPoolPromise.then((p) => p && p.close().catch(() => {})).catch(() => {});
    }
    defaultPoolPromise = null;
  }

  return executeJsonQueryViaPowerShell(query);
}

/**
 * Yüksek Performanslı NonQuery Yürütücü (Çoklu Firma / Dinamik SQL Destekli)
 */
export async function executeNonQuery(query) {
  const activeCfg = getActiveSqlConfig();

  if (activeCfg) {
    if (process.env.VERCEL && !isLocalServer(activeCfg.server)) {
      const relayedCount = await sqlCloudRelay.remoteExecuteNonQuery(activeCfg, query);
      if (relayedCount !== null) {
        return relayedCount;
      }
    }
    const pool = await getDynamicPool(activeCfg);
    const result = await pool.request().query(query);
    return result.rowsAffected.reduce((a, b) => a + b, 0);
  }

  try {
    const pool = await getDefaultPool();
    if (pool) {
      const result = await pool.request().query(query);
      return result.rowsAffected.reduce((a, b) => a + b, 0);
    }
  } catch (directErr) {
    console.warn('⚠️ MSSQL pool nonQuery hatası, yerel PowerShell ile deneniyor:', directErr.message);
    if (defaultPoolPromise) {
      defaultPoolPromise.then((p) => p && p.close().catch(() => {})).catch(() => {});
    }
    defaultPoolPromise = null;
  }

  return executeNonQueryViaPowerShell(query);
}

export async function testConnection() {
  const res = await executeJsonQuery('SELECT 1 AS status');
  return res && res.length > 0;
}
