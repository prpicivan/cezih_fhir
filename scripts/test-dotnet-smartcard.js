/**
 * Test: Use .NET HttpClient via PowerShell to do TLS client cert auth
 * .NET uses Windows CryptoAPI (CNG/KSP) natively for smart card certs.
 */
require('dotenv').config();
const { execSync } = require('child_process');

const THUMBPRINT = '7FD696819F71EB5B2202A84F1ABAF66C5870ECE6'; // IDEN cert
const GW_URL = 'https://certws2.cezih.hr:8443/services-router/gateway';

// Use PowerShell .NET HttpClient with cert auth
const psScript = `
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# Get the certificate from Windows cert store
$cert = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq '${THUMBPRINT}' } | Select-Object -First 1
if (!$cert) { Write-Error 'Certificate not found'; exit 1 }
Write-Host "Found cert: $($cert.Subject)"
Write-Host "HasPrivateKey: $($cert.HasPrivateKey)"

# Create HttpClientHandler with the client certificate
Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.ClientCertificates.Add($cert) | Out-Null
$handler.ServerCertificateCustomValidationCallback = [System.Net.Http.HttpClientHandler]::DangerousAcceptAnyServerCertificateValidator
$handler.AllowAutoRedirect = $false

$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [System.TimeSpan]::FromSeconds(20)

try {
    $response = $client.GetAsync('${GW_URL}').GetAwaiter().GetResult()
    Write-Host "HTTP Status: $([int]$response.StatusCode) $($response.ReasonPhrase)"
    
    # Print Set-Cookie headers
    foreach ($header in $response.Headers) {
        if ($header.Key -eq 'Set-Cookie' -or $header.Key -eq 'Location') {
            foreach ($value in $header.Value) {
                Write-Host "$($header.Key): $($value.Substring(0, [Math]::Min(100, $value.Length)))"
            }
        }
    }
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Write-Host "Body length: $($body.Length)"
} catch {
    Write-Error "Request failed: $_"
} finally {
    $client.Dispose()
}
`;

console.log('Testing .NET HttpClient with smart card cert...');
console.log('Thumbprint:', THUMBPRINT);

try {
    const output = execSync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, {
        timeout: 30000,
        encoding: 'utf8',
    });
    console.log('Output:');
    console.log(output);
} catch (e) {
    console.log('Error:', e.stdout || e.message);
}

// Simpler approach: inline powershell with here-string
console.log('\n\nTrying inline approach...');
try {
    const out = execSync(`powershell -NoProfile -Command "& { $cert = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq '${THUMBPRINT}' }; Write-Host 'Cert found:' $($cert -ne $null); Write-Host 'Subject:' $cert.Subject; Write-Host 'HasPrivKey:' $cert.HasPrivateKey }"`, {
        timeout: 10000, encoding: 'utf8'
    });
    console.log(out);
} catch (e) {
    console.log('err:', e.stdout || e.message);
}
