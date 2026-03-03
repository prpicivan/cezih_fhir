# Smart Card Interactive TLS Authentication Script
# Uses .NET HttpClient WITHOUT pre-selecting a certificate.
# Windows will show the native cert selection dialog and PIN entry dialog.
# Returns JSON to stdout.

param(
    [string]$GatewayUrl = "https://certws2.cezih.hr:8443/services-router/gateway"
)

$ErrorActionPreference = 'Stop'

try {
    [Console]::Error.WriteLine("[SmartCard/Interactive] Starting interactive TLS auth...")
    [Console]::Error.WriteLine("[SmartCard/Interactive] Gateway: $GatewayUrl")
    [Console]::Error.WriteLine("[SmartCard/Interactive] Windows will show cert selection and PIN dialogs.")

    Add-Type -AssemblyName System.Net.Http

    $handler = New-Object System.Net.Http.HttpClientHandler
    
    # Let Windows handle certificate selection - this triggers the native OS dialog
    $handler.ClientCertificateOptions = [System.Net.Http.ClientCertificateOption]::Automatic
    $handler.ServerCertificateCustomValidationCallback = [System.Net.Http.HttpClientHandler]::DangerousAcceptAnyServerCertificateValidator
    $handler.AllowAutoRedirect = $false

    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [System.TimeSpan]::FromMinutes(5)

    [Console]::Error.WriteLine("[SmartCard/Interactive] Sending TLS request, cert dialog should appear now...")
    
    $response = $client.GetAsync($GatewayUrl).GetAwaiter().GetResult()
    $statusCode = [int]$response.StatusCode

    [Console]::Error.WriteLine("[SmartCard/Interactive] Response status: $statusCode")

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
    }
    catch {}

    $location = ""
    try {
        $location = $response.Headers.Location.ToString()
    }
    catch {}

    $result = @{
        success     = ($statusCode -ge 200 -and $statusCode -lt 500) -or ($cookies.Count -gt 0)
        statusCode  = $statusCode
        cookies     = $cookies
        location    = $location
        cookieCount = $cookies.Count
    }

    if ($statusCode -eq 401) {
        $result.success = $false
        $result.error = "Gateway rejected certificate (401)"
    }
    elseif ($cookies.Count -eq 0 -and $statusCode -ne 302 -and $statusCode -ne 200) {
        $result.success = $false
        $result.error = "No cookies received, status: $statusCode"
    }

    [Console]::Error.WriteLine("[SmartCard/Interactive] Success: $($result.success), Cookies: $($cookies.Count)")
    
    Write-Output ($result | ConvertTo-Json -Compress)
    $client.Dispose()

}
catch {
    $errMsg = $_.Exception.Message
    [Console]::Error.WriteLine("[SmartCard/Interactive] Error: $errMsg")
    $safeErr = $errMsg -replace '"', '\"'
    Write-Output "{""success"":false,""error"":""$safeErr""}"
}
