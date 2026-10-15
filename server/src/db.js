import { execFile } from 'child_process';
import util from 'util';
import dotenv from 'dotenv';
dotenv.config();

const execFilePromise = util.promisify(execFile);

const DB_SERVER = process.env.DB_SERVER || 'localhost';
const DB_NAME = process.env.DB_NAME || 'OSMANLIGIDA';

/**
 * Windows Native Shared Memory / Integrated Security SQL Runner
 * MSSQL TCP/IP veya port yapılandırmasından bağımsız olarak doğrudan ve en yüksek hızda çalışır.
 */
export async function executeJsonQuery(query) {
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

  try {
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
  } catch (err) {
    console.error('SQL JSON Query Error:', err.message);
    throw err;
  }
}

export async function executeNonQuery(query) {
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

  try {
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
  } catch (err) {
    console.error('SQL NonQuery Error:', err.message);
    throw err;
  }
}

export async function testConnection() {
  const res = await executeJsonQuery('SELECT 1 AS status FOR JSON PATH');
  return res && res.length > 0;
}
