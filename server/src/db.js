import sql from 'mssql';
import { execFile } from 'child_process';
import util from 'util';
import dotenv from 'dotenv';
dotenv.config();

const execFilePromise = util.promisify(execFile);

const DB_SERVER = process.env.DB_SERVER || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 1434;
const DB_USER = process.env.DB_USER || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || 'polatlar4555.';
const DB_NAME = process.env.DB_NAME || 'OSMANLIGIDA';

let poolPromise = null;
let useMssqlPool = true;

/**
 * MSSQL Native Connection Pool (Çok yüksek hız ve düşük gecikme)
 */
async function getPool() {
  if (!useMssqlPool) return null;
  if (!poolPromise) {
    const config = {
      user: DB_USER,
      password: DB_PASSWORD,
      server: DB_SERVER,
      port: DB_PORT,
      database: DB_NAME,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      pool: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
      },
      requestTimeout: 25000,
      connectionTimeout: 8000,
    };

    poolPromise = sql.connect(config).then((pool) => {
      pool.on('error', (err) => {
        console.warn('⚠️ MSSQL havuz arka plan uyarısı:', err.message);
        poolPromise = null;
      });
      return pool;
    }).catch((err) => {
      console.warn('⚠️ Doğrudan MSSQL TCP bağlantısı kurulamadı, anlık PowerShell fallback moduna geçiliyor:', err.message);
      poolPromise = null;
      return null;
    });
  }
  return poolPromise;
}

/**
 * PowerShell Fallback SQL Runner (Integrated Security)
 */
async function executeJsonQueryViaPowerShell(query) {
  const psScript = `
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=${DB_SERVER};Database=${DB_NAME};Integrated Security=True;TrustServerCertificate=True;");
    $conn.Open();
    $cmd = $conn.CreateCommand();
    $cmd.CommandTimeout = 45;
    $cmd.CommandText = @'
${query}
'@;
    $reader = $cmd.ExecuteReader();
    $sb = New-Object System.Text.StringBuilder;
    while ($reader.Read()) {
        $sb.Append($reader[0].ToString()) | Out-Null;
    }
    $conn.Close();
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    Write-Output $sb.ToString();
  `;

  const { stdout } = await execFilePromise('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    psScript,
  ], {
    maxBuffer: 30 * 1024 * 1024,
    encoding: 'utf8',
  });

  const text = stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

async function executeNonQueryViaPowerShell(query) {
  const psScript = `
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=${DB_SERVER};Database=${DB_NAME};Integrated Security=True;TrustServerCertificate=True;");
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

  const { stdout } = await execFilePromise('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    psScript,
  ], {
    encoding: 'utf8',
  });
  return parseInt(stdout.trim(), 10);
}

/**
 * Yüksek Performanslı JSON Sorgu Yürütücü
 */
export async function executeJsonQuery(query) {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query(query);
      if (!result.recordset || result.recordset.length === 0) return [];

      const firstRow = result.recordset[0];
      const firstCol = Object.keys(firstRow)[0];
      if (firstCol && firstCol.startsWith('JSON_')) {
        const jsonStr = result.recordset.map(row => Object.values(row)[0]).join('');
        return JSON.parse(jsonStr || '[]');
      }
      return result.recordset;
    }
  } catch (directErr) {
    console.warn('⚠️ MSSQL pool sorgu hatası, havuz sıfırlanıp PowerShell ile deneniyor:', directErr.message);
    if (poolPromise) {
      poolPromise.then(p => p && p.close().catch(() => {})).catch(() => {});
    }
    poolPromise = null;
  }

  // Fallback
  return executeJsonQueryViaPowerShell(query);
}

/**
 * Yüksek Performanslı NonQuery Yürütücü
 */
export async function executeNonQuery(query) {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query(query);
      return result.rowsAffected.reduce((a, b) => a + b, 0);
    }
  } catch (directErr) {
    console.warn('⚠️ MSSQL pool nonQuery hatası, havuz sıfırlanıp PowerShell ile deneniyor:', directErr.message);
    if (poolPromise) {
      poolPromise.then(p => p && p.close().catch(() => {})).catch(() => {});
    }
    poolPromise = null;
  }

  // Fallback
  return executeNonQueryViaPowerShell(query);
}

export async function testConnection() {
  const res = await executeJsonQuery('SELECT 1 AS status FOR JSON PATH');
  return res && res.length > 0;
}
