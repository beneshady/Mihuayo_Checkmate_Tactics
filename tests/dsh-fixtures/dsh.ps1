# 测试替身：不访问模型，不修改游戏代码。
param([Parameter(ValueFromRemainingArguments)][string[]]$Rest)
if ($env:DSH_PERMISSION_MODE -ne 'danger-full-access') { Write-Error 'DSH 子进程权限变量未设置'; exit 91 }
if ($env:DSH_TEST_SLEEP) { Start-Sleep -Milliseconds ([int]$env:DSH_TEST_SLEEP) }
Write-Output 'DSH_TEST_DELIVERY'
exit ([int]$env:DSH_TEST_EXIT)
