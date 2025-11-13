# Clean Git history of large/binary build artifacts (node_modules, .next)
# Usage: Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/clean-repo.ps1

param(
  [string]$Branch = "main",
  [string]$Remote = "origin"
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERR]  $msg" -ForegroundColor Red }

function Exec($cmd) {
  Write-Info $cmd
  $proc = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", $cmd -Wait -PassThru -WindowStyle Hidden
  if ($proc.ExitCode -ne 0) { throw "Command failed ($cmd) with exit code $($proc.ExitCode)" }
}

# --- Pre checks ---
if (!(Test-Path ".git")) { Write-Err "Not in a Git repo root (missing .git folder)"; exit 1 }

# Paths and globs to remove from history (build artifacts and secrets)
$pathsToRemove = @(
  "node_modules/",
  ".next/",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production"
)
$pathGlobsToRemove = @(
  "**/.env*",
  "**/*.env"
)
Write-Info "Paths to remove from history: $($pathsToRemove -join ', ')"
Write-Info "Globs to remove from history: $($pathGlobsToRemove -join ', ')"

# --- Ensure .gitignore blocks future commits ---
$gitignorePath = ".gitignore"
if (!(Test-Path $gitignorePath)) { New-Item -ItemType File -Path $gitignorePath | Out-Null }
$gitignoreLines = Get-Content $gitignorePath -ErrorAction SilentlyContinue
$requiredLines = @(
  "node_modules/",
  ".next/",
  "out/",
  "build/",
  "dist/",
  ".env*",
  "*.local",
  "!.env.example"
)
foreach ($ln in $requiredLines) { if ($gitignoreLines -notcontains $ln) { Add-Content $gitignorePath $ln } }
Write-Info ".gitignore updated to ignore build artifacts and env files (with .env.example allowed)"

# --- Install git-filter-repo if missing ---
function Ensure-FilterRepo {
  try {
    Exec "git filter-repo --help > $null"
    Write-Info "git-filter-repo available"
  } catch {
    Write-Warn "git-filter-repo not found. Attempting to install via pip..."
    try {
      Exec "py -m pip install --user git-filter-repo"
    } catch {
      Exec "python -m pip install --user git-filter-repo"
    }
    # Try again
    try { Exec "git filter-repo --help > $null" } catch { Write-Err "git-filter-repo still not available. Install manually: https://github.com/newren/git-filter-repo"; exit 1 }
  }
}

Ensure-FilterRepo

# --- Rewrite history to remove large paths and secret files ---
$invertArgs = ($pathsToRemove | ForEach-Object { "--path `"$_`"" }) -join ' '
$globArgs = ($pathGlobsToRemove | ForEach-Object { "--path-glob `"$_`"" }) -join ' '
$cmd = "git filter-repo --force --invert-paths $invertArgs $globArgs"
Exec $cmd
Write-Info "History rewritten to remove build artifacts and env files"

# --- Safety: remove any currently staged tracked artifacts ---
try { Exec "git rm -r --cached node_modules .next .env .env.local .env.development .env.production" } catch { Write-Warn "No cached build artifacts or env files to unstage (ok)" }

Exec "git add ."
try { Exec "git commit -m 'Clean history: remove node_modules/.next and .env* secrets'" } catch { Write-Warn "No changes to commit after filter (ok)" }

# --- Validate ---
$lsOut = & git ls-files
if ($lsOut | Select-String -Pattern "node_modules|\.next|\.env") {
  Write-Warn "Tracked files still include build artifacts or env files. Re-run or check manually."
} else {
  Write-Info "Validation passed: no tracked node_modules/.next or env files."
}

# --- Force push ---
Write-Warn "About to FORCE PUSH to $Remote/$Branch (this rewrites remote history)."
Write-Host "Press Y to continue, N to cancel:" -NoNewline
$key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown").Character
Write-Host ""
if ($key -ne 'Y' -and $key -ne 'y') { Write-Err "Aborted by user"; exit 1 }

Exec "git push -f $Remote $Branch"
Write-Info "Force push complete. Remote history cleaned."