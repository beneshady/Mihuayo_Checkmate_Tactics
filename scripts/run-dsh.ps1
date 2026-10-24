#requires -Version 7.0
<#
.SYNOPSIS
运行一次 DSH，结束后通知指定 Codex 会话；不使用定时巡检。
.EXAMPLE
pwsh -File scripts/run-dsh.ps1 -TaskDoc docs/us/US-020-main-camp.md -CodexThreadId <UUID> -Instructions '按已确认范围实施并逐项验收' -Background
.EXAMPLE
pwsh -File scripts/run-dsh.ps1 -RetryNotify <运行编号>
.NOTES
记录：tmp/dsh-runs/<运行编号>/。退出码：0=执行及通知成功，1=DSH失败但已通知，2=待通知/通知失败，3=启动被拒绝。
通知成功仅表示桌面接收，不代表审阅完成或验收通过。忙碌时每30秒通过桌面MCP查询，最多等6小时；不调用模型，不使用CLI续接。
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$TaskDoc,
    [Parameter(Mandatory, ParameterSetName = 'Run')][guid]$CodexThreadId,
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$Instructions,
    [Parameter(Mandatory, ParameterSetName = 'Retry')][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$RetryNotify,
    [switch]$Background,
    [ValidateRange(0, 86400)][int]$NotifyWaitSeconds = 21600,
    [ValidateRange(1, 300)][int]$NotifyPollSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runsRoot = Join-Path $projectRoot 'tmp/dsh-runs'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
[Console]::InputEncoding = $utf8
[System.IO.Directory]::CreateDirectory($runsRoot) | Out-Null

if ($Background) {
    # 采用编码命令和单引号字面量，避免任务文字被二次解释为 PowerShell。
    function Quote-Literal([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
    $invokeText = '& ' + (Quote-Literal $PSCommandPath)
    if ($PSCmdlet.ParameterSetName -eq 'Retry') { $invokeText += ' -RetryNotify ' + (Quote-Literal $RetryNotify) }
    else { $invokeText += ' -TaskDoc ' + (Quote-Literal $TaskDoc) + ' -CodexThreadId ' + (Quote-Literal $CodexThreadId.ToString()) + ' -Instructions ' + (Quote-Literal $Instructions) }
    $invokeText += ' -NotifyWaitSeconds ' + $NotifyWaitSeconds + ' -NotifyPollSeconds ' + $NotifyPollSeconds
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($invokeText))
    $launcherId = 'launcher-' + [guid]::NewGuid().ToString('N')
    $outPath = Join-Path $runsRoot "$launcherId.stdout.log"
    $errPath = Join-Path $runsRoot "$launcherId.stderr.log"
    $launcher = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', $encoded) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
    Write-Host "后台包装进程已启动：PID=$($launcher.Id)，启动日志：$outPath；实际 DSH 启动及运行编号以日志为准。请结束派发方当前轮次，让回调目标空闲。"
    exit 0
}

function Save-Record {
    param($Record, [string]$Path)
    $Record.updatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $tempPath = "$Path.$PID.tmp"
    [System.IO.File]::WriteAllText($tempPath, ($Record | ConvertTo-Json -Depth 8), $utf8)
    [System.IO.File]::Move($tempPath, $Path, $true)
}

function Open-Lock {
    param([string]$Path)
    try { return [System.IO.File]::Open($Path, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw "已有任务持有锁：$Path。请等待原任务退出，不要重复派发。" }
}

function Get-Executable {
    param([string]$Name)
    return (Get-Command $Name -CommandType Application, ExternalScript -ErrorAction Stop | Select-Object -First 1).Source
}

function New-Child {
    param([string]$Executable, [string[]]$Arguments, [bool]$IsDsh = $false)
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.WorkingDirectory = $projectRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    $info.StandardInputEncoding = $utf8
    if ([System.IO.Path]::GetExtension($Executable) -eq '.ps1') {
        $info.FileName = (Get-Process -Id $PID).Path
        foreach ($arg in @('-NoProfile', '-File', $Executable)) { $info.ArgumentList.Add($arg) }
    } else { $info.FileName = $Executable }
    foreach ($arg in $Arguments) { $info.ArgumentList.Add($arg) }
    if ($IsDsh) { $info.Environment['DSH_PERMISSION_MODE'] = 'danger-full-access' }
    return [System.Diagnostics.Process]::new() | ForEach-Object { $_.StartInfo = $info; $_ }
}

function Wait-Child {
    param([System.Diagnostics.Process]$Process, [string]$Directory, [string]$Prefix, [string]$InputText = '')
    $stdout = [System.IO.File]::Create((Join-Path $Directory "$Prefix.stdout.log"))
    $stderr = [System.IO.File]::Create((Join-Path $Directory "$Prefix.stderr.log"))
    try {
        $outTask = $Process.StandardOutput.BaseStream.CopyToAsync($stdout)
        $errTask = $Process.StandardError.BaseStream.CopyToAsync($stderr)
        if ($InputText) { $Process.StandardInput.Write($InputText) }
        $Process.StandardInput.Close()
        $Process.WaitForExit()
        $null = $outTask.GetAwaiter().GetResult()
        $null = $errTask.GetAwaiter().GetResult()
        return $Process.ExitCode
    } finally { $stdout.Dispose(); $stderr.Dispose() }
}

function Assert-PreviousDshStopped {
    $pointer = Join-Path $runsRoot 'active.json'
    if (!(Test-Path -LiteralPath $pointer)) { return }
    $old = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
    $oldRecordPath = Join-Path $runsRoot "$($old.runId)/run.json"
    if (!(Test-Path -LiteralPath $oldRecordPath)) { throw '上次运行记录缺失，请先核对原进程。' }
    $oldRecord = Get-Content -LiteralPath $oldRecordPath -Raw | ConvertFrom-Json
    if ($oldRecord.dshState -in @('launching', 'running')) {
        throw "上次 DSH 未记录退出：$($old.runId)，PID=$($oldRecord.dshPid)，启动时间=$($oldRecord.dshStartedAt)。请先核对实际进程并修复记录，不能直接重派。"
    }
}

$projectLock = $null
$notifyLock = $null
$child = $null
$record = $null
$recordPath = $null
try {
    if ($PSCmdlet.ParameterSetName -eq 'Run') {
        $docPath = [System.IO.Path]::GetFullPath($(if ([System.IO.Path]::IsPathRooted($TaskDoc)) { $TaskDoc } else { Join-Path $projectRoot $TaskDoc }))
        if (!$docPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $docPath -PathType Leaf)) {
            throw '任务文档必须是本项目内存在的文件。'
        }
        if ([string]::IsNullOrWhiteSpace($Instructions)) { throw '执行要求不能为空。' }
        $dshExecutable = Get-Executable 'dsh'
        $null = Get-Executable 'node'
        if (!$env:CODEX_THREAD_ID -or !$env:CODEX_APP_TOOLS_PIPE_PATH) { throw '缺少 Codex 桌面环境；请从 Codex 会话终端派发，勿从独立终端启动。' }
        $projectLock = Open-Lock (Join-Path $runsRoot 'project.lock')
        Assert-PreviousDshStopped
        $runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
        $runDir = Join-Path $runsRoot $runId
        [System.IO.Directory]::CreateDirectory($runDir) | Out-Null
        $recordPath = Join-Path $runDir 'run.json'
        $record = [ordered]@{
            callerThreadId = $env:CODEX_THREAD_ID; notifyTransport = 'desktop-mcp'
            runId = $runId; taskDoc = $docPath; projectRoot = $projectRoot; codexThreadId = $CodexThreadId.ToString()
            createdAt = [DateTimeOffset]::UtcNow.ToString('o'); updatedAt = ''; instructions = $Instructions
            dshPermissionMode = 'danger-full-access'; dshState = 'launching'; dshPid = $null; dshStartedAt = $null; dshExitCode = $null
            notifyState = 'pending'; notifyAttempt = 0; codexExitCode = $null; error = $null
        }
        Save-Record $record $recordPath
        [System.IO.File]::WriteAllText((Join-Path $runsRoot 'active.json'), (@{runId = $runId} | ConvertTo-Json), $utf8)
        $taskText = @"
读取项目 AGENTS.md 和任务文档：$docPath
本次运行编号：$runId。工作目录：$projectRoot。
执行要求：$Instructions
先核对当前分支、HEAD 与全部已有改动，保留他人工作；只实施本次已授权范围。按需求文档逐项验收（包括所需的实际浏览器操作），失败自行修复复验，证据对应最终版本；未验证或受阻如实记录。将交付摘要、主要变化、逐项验收结果、证据位置和遗留问题写回任务文档，最终回复给出简短摘要及文档位置，然后结束。不要自行调用 Codex 或创建巡检；外层脚本负责通知。未经本次明确授权，不提交、推送、合并或发布。
"@
        $child = New-Child $dshExecutable @('--profile', 'headless', $taskText) $true
        try {
            $null = $child.Start()
            $record.dshState = 'running'; $record.dshPid = $child.Id; $record.dshStartedAt = $child.StartTime.ToUniversalTime().ToString('o')
            Save-Record $record $recordPath
            Write-Host "DSH 已启动：$runId，PID=$($child.Id)。等待退出，无模型轮询。"
            $record.dshExitCode = Wait-Child $child $runDir 'dsh'
            $record.dshState = 'exited'
        } catch {
            $record.error = $_.Exception.Message
            if (!$child.StartInfo -or $record.dshPid -eq $null) { $record.dshState = 'start-failed' }
            elseif (!$child.HasExited) { throw }
            else { $record.dshState = 'exited'; $record.dshExitCode = $child.ExitCode }
        }
        Save-Record $record $recordPath
        $child.Dispose(); $child = $null
        $projectLock.Dispose(); $projectLock = $null
    } else {
        $runId = $RetryNotify
        $runDir = Join-Path $runsRoot $runId
        $recordPath = Join-Path $runDir 'run.json'
        $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json -AsHashtable
        if ($record.projectRoot -ne $projectRoot) { throw '记录不属于当前项目。' }
    }

    $notifyLock = Open-Lock (Join-Path $runDir 'notify.lock')
    # 持久化后重新读取，避免并发重试重复发送。
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json -AsHashtable
    if ($record.notifyState -eq 'delivered') { Write-Host "本次已通知，不重复发送：$runId"; exit 0 }
    if ($record.notifyState -in @('notifying', 'sending', 'uncertain')) {
        throw "上次通知是否已被接收尚不明确：$runId。先检查 desktop.* 回执、notify-* 日志及目标会话，不自动重复发送。"
    }
    if ($record.dshState -notin @('exited', 'start-failed')) { throw 'DSH 尚未确认退出，不能通知完成。' }
    # 状态查询和发送走桌面现有连接；不争用桌面线程的 writer 锁。
    $node = Get-Executable 'node'
    $helper = Join-Path $PSScriptRoot 'codex-desktop-notify.mjs'
    $child = New-Child $node @($helper, '--record', $recordPath, '--wait-seconds', $NotifyWaitSeconds.ToString(), '--poll-seconds', $NotifyPollSeconds.ToString())
    $null = $child.Start()
    $notifyExitCode = Wait-Child $child $runDir ('notify-' + [guid]::NewGuid().ToString('N'))
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json -AsHashtable
    if ($notifyExitCode -ne 0 -or $record.notifyState -ne 'delivered') {
        if (!$record.error) { $record.error = '桌面通知未完成，查看 notify-*.stderr.log 后仅重试通知。'; Save-Record $record $recordPath }
        Write-Warning "$($record.error) 运行记录：$recordPath"
        exit 2
    }
    Write-Host "桌面已接收本次回调：$runId；交付审阅由接收会话执行。"
    if ($record.dshExitCode -ne 0 -or $record.dshState -eq 'start-failed') { exit 1 }
    exit 0
} catch {
    if ($record -and $recordPath) {
        $record.error = $_.Exception.Message
        if ($record.notifyState -eq 'notifying') { $record.notifyState = 'uncertain' }
        Save-Record $record $recordPath
    }
    Write-Error $_ -ErrorAction Continue
    exit 3
} finally {
    if ($child) { $child.Dispose() }
    if ($projectLock) { $projectLock.Dispose() }
    if ($notifyLock) { $notifyLock.Dispose() }
}
