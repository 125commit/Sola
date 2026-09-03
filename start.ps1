# 文件：start.ps1
# 模块：Sola 本地开发一键启动（检查环境 → 装依赖 → 打开浏览器）
# 依赖：Node.js 20+、npm、项目根目录的 package.json / .env.example
# 阅读顺序：Main → Assert-NodeJs → Ensure-Dependencies → Ensure-EnvFile → Resolve-DevUrl → Start-DevServer
# 配套：scripts/open-browser-when-ready.ps1（后台等就绪后打开浏览器）

$ErrorActionPreference = "Stop"
# WARN: Windows PowerShell 5.1 的 Invoke-WebRequest 默认会画进度条，短超时下几乎必失败。
$ProgressPreference = "SilentlyContinue"

# NOTE: 双击 .bat 时控制台代码页常是系统 ANSI，中文会乱码；先切 UTF-8。
try {
    chcp 65001 | Out-Null
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # 部分精简环境没有 chcp，不影响后续启动。
}

Set-Location -LiteralPath $PSScriptRoot

$PreferredPort = 3000
$MinNodeMajor = 20
$ReadyTimeoutSeconds = 120

function Write-Info([string]$Message) { Write-Host "[Sola] $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[Sola] $Message" -ForegroundColor Green }
function Write-WarnMsg([string]$Message) { Write-Host "[Sola] $Message" -ForegroundColor Yellow }
function Write-ErrMsg([string]$Message) { Write-Host "[Sola] $Message" -ForegroundColor Red }

<#
.SYNOPSIS
    刷新 PATH 并确认本机有可用的 Node.js / npm。
.DESCRIPTION
    刚装完 Node 却没重启资源管理器时，双击脚本拿不到 PATH；
    直接调 npm.cmd 可避开 PowerShell 对 npm.ps1 的执行策略拦截。
#>
function Assert-NodeJs {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$userPath;$machinePath;$env:Path"

    foreach ($dir in @(
            "$env:ProgramFiles\nodejs",
            "${env:ProgramFiles(x86)}\nodejs",
            "$env:LOCALAPPDATA\Programs\nodejs"
        )) {
        if (Test-Path -LiteralPath (Join-Path $dir "node.exe")) {
            $env:Path = "$dir;$env:Path"
            break
        }
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-ErrMsg "未检测到 Node.js。请安装 20 或更高版本后重试：https://nodejs.org/"
        exit 1
    }

    $rawVersion = (& node -v).Trim()
    if ($rawVersion -notmatch "^v(\d+)") {
        Write-ErrMsg "无法解析 Node.js 版本：$rawVersion"
        exit 1
    }

    $major = [int]$Matches[1]
    if ($major -lt $MinNodeMajor) {
        Write-ErrMsg "当前 Node.js 为 $rawVersion，Next.js 16 需要 $MinNodeMajor 及以上。"
        exit 1
    }

    $npmCmd = Join-Path (Split-Path -Parent $node.Source) "npm.cmd"
    if (-not (Test-Path -LiteralPath $npmCmd)) {
        Write-ErrMsg "找到 Node.js，但旁边没有 npm.cmd：$npmCmd"
        exit 1
    }

    Write-Ok "Node.js $rawVersion"
    return $npmCmd
}

<#
.SYNOPSIS
    在缺依赖或 lock 比已装包更新时执行 npm install。
.DESCRIPTION
    一键启动必须能在新克隆目录直接跑起来；已装好时跳过以节省时间。
#>
function Ensure-Dependencies([string]$NpmCmd) {
    $nextEntry = Join-Path $PSScriptRoot "node_modules\next\package.json"
    $lockPath = Join-Path $PSScriptRoot "package-lock.json"
    $installedLockPath = Join-Path $PSScriptRoot "node_modules\.package-lock.json"
    $needInstall = -not (Test-Path -LiteralPath $nextEntry)

    # NOTE: 不要拿 package-lock.json 和 next/package.json 比时间——npm 写 lock 更晚，会每次都重装。
    # npm 装完后会在 node_modules/.package-lock.json 留下安装树快照，根 lock 明显更新才需要重装。
    if (-not $needInstall -and (Test-Path -LiteralPath $lockPath)) {
        if (-not (Test-Path -LiteralPath $installedLockPath)) {
            $needInstall = $true
        } else {
            $lockTime = (Get-Item -LiteralPath $lockPath).LastWriteTimeUtc
            $installedTime = (Get-Item -LiteralPath $installedLockPath).LastWriteTimeUtc
            if ($lockTime -gt $installedTime.AddSeconds(2)) {
                $needInstall = $true
            }
        }
    }

    if (-not $needInstall) {
        Write-Ok "依赖已就绪"
        return
    }

    Write-Info "正在安装 npm 依赖（首次或依赖变更后需要一点时间）..."
    & $NpmCmd "install" "--no-fund" "--no-audit"
    if ($LASTEXITCODE -ne 0) {
        Write-ErrMsg "npm install 失败，退出码 $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Ok "依赖安装完成"
}

<#
.SYNOPSIS
    没有 .env.local 时从示例复制一份，并在未填 Key 时给出提示。
.DESCRIPTION
    截图识别依赖服务端环境变量；缺文件会导致识别接口静默不可用。
    绝不打印 Key 内容，避免密钥出现在终端或截图里。
#>
function Ensure-EnvFile {
    $examplePath = Join-Path $PSScriptRoot ".env.example"
    $localPath = Join-Path $PSScriptRoot ".env.local"

    if (-not (Test-Path -LiteralPath $localPath)) {
        if (-not (Test-Path -LiteralPath $examplePath)) {
            Write-WarnMsg "未找到 .env.example，跳过环境文件检查。"
            return
        }

        Copy-Item -LiteralPath $examplePath -Destination $localPath
        Write-WarnMsg "已创建 .env.local。截图识别请自行填写 DASHSCOPE_API_KEY 后重新运行本脚本。"
        return
    }

    $keyValue = $null
    foreach ($line in Get-Content -LiteralPath $localPath) {
        if ($line -match "^\s*DASHSCOPE_API_KEY\s*=\s*(.*)$") {
            $keyValue = $Matches[1].Trim().Trim([char]39).Trim([char]34)
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($keyValue)) {
        Write-WarnMsg "未配置 DASHSCOPE_API_KEY：手动记账和统计可用，截图识别不可用。"
    } else {
        Write-Ok "已检测到截图识别配置（不会显示密钥）"
    }
}

<#
.SYNOPSIS
    判断某端口上是否已经是可访问的 Sola 开发服务。
.DESCRIPTION
    Next.js 16 不允许同一项目开两份 next dev；账本存在 IndexedDB，
    必须沿用 localhost 源，不能改成 127.0.0.1 或其它端口。
#>
function Get-TallyUrl([int]$Port) {
    foreach ($hostName in @("localhost", "127.0.0.1")) {
        $url = "http://${hostName}:${Port}/"
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            # NOTE: 仍匹配旧版页面里的 Tally，避免改名后把已在跑的开发服务当成别人的网站。
            if ($response.Content -match "Sola|Tally") {
                return $url
            }
        } catch {
            $response = $_.Exception.Response
            if ($response) {
                try {
                    $stream = $response.GetResponseStream()
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                    if ($body -match "Sola|Tally") {
                        return $url
                    }
                } catch {
                    # 端口有 HTTP 服务但读不出正文时，不能当成本项目。
                }
            }
        }
    }

    return $null
}

function Test-PortListening([int]$Port) {
    foreach ($hostName in @("127.0.0.1", "::1")) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $async = $client.BeginConnect($hostName, $Port, $null, $null)
            $connected = $async.AsyncWaitHandle.WaitOne(300, $false)
            if ($connected -and $client.Connected) {
                return $true
            }
        } catch {
            # 该地址族不可用（例如没有 IPv6）时继续试下一个。
        } finally {
            $client.Close()
        }
    }

    return $false
}

<#
.SYNOPSIS
    优先复用 3000 上已有的 Sola；否则找一个空闲端口。
.DESCRIPTION
    换端口等于换浏览器源，IndexedDB 账本是空的，所以 3000 被其它程序占用时必须醒目提示。
#>
function Resolve-DevUrl {
    $existing = Get-TallyUrl -Port $PreferredPort
    if ($existing) {
        return [pscustomobject]@{
            Url          = $existing
            Port         = $PreferredPort
            AlreadyRunning = $true
        }
    }

    if (-not (Test-PortListening -Port $PreferredPort)) {
        return [pscustomobject]@{
            Url          = "http://localhost:${PreferredPort}/"
            Port         = $PreferredPort
            AlreadyRunning = $false
        }
    }

    Write-WarnMsg "端口 $PreferredPort 已被其它程序占用。"
    for ($port = $PreferredPort + 1; $port -le $PreferredPort + 10; $port++) {
        $existingOther = Get-TallyUrl -Port $port
        if ($existingOther) {
            Write-WarnMsg "在 $port 发现已在运行的 Sola。注意：不同端口的账本数据互不相通。"
            return [pscustomobject]@{
                Url          = $existingOther
                Port         = $port
                AlreadyRunning = $true
            }
        }

        if (-not (Test-PortListening -Port $port)) {
            Write-WarnMsg "改用端口 $port。这是另一个浏览器源，账本与 localhost:$PreferredPort 互不相通。"
            return [pscustomobject]@{
                Url          = "http://localhost:${port}/"
                Port         = $port
                AlreadyRunning = $false
            }
        }
    }

    Write-ErrMsg "3000-3010 均被占用，请关闭占用程序后重试。"
    exit 1
}

<#
.SYNOPSIS
    在后台等到 HTTP 可访问后再打开系统浏览器。
.DESCRIPTION
    Next 首次编译可能要几十秒；过早打开会看到连接失败页。
    独立进程等待，这样前台可以一直打印 next dev 日志，Ctrl+C 也能停掉服务。
#>
function Start-BrowserWhenReady([string]$Url) {
    $waiterPath = Join-Path $PSScriptRoot "scripts\open-browser-when-ready.ps1"

    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $waiterPath,
        "-Url", $Url,
        "-Seconds", "$ReadyTimeoutSeconds"
    ) | Out-Null
}

<#
.SYNOPSIS
    前台启动 next dev，日志留在本窗口。
.DESCRIPTION
    一键脚本要既能打开浏览器，也要能用 Ctrl+C 结束开发服务。
#>
function Start-DevServer([string]$NpmCmd, [int]$Port, [string]$Url) {
    Write-Info "正在启动开发服务器：$Url"
    Write-Info "就绪后会自动打开浏览器；本窗口不要关。按 Ctrl+C 停止服务。"
    Start-BrowserWhenReady -Url $Url

    & $NpmCmd "run" "dev" "--" "-p" "$Port"
    exit $LASTEXITCODE
}

function Main {
    Write-Host ""
    Write-Host "  Sola 智能记账 · 一键启动" -ForegroundColor Green
    Write-Host ""

    $npmCmd = Assert-NodeJs
    Ensure-Dependencies -NpmCmd $npmCmd
    Ensure-EnvFile

    $target = Resolve-DevUrl
    if ($target.AlreadyRunning) {
        Write-Ok "检测到 Sola 已在运行，正在打开 $($target.Url)"
        Start-Process $target.Url
        Start-Sleep -Seconds 2
        exit 0
    }

    Start-DevServer -NpmCmd $npmCmd -Port $target.Port -Url $target.Url
}

Main
