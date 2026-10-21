# 测试替身：只校验参数、stdin 和子进程环境边界。
$Rest = $args
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$inputText = [Console]::In.ReadToEnd()
if ($env:DSH_PERMISSION_MODE -ne 'test-parent') { Write-Error 'DSH 权限变量泄漏到 Codex'; exit 92 }
if ($inputText -notmatch 'DSH 完成回调' -or $Rest[0] -ne 'exec' -or $Rest[1] -ne 'resume') { [Console]::Error.WriteLine(($Rest | ConvertTo-Json -Compress) + '; stdinChars=' + $inputText.Length); exit 93 }
if ($env:DSH_TEST_NOTIFY_FAIL -eq '1') { Write-Error '模拟通知未接收'; exit 7 }
Write-Output '{"type":"turn.started"}'
if ($env:DSH_TEST_NOTIFY_FAIL -eq 'accepted') { exit 8 }
$outputIndex = [Array]::IndexOf($Rest, '-o')
[System.IO.File]::WriteAllText($Rest[$outputIndex + 1], 'DSH_TEST_ACK')
Write-Output '{"type":"turn.completed"}'
exit 0
