import { execFile } from 'child_process';
import util from 'util';

const execFilePromise = util.promisify(execFile);

export async function runSharedMemoryQuery(query) {
  // SQL Server FOR JSON PATH ile doğrudan saf JSON alıyoruz
  const psScript = `
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Database=OSMANLIGIDA;Integrated Security=True;TrustServerCertificate=True;");
    $conn.Open();
    $cmd = $conn.CreateCommand();
    $cmd.CommandTimeout = 60;
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
    psScript
  ], { 
    maxBuffer: 25 * 1024 * 1024,
    encoding: 'utf8'
  });

  const text = stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

async function test() {
  console.time('query');
  const res = await runSharedMemoryQuery('SELECT TOP 3 KOD, AD FROM STOK WHERE AKTIF = 1 FOR JSON PATH');
  console.timeEnd('query');
  console.log('Result:', res);
}

test();
