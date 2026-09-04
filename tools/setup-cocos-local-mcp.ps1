[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryUrl = 'https://github.com/lightblink/cocos-creator-local-mcp.git'
$pinnedCommit = '5a326291fbbbed2c1354ccfbd55e988e2b447162'
$creatorExecutable = 'C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolsRoot = Join-Path $projectRoot '.tools'
$mcpRoot = Join-Path $toolsRoot 'cocos-creator-local-mcp'

$gitCommand = (Get-Command git.exe -ErrorAction Stop).Source
$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source

$nodeVersion = (& $nodeCommand --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
    throw "cocos-creator-local-mcp 要求 Node.js 20 或更高版本，当前为 $nodeVersion。"
}

if (-not (Test-Path -LiteralPath $mcpRoot)) {
    New-Item -ItemType Directory -Force -Path $mcpRoot | Out-Null
    & $gitCommand -C $mcpRoot init
    if ($LASTEXITCODE -ne 0) { throw '初始化 MCP 工具目录失败。' }
    & $gitCommand -C $mcpRoot remote add origin $repositoryUrl
    if ($LASTEXITCODE -ne 0) { throw '配置 MCP 上游仓库失败。' }
} elseif (-not (Test-Path -LiteralPath (Join-Path $mcpRoot '.git'))) {
    throw "$mcpRoot 已存在但不是 Git 仓库；请先人工检查，脚本不会覆盖该目录。"
} elseif (& $gitCommand -C $mcpRoot status --porcelain) {
    throw 'MCP 工具目录存在未提交修改；脚本不会覆盖本地改动。'
}

& $gitCommand -C $mcpRoot fetch --depth 1 origin $pinnedCommit
if ($LASTEXITCODE -ne 0) { throw '下载固定版本的 MCP 源码失败。' }
& $gitCommand -C $mcpRoot checkout --detach $pinnedCommit
if ($LASTEXITCODE -ne 0) { throw '切换到固定版本的 MCP 源码失败。' }

$actualCommit = (& $gitCommand -C $mcpRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $pinnedCommit) {
    throw "MCP 版本校验失败：期望 $pinnedCommit，实际 $actualCommit。"
}

Push-Location $mcpRoot
try {
    & $npmCommand ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败。' }
    & $npmCommand run build
    if ($LASTEXITCODE -ne 0) { throw 'MCP 构建失败。' }
    $checkOutput = & $npmCommand run check 2>&1
    $checkExitCode = $LASTEXITCODE
    $checkOutput | ForEach-Object { Write-Host $_ }
    if ($checkExitCode -ne 0) {
        $checkText = [string]::Join([Environment]::NewLine, @($checkOutput | ForEach-Object { $_.ToString() }))
        $isWindowsHost = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
        $knownWindowsFailures = @(
            'cocos local mini-game skeleton scaffold',
            'cocos architecture skeleton scaffold',
            'cocos creator process parsing',
            '3 failed | 4 passed'
        )
        $isKnownWindowsFailure = $isWindowsHost
        foreach ($failure in $knownWindowsFailures) {
            $isKnownWindowsFailure = $isKnownWindowsFailure -and $checkText.Contains($failure)
        }
        if (-not $isKnownWindowsFailure) {
            throw 'MCP 上游检查失败，且不属于已记录的 Windows 路径兼容问题。'
        }
        Write-Warning '上游检查出现 3 个已记录的 Windows 路径兼容失败；MCP 的脚手架生成和运行中 Creator 进程识别保持待验证。'
    }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $creatorExecutable) {
    Write-Host "已发现 Cocos Creator：$creatorExecutable"
} else {
    Write-Warning "未发现计划中的 Cocos Creator：$creatorExecutable"
}

Write-Warning '尚未配置微信开发者工具 CLI；相关模拟器、预览和真机步骤保持待验证。'
Write-Host "cocos_creator_local 已安装并构建到：$mcpRoot"
Write-Host '请重新加载 Codex 项目，使 .codex/config.toml 中的 MCP 配置生效。'
