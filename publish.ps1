#Requires -Version 5.1
<#
  Publish RepCount to github.com/Darker20121995/repcount
  ------------------------------------------------
  Right-click -> Run with PowerShell, or:
    powershell -ExecutionPolicy Bypass -File .\publish.ps1
#>

$ErrorActionPreference = 'Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}
Set-Location -LiteralPath $PSScriptRoot

$repoUrl = 'https://github.com/Darker20121995/repcount.git'
$webUrl  = 'https://github.com/Darker20121995/repcount'
$liveUrl = 'https://darker20121995.github.io/repcount/'

Write-Host ''
Write-Host '  RepCount -> GitHub' -ForegroundColor Cyan
Write-Host '  ------------------' -ForegroundColor DarkGray

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host '  git was not found. Install Git for Windows, then run this again.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath '.git')) {
  git init -b main | Out-Null
  Write-Host '  Initialised a new git repository.' -ForegroundColor DarkGray
}

if (-not (git config user.email)) {
  Write-Host ''
  Write-Host '  Git needs a name and email for the commit.' -ForegroundColor Yellow
  $name = Read-Host '  Your name [Darker20121995]'
  if ([string]::IsNullOrWhiteSpace($name)) { $name = 'Darker20121995' }
  $email = Read-Host '  Your GitHub email'
  if ([string]::IsNullOrWhiteSpace($email)) { $email = 'Darker20121995@users.noreply.github.com' }
  git config user.name $name
  git config user.email $email
}

Write-Host '  Staging files...' -ForegroundColor DarkGray
git add -A
git commit -m 'RepCount: interval rep trainer PWA' 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host '  Nothing new to commit - using the existing commit.' -ForegroundColor DarkGray
}
git branch -M main

$remote = $null
try { $remote = git remote get-url origin 2>$null } catch { $remote = $null }
if ($remote) {
  git remote set-url origin $repoUrl
} else {
  git remote add origin $repoUrl
}

Write-Host ''
Write-Host '  Pushing to GitHub... (a browser sign-in may open)' -ForegroundColor DarkGray
git push -u origin main

if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '  Push failed.' -ForegroundColor Yellow
  Write-Host '  1) Create the empty repo first:  ' -NoNewline
  Write-Host 'https://github.com/new' -ForegroundColor Cyan
  Write-Host '     name: repcount, visibility: Public, no README/license.'
  Write-Host '  2) Sign in when the Git Credential Manager window opens.'
  Write-Host '  3) Run this script again.'
  exit 1
}

Write-Host ''
Write-Host '  Pushed to ' -NoNewline
Write-Host $webUrl -ForegroundColor Cyan
Write-Host ''
Write-Host '  Turn on Pages now:' -ForegroundColor Green
Write-Host '    https://github.com/Darker20121995/repcount/settings/pages'
Write-Host '    Source: Deploy from a branch  |  main  |  / (root)  |  Save'
Write-Host ''
Write-Host '  Your app will be live at:' -ForegroundColor Green
Write-Host "    $liveUrl" -ForegroundColor Cyan
Write-Host ''
Write-Host '  On iPhone: Safari -> Share -> Add to Home Screen.'
Write-Host ''
