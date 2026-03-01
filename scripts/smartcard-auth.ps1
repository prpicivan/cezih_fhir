# Smart Card TLS Authentication Script
# Uses .NET HttpClient with Windows cert store (KSP) for hardware-backed TLS client cert auth.
# Returns JSON to stdout.

param(
    [string]$Thumbprint,
    [string]$GatewayUrl = "https://certws2.cezih.hr:8443/services-router/gateway"
)

$ErrorActionPreference = 'Stop'

try {
    # Find certificate in Windows cert store
    $cert = $null
    if ($Thumbprint) {
        $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $Thumbprint } | Select-Object -First 1
    }
    if (-not $cert) {
        # Auto-detect: prefer IdentificationTest cert
        $cert = Get-ChildItem Cert:\CurrentUser\My | 
            Where-Object { $_.HasPrivateKey -and ($_.Subject -like "*IdentificationTest*") } | 
            Select-Object -First 1
    }
    if (-not $cert) {
        # Fallback: any cert with private key
        $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
    }
    if (-not $cert) {
        Write-Output '{"success":false,"error":"No certificate with private key found in Windows cert store"}'
        exit 1
    }

    [Console]::Error.WriteLine("Using cert: $($cert.Subject) [$($cert.Thumbprint)]")

    Add-Type -AssemblyName System.Net.Http

    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.ClientCertificates.Add($cert) | Out-Null
    $handler.ServerCertificateCustomValidationCallback = [System.Net.Http.HttpClientHandler]::DangerousAcceptAnyServerCertificateValidator
    $handler.AllowAutoRedirect = $false

    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [System.TimeSpan]::FromSeconds(20)

    $response = $client.GetAsync($GatewayUrl).GetAwaiter().GetResult()
    $statusCode = [int]$response.StatusCode

    # Collect cookies
    $cookies = @()
    foreach ($header in $response.Headers) {
        if ($header.Key -eq 'Set-Cookie') {
            foreach ($val in $header.Value) {
                $cookiePart = ($val -split ';')[0].Trim()
                if ($cookiePart) { $cookies += $cookiePart }
            }
        }
    }
    # Also check content headers
    try {
        foreach ($header in $response.Content.Headers) {
            if ($header.Key -eq 'Set-Cookie') {
                foreach ($val in $header.Value) {
                    $cookiePart = ($val -split ';')[0].Trim()
                    if ($cookiePart) { $cookies += $cookiePart }
                }
            }
        }
    } catch {}

    $location = ""
    try {
        $location = $response.Headers.Location.ToString()
    } catch {}

    $result = @{
        success = ($statusCode -ge 200 -and $statusCode -lt 500) -or ($cookies.Count -gt 0)
        statusCode = $statusCode
        cookies = $cookies
        location = $location
        certSubject = $cert.Subject
        certThumbprint = $cert.Thumbprint
    }

    if ($statusCode -eq 401) {
        $result.success = $false
        $result.error = "Gateway rejected certificate (401)"
    } elseif ($cookies.Count -eq 0 -and $statusCode -ne 302 -and $statusCode -ne 200) {
        $result.success = $false
        $result.error = "No cookies received, status: $statusCode"
    }

    Write-Output ($result | ConvertTo-Json -Compress)
    $client.Dispose()

} catch {
    $err = $_.Exception.Message
    Write-Output "{`"success`":false,`"error`":`"$($err -replace '`"','\"')`"}"
}
