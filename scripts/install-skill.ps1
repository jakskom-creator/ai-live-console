$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot '..\skills\ai-live-simulator'
$destRoot = Join-Path $HOME '.agents\skills'
$dest = Join-Path $destRoot 'ai-live-simulator'

if (-not (Test-Path $source)) {
    Write-Error "Skill source not found: $source"
    exit 1
}

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
}

Copy-Item $source $dest -Recurse -Force

Write-Host ""
Write-Host "✅ 已安装通用 AI 直播模拟器技能到："
Write-Host "   $dest"
Write-Host ""
Write-Host "如果 DeepSeek Harness 正在运行，重启 dsh 后即可在技能列表看到 ai-live-simulator。"
