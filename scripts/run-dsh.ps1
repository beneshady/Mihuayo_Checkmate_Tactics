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
通知成功不代表功能验收通过。等待进程退出不调用模型。目标忙碌时不自动轮询。
优先使用 CODEX_CLI_PATH（桌面选择的版本），否则查 PATH。2026-10-21 实测：PATH 0.144.6 不支持分页历史，桌面 0.163.0-alpha.10.2 被现有桌面会话 active writer 锁拒绝；该会话尚未打通自动回调，不要解除锁或改写历史绕过。
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$TaskDoc,
    [Parameter(Mandatory, ParameterSetName = 'Run')][guid]$CodexThreadId,
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$Instructions,
    [Parameter(Mandatory, ParameterSetName = 'Retry')][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$RetryNotify,
    [switch]$Background
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runsRoot = Join-Path $projectRoot 'tmp/dsh-runs'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.Directory]::CreateDirectory($runsRoot) | Out-Null

if ($Background) {
    # 采用编码命令和单引号字面量，避免任务文字被二次解释为 PowerShell。
    function Quote-Literal([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
    $invokeText = '& ' + (Quote-Literal $PSCommandPath)
    if ($PSCmdlet.ParameterSetName -eq 'Retry') { $invokeText += ' -RetryNotify ' + (Quote-Literal $RetryNotify) }
    else { $invokeText += ' -TaskDoc ' + (Quote-Literal $TaskDoc) + ' -CodexThreadId ' + (Quote-Literal $CodexThreadId.ToString()) + ' -Instructions ' + (Quote-Literal $Instructions) }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($invokeText))
    $launcherId = 'launcher-' + [guid]::NewGuid().ToString('N')
    $outPath = Join-Path $runsRoot "$launcherId.stdout.log"
    $errPath = Join-Path $runsRoot "$launcherId.stderr.log"
    $launcher = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
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
    if ($Name -eq 'codex' -and $env:CODEX_CLI_PATH) {
        if (!(Test-Path -LiteralPath $env:CODEX_CLI_PATH -PathType Leaf)) { throw 'CODEX_CLI_PATH 指向的命令不存在，请修正后重试。' }
        return $env:CODEX_CLI_PATH
    }
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

function Get-ThreadAvailability {
    param([string]$ThreadId)
    # CLI 没有桌面会话忙碌查询命令。仅在本地持久化记录明确收尾时续接；未知状态拒绝发送。
    $codexData = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $sessionRoot = Join-Path $codexData 'sessions'
    $matches = @(Get-ChildItem -LiteralPath $sessionRoot -Recurse -Filter "*$ThreadId*.jsonl" -File -ErrorAction SilentlyContinue)
    if ($matches.Count -ne 1) { return 'unknown' }
    $reader = [System.IO.StreamReader]::new([System.IO.File]::Open($matches[0].FullName, 'Open', 'Read', 'ReadWrite'))
    $state = 'unknown'
    try {
        while (($line = $reader.ReadLine()) -ne $null) {
            if ($line -notmatch '"(session_meta|task_started|task_complete|turn_aborted)"') { continue }
            try { $event = $line | ConvertFrom-Json } catch { $state = 'unknown'; continue }
            if ($event.type -eq 'session_meta') {
                if ([System.IO.Path]::GetFullPath($event.payload.cwd).TrimEnd('\', '/') -ne $projectRoot.TrimEnd('\', '/')) { return 'wrong-project' }
            }
            if ($event.type -eq 'event_msg') {
                switch ($event.payload.type) {
                    'task_started' { $state = 'busy' }
                    'task_complete' { $state = 'idle' }
                    'turn_aborted' { $state = 'idle' }
                }
            }
        }
    } finally { $reader.Dispose() }
    return $state
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
        $null = Get-Executable 'codex'
        $projectLock = Open-Lock (Join-Path $runsRoot 'project.lock')
        Assert-PreviousDshStopped
        $runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
        $runDir = Join-Path $runsRoot $runId
        [System.IO.Directory]::CreateDirectory($runDir) | Out-Null
        $recordPath = Join-Path $runDir 'run.json'
        $record = [ordered]@{
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
    if ($record.notifyState -in @('notifying', 'uncertain')) {
        throw "上次通知是否已被接收尚不明确：$runId。先检查 codex.* 日志及目标会话，不自动重复发送。"
    }
    if ($record.dshState -notin @('exited', 'start-failed')) { throw 'DSH 尚未确认退出，不能通知完成。' }
    # 不与本项目其他开发任务或同会话回调并发。
    $projectLock = Open-Lock (Join-Path $runsRoot 'project.lock')
    Assert-PreviousDshStopped
    $threadLock = Open-Lock (Join-Path $runsRoot "thread-$($record.codexThreadId).lock")
    try {
        $availability = Get-ThreadAvailability $record.codexThreadId
        if ($availability -ne 'idle') {
            $record.notifyState = 'pending'; $record.error = "目标会话状态：$availability，保留待通知。"
            Save-Record $record $recordPath
            Write-Warning "$($record.error) 稍后执行：pwsh -File scripts/run-dsh.ps1 -RetryNotify $runId"
            exit 2
        }
        $callback = @"
[DSH 完成回调 $runId]
用户已授权本任务交付后的结果审阅。本次 DSH 状态：$($record.dshState)，退出码：$($record.dshExitCode)。进程结束不等于验收通过。
需求文档：$($record.taskDoc)
运行记录：$recordPath
请先读取该运行记录、同目录 dsh.stdout.log / dsh.stderr.log 中必要的交付摘要及需求文档最新验收记录。仅审阅本次范围内的结果、证据覆盖和未验证项，不默认重跑测试或亲自浏览器验收。发现遗漏或缺陷按已授权范围经 scripts/run-dsh.ps1 串行退修/补验；真实外部阻塞向用户说明。不要创建或恢复定时巡检，不提交或推送。简短汇报结论，并包含本次运行编号以便核对通知。
"@
        $record.notifyAttempt++; $prefix = "codex.$($record.notifyAttempt)"
        $codexExecutable = Get-Executable 'codex'
        $child = New-Child $codexExecutable @('exec', 'resume', '--json', '-o', (Join-Path $runDir "$prefix.final.txt"), $record.codexThreadId, '-')
        $record.notifyState = 'notifying'; $record.error = $null
        Save-Record $record $recordPath
        try { $null = $child.Start() } catch {
            $record.notifyState = 'pending'; $record.error = $_.Exception.Message
            Save-Record $record $recordPath
            throw
        }
        # DSH 已退出，通知进程已创建；释放项目锁，允许 Codex 在审阅中派发下一次修复。
        $projectLock.Dispose(); $projectLock = $null
        $record.codexExitCode = Wait-Child $child $runDir $prefix $callback
        $eventsPath = Join-Path $runDir "$prefix.stdout.log"
        $accepted = $false; $completed = $false
        foreach ($line in [System.IO.File]::ReadLines($eventsPath)) {
            try { $event = $line | ConvertFrom-Json } catch { continue }
            if ($event.type -eq 'turn.started') { $accepted = $true }
            if ($event.type -eq 'turn.completed') { $completed = $true }
        }
        if ($record.codexExitCode -eq 0 -and $completed) { $record.notifyState = 'delivered' }
        elseif ($accepted) { $record.notifyState = 'uncertain'; $record.error = 'Codex 已接收但本轮未正常完成；先查目标会话，不自动重发。' }
        else {
            $record.notifyState = 'pending'
            $codexError = [System.IO.File]::ReadAllText((Join-Path $runDir "$prefix.stderr.log"), $utf8)
            if ($codexError -match 'already has an active writer') { $record.error = '桌面仍持有目标会话写入锁，CLI 无法续接；保持待通知，不解除锁，不自动重试。' }
            elseif ($codexError -match 'paginated_threads is not supported') { $record.error = '当前 Codex CLI 不支持目标分页历史；核对 CODEX_CLI_PATH 指向的桌面兼容版本。' }
            else { $record.error = 'Codex 未返回接收确认，通知失败；重试前核对日志和目标会话。' }
        }
        Save-Record $record $recordPath
        if ($record.notifyState -ne 'delivered') { Write-Warning "$($record.error) 运行记录：$recordPath"; exit 2 }
        Write-Host "Codex 已完成本次回调：$runId。结果：$(Join-Path $runDir "$prefix.final.txt")"
    } finally { $threadLock.Dispose() }
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
