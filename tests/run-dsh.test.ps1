#requires -Version 7.0
# 验证运行包装、权限隔离、锁、忙碌和通知重试；不调用真实模型。
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pwsh = (Get-Process -Id $PID).Path
$runner = Join-Path $root 'scripts/run-dsh.ps1'
$runRoot = Join-Path $root 'tmp/dsh-runs'
$testRoot = Join-Path $runRoot ('test-' + [guid]::NewGuid().ToString('N'))
$threadId = [guid]::NewGuid().ToString()
[System.IO.Directory]::CreateDirectory($testRoot) | Out-Null
$stateFile = Join-Path $testRoot 'desktop-state.txt'
$traceFile = Join-Path $testRoot 'desktop-trace.jsonl'
$taskDoc = Join-Path $testRoot '只读任务.md'
[System.IO.File]::WriteAllText($taskDoc, '测试任务，不开发游戏。')
$saved = @{}
foreach ($name in @('PATH','CODEX_HOME','CODEX_THREAD_ID','CODEX_APP_TOOLS_PIPE_PATH','DSH_DESKTOP_MCP_SERVER','DSH_PERMISSION_MODE','DSH_TEST_EXIT','DSH_TEST_NOTIFY_FAIL','DSH_TEST_SLEEP','DSH_TEST_STATE','DSH_TEST_TRACE','DSH_TEST_BUSY_READS')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$passed = 0
function Check($condition, $message) { if (!$condition) { throw $message }; $script:passed++; Write-Host "PASS $message" }
function Set-Thread($state) { [System.IO.File]::WriteAllText($stateFile, $state) }
function Invoke-Run {
    & $pwsh -NoProfile -File $runner -TaskDoc $taskDoc -CodexThreadId $threadId -Instructions '只读；参数中包含空格、引号 " 和 $ 字符' -NotifyWaitSeconds 0 -NotifyPollSeconds 1 | Out-Host
    $script:code = $LASTEXITCODE
    $pointer = Get-Content (Join-Path $runRoot 'active.json') -Raw | ConvertFrom-Json
    $script:lastRunId = $pointer.runId
    $script:lastRecord = Get-Content (Join-Path $runRoot "$lastRunId/run.json") -Raw | ConvertFrom-Json
}
try {
    $env:PATH = (Join-Path $PSScriptRoot 'dsh-fixtures') + [IO.Path]::PathSeparator + $env:PATH
    $env:CODEX_HOME = Join-Path $testRoot 'codex'
    $env:CODEX_THREAD_ID = [guid]::NewGuid().ToString()
    $env:CODEX_APP_TOOLS_PIPE_PATH = 'test-only-not-used'
    $env:DSH_DESKTOP_MCP_SERVER = Join-Path $PSScriptRoot 'dsh-fixtures/desktop-mcp.mjs'
    $env:DSH_TEST_STATE = $stateFile; $env:DSH_TEST_TRACE = $traceFile; $env:DSH_TEST_BUSY_READS = '0'
    $env:DSH_PERMISSION_MODE = 'test-parent'; $env:DSH_TEST_EXIT = '0'
    Set-Thread 'idle'
    Invoke-Run
    Check ($code -eq 0 -and $lastRecord.notifyState -eq 'delivered') '成功执行并回调；桌面消息接口未继承 DSH 提权值'
    Check ($env:DSH_PERMISSION_MODE -eq 'test-parent') '父进程环境保持原值'
    $delivered = $lastRunId
    & $pwsh -NoProfile -File $runner -RetryNotify $delivered | Out-Host
    Check ($LASTEXITCODE -eq 0 -and (Get-Content (Join-Path $runRoot "$delivered/run.json") -Raw | ConvertFrom-Json).notifyAttempt -eq 1) '已交付记录不会重复通知'

    $env:DSH_TEST_EXIT = '6'
    Invoke-Run
    Check ($code -eq 1 -and $lastRecord.dshExitCode -eq 6 -and $lastRecord.notifyState -eq 'delivered') 'DSH 非零退出仍通知，保留真实失败码'
    $env:DSH_TEST_EXIT = '0'; $env:DSH_TEST_NOTIFY_FAIL = '1'
    Invoke-Run
    Check ($code -eq 2 -and $lastRecord.notifyState -eq 'pending') '未接收的通知失败保存待通知'
    $retryId = $lastRunId
    $dshLog = Join-Path $runRoot "$retryId/dsh.stdout.log"
    $logTime = (Get-Item $dshLog).LastWriteTimeUtc
    $env:DSH_TEST_NOTIFY_FAIL = ''
    & $pwsh -NoProfile -File $runner -RetryNotify $retryId | Out-Host
    Check ($LASTEXITCODE -eq 0 -and (Get-Item $dshLog).LastWriteTimeUtc -eq $logTime) '重试只通知，不重新执行 DSH'

    Set-Thread 'busy'
    Invoke-Run
    Check ($code -eq 2 -and $lastRecord.notifyState -eq 'pending' -and $lastRecord.notifyAttempt -eq 0) '忙碌目标不发送消息，超时后保留待通知'
    Set-Thread 'idle'
    & $pwsh -NoProfile -File $runner -RetryNotify $lastRunId | Out-Host
    Check ($LASTEXITCODE -eq 0) '目标空闲后可以仅重试通知'

    $env:DSH_TEST_BUSY_READS = '2'
    Set-Thread 'busy'
    Invoke-Run
    $waitingRun = $lastRunId
    Set-Thread 'idle'
    & $pwsh -NoProfile -File $runner -RetryNotify $waitingRun -NotifyWaitSeconds 5 -NotifyPollSeconds 1 | Out-Host
    Check ($LASTEXITCODE -eq 0 -and (Get-Content (Join-Path $runRoot "$waitingRun/run.json") -Raw | ConvertFrom-Json).notifyState -eq 'delivered') '目标持续忙碌两次后空闲，脚本自动投递而无需模型巡检'
    $env:DSH_TEST_BUSY_READS = '0'

    Set-Thread 'wrong-project'
    Invoke-Run
    Check ($code -eq 2 -and $lastRecord.notifyAttempt -eq 0) '目标项目不匹配时不发送'
    Set-Thread 'idle'
    $env:DSH_TEST_NOTIFY_FAIL = 'accepted'
    Invoke-Run
    Check ($code -eq 2 -and $lastRecord.notifyState -eq 'uncertain') '发送中连接断开记录为不确定'
    & $pwsh -NoProfile -File $runner -RetryNotify $lastRunId 2>$null | Out-Host
    Check ($LASTEXITCODE -eq 3) '投递结果不明时禁止自动重发'
    $env:DSH_TEST_NOTIFY_FAIL = ''

    Set-Thread 'idle'
    $backgroundOutput = & $pwsh -NoProfile -File $runner -TaskDoc $taskDoc -CodexThreadId $threadId -Instructions '后台只读测试，保留单引号 ''、双引号 " 与 $ 字符' -Background
    Check ($LASTEXITCODE -eq 0 -and "$backgroundOutput" -match 'PID=(\d+)') '后台启动返回包装进程，不阻塞派发会话'
    $backgroundProcess = Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue
    if ($backgroundProcess) { Check ($backgroundProcess.WaitForExit(15000)) '后台测试包装进程正常退出' }
    $backgroundPointer = Get-Content (Join-Path $runRoot 'active.json') -Raw | ConvertFrom-Json
    $backgroundRecord = Get-Content (Join-Path $runRoot "$($backgroundPointer.runId)/run.json") -Raw | ConvertFrom-Json
    Check ($backgroundRecord.notifyState -eq 'delivered' -and $backgroundRecord.instructions.Contains("单引号 '")) '后台参数正确传递并完成回调'

    $held = [System.IO.File]::Open((Join-Path $runRoot 'project.lock'), 'OpenOrCreate','ReadWrite','None')
    try {
        & $pwsh -NoProfile -File $runner -TaskDoc $taskDoc -CodexThreadId $threadId -Instructions '不得启动重复任务' 2>$null | Out-Host
        Check ($LASTEXITCODE -eq 3) '项目锁阻止重复启动'
    } finally { $held.Dispose() }
    Write-Host "共 $passed 项通过；记录保留于 tmp/dsh-runs/，未调用真实模型。"
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
