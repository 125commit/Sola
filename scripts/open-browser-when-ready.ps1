# 由 start.ps1 在后台拉起：等开发服务器能访问后再打开浏览器。
# 独立进程是为了让前台窗口继续打印 next dev 日志。
param(
    [Parameter(Mandatory = $true)]
    [string]$Url,

    [int]$Seconds = 120
)

# WARN: 关掉进度条，否则短超时的 Invoke-WebRequest 在 Windows PowerShell 5.1 上会卡住。
$ProgressPreference = "SilentlyContinue"

for ($i = 0; $i -lt $Seconds; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -ge 200) {
            Start-Process $Url
            exit 0
        }
    } catch {
        # HTTP 4xx/5xx 也说明端口已在听，编译中的 Next 可以打开。
        if ($_.Exception.Response) {
            Start-Process $Url
            exit 0
        }
    }
    Start-Sleep -Seconds 1
}
