#Requires -Version 5.1
<#
    BusinessOps — one-click start for Windows.

    Installs Docker Desktop if it is missing, waits for the engine, then brings the
    stack up and opens the app in your browser.

      start.bat            install if needed, then start
      stop.bat             stop the containers, keep the data
      start.bat -Reset     wipe the database and re-run the demo seed
      start.bat -Logs      follow the container logs after starting

    Only the install step needs Administrator; the script asks for it only then.
#>
[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$Reset,
    [switch]$Logs
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot   # double-clicking can start us elsewhere

# ---- this project -----------------------------------------------------------------
$AppName      = 'BusinessOps'
$DefaultPorts = @{ FRONTEND_PORT = '5174'; BACKEND_PORT = '8002'; DB_PORT = '3308' }
$SignIn       = 'rakib@businessops.dev  (owner)   shopna@businessops.dev  (staff)'

# ---- output -----------------------------------------------------------------------
function Write-Step($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Write-Note($m) { Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Warn2($m){ Write-Host "    $m" -ForegroundColor Yellow }
function Fail($m) {
    Write-Host ''
    Write-Host "  $m" -ForegroundColor Red
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}

# ---- helpers ----------------------------------------------------------------------
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Command($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# Reads .env when it exists, otherwise falls back to the values compose already
# defaults to — so the stack runs whether or not anyone copied .env.example.
function Get-Ports {
    $ports = $DefaultPorts.Clone()
    if (Test-Path '.env') {
        foreach ($line in Get-Content '.env') {
            $t = $line.Trim()
            if ($t -eq '' -or $t.StartsWith('#')) { continue }
            $i = $t.IndexOf('=')
            if ($i -lt 1) { continue }
            $k = $t.Substring(0, $i).Trim()
            $v = $t.Substring($i + 1).Trim()
            if ($ports.ContainsKey($k) -and $v -ne '') { $ports[$k] = $v }
        }
    }
    $ports
}

function Test-PortFree($port) {
    try {
        $used = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue
        return ($null -eq $used)
    } catch {
        return $true   # cmdlet missing on older builds; let compose report it instead
    }
}

# `docker info` succeeding is the only trustworthy sign the engine is up. Docker
# Desktop's window appears long before the daemon accepts connections.
function Wait-DockerEngine($minutes = 4) {
    $deadline = (Get-Date).AddMinutes($minutes)
    $spin = '|/-\'; $i = 0
    while ((Get-Date) -lt $deadline) {
        & docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "`r    engine ready            " -ForegroundColor Green; return $true }
        Write-Host ("`r    waiting for the Docker engine {0}" -f $spin[$i % 4]) -NoNewline
        $i++
        Start-Sleep -Seconds 3
    }
    Write-Host ''
    return $false
}

function Start-DockerDesktop {
    $exe = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $exe) { return $false }
    if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
        Write-Note 'starting Docker Desktop...'
        Start-Process -FilePath $exe | Out-Null
    }
    return $true
}

function Install-Docker {
    if (-not (Test-Admin)) {
        Write-Step 'Docker Desktop is not installed — asking for Administrator'
        Write-Note 'Windows will show a User Account Control prompt. Choose Yes.'
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
        if ($Reset) { $argList += '-Reset' }
        if ($Logs)  { $argList += '-Logs' }
        try {
            Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList | Out-Null
        } catch {
            Fail 'Administrator access was refused, so Docker Desktop cannot be installed. Install it manually from https://www.docker.com/products/docker-desktop/ and run this script again.'
        }
        exit 0   # the elevated copy takes over from here
    }

    Write-Step 'Installing Docker Desktop'
    $installed = $false

    if (Test-Command 'winget') {
        Write-Note 'via winget (this takes a few minutes)...'
        & winget install --id Docker.DockerDesktop --exact --silent `
            --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) { $installed = $true }
        else { Write-Warn2 "winget exited with $LASTEXITCODE — falling back to the direct download" }
    }

    if (-not $installed) {
        $url = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
        $exe = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
        Write-Note 'downloading the installer (~700 MB)...'
        try {
            $ProgressPreference = 'SilentlyContinue'   # the progress bar makes this crawl
            Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
        } catch {
            Fail "The installer could not be downloaded ($($_.Exception.Message)). Get it from https://www.docker.com/products/docker-desktop/ and run this script again."
        }
        Write-Note 'running the installer...'
        $p = Start-Process -FilePath $exe -ArgumentList 'install', '--quiet', '--accept-license' -Wait -PassThru
        if ($p.ExitCode -ne 0) { Fail "The Docker Desktop installer exited with code $($p.ExitCode)." }
        Remove-Item $exe -ErrorAction SilentlyContinue
    }

    Write-Ok 'Docker Desktop installed'
    # WSL2 and Hyper-V features are switched on by the installer, and those need a
    # restart before the engine will run. Saying so is better than a cryptic failure.
    Write-Host ''
    Write-Warn2 'Windows must be restarted before Docker can start for the first time.'
    Write-Warn2 'Restart, then run start.bat again — it will skip straight to launching the app.'
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 0
}

# ---- compose ----------------------------------------------------------------------
$script:ComposeCmd = $null
function Get-Compose {
    if ($script:ComposeCmd) { return $script:ComposeCmd }
    & docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $script:ComposeCmd = @('docker', 'compose') }
    elseif (Test-Command 'docker-compose') { $script:ComposeCmd = @('docker-compose') }
    else { Fail 'Docker is installed but Docker Compose is not available. Update Docker Desktop to a current version.' }
    $script:ComposeCmd
}

function Invoke-Compose {
    param([string[]]$Arguments)
    $c = Get-Compose
    & $c[0] @($c[1..($c.Length - 1)] + $Arguments)
}

# ===================================================================================
Write-Host ''
Write-Host "  $AppName" -ForegroundColor White
Write-Host '  ---------------------------------------------' -ForegroundColor DarkGray

if (-not (Test-Path 'docker-compose.yml')) {
    Fail "docker-compose.yml is not in $PSScriptRoot. Keep this script inside the project folder."
}

$ports = Get-Ports
$appUrl = "http://localhost:$($ports.FRONTEND_PORT)"

# ---- stop -------------------------------------------------------------------------
if ($Stop) {
    Write-Step 'Stopping'
    if (-not (Test-Command 'docker')) { Fail 'Docker is not installed, so there is nothing to stop.' }
    Invoke-Compose @('down')
    Write-Ok 'Stopped. Your data is kept — start.bat brings it back.'
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 0
}

# ---- Windows version --------------------------------------------------------------
$build = [System.Environment]::OSVersion.Version.Build
if ($build -lt 19044) {
    Write-Warn2 "Windows build $build is below 19044, which Docker Desktop requires."
    Write-Warn2 'Update Windows first, or this will not work.'
}

# ---- docker present? --------------------------------------------------------------
Write-Step 'Checking Docker'
if (-not (Test-Command 'docker')) {
    if (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe") {
        # Installed, but this shell has a stale PATH — common right after installing.
        $env:Path = "$env:Path;$env:ProgramFiles\Docker\Docker\resources\bin"
    }
}
if (-not (Test-Command 'docker')) {
    Install-Docker          # exits either way
}
Write-Ok 'Docker CLI found'

# ---- engine running? --------------------------------------------------------------
& docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    if (-not (Start-DockerDesktop)) {
        Fail 'The Docker CLI is present but Docker Desktop was not found. Open Docker Desktop manually, wait for it to say "Engine running", then run this script again.'
    }
    if (-not (Wait-DockerEngine)) {
        Fail 'Docker Desktop did not become ready in time. Open it, wait for "Engine running" in the bottom-left, then run this script again.'
    }
} else {
    Write-Ok 'engine running'
}

# ---- ports ------------------------------------------------------------------------
$busy = @()
foreach ($k in $ports.Keys) { if (-not (Test-PortFree $ports[$k])) { $busy += "$($ports[$k]) ($k)" } }
if ($busy.Count -gt 0) {
    Write-Warn2 "These ports are already in use: $($busy -join ', ')"
    Write-Warn2 'If this stack is already running that is fine. Otherwise edit .env and pick free ports.'
}

# ---- up ---------------------------------------------------------------------------
if ($Reset) {
    Write-Step 'Resetting the database'
    Invoke-Compose @('down', '-v')
    Write-Ok 'volume dropped — the demo data will be re-seeded'
}

Write-Step 'Starting the containers'
Write-Note 'the first run pulls MySQL and installs dependencies, so give it a few minutes'
Invoke-Compose @('up', '--build', '-d')
if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed. Scroll up for the reason.' }

# ---- wait for the app ------------------------------------------------------------
Write-Step 'Waiting for the app'
$ready = $false
$deadline = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 4
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        # Refused while the containers are still coming up, which is expected. Keep the
        # reason so the timeout message below can say what actually went wrong.
        $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 3
}

Write-Host ''
if ($ready) {
    Write-Ok "$AppName is running"
    Start-Process $appUrl
} else {
    Write-Warn2 "The app did not answer on $appUrl yet."
    if ($lastError) { Write-Note "last error: $lastError" }
    Write-Warn2 'It may still be starting. Try the address in a browser, or run: docker compose logs -f'
}

Write-Host ''
Write-Host "  App        $appUrl" -ForegroundColor White
Write-Host "  API        http://localhost:$($ports.BACKEND_PORT)" -ForegroundColor DarkGray
Write-Host "  Sign in    $SignIn" -ForegroundColor White
Write-Host "  Password   password123" -ForegroundColor White
Write-Host ''
Write-Host '  stop.bat         stop, keep the data' -ForegroundColor DarkGray
Write-Host '  start.bat -Reset restore the demo data' -ForegroundColor DarkGray
Write-Host ''

if ($Logs) {
    Write-Note 'following logs — Ctrl+C stops watching, the app keeps running'
    Invoke-Compose @('logs', '-f')
} else {
    Read-Host '  Press Enter to close (the app keeps running)'
}
