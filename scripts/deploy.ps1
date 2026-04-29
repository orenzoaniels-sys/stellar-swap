<#
.SYNOPSIS
    Build, deploy, and initialize all four Stellar Swap contracts on Testnet.

.DESCRIPTION
    Expects the Stellar CLI (`stellar`) to be installed and an identity
    called 'testnet-admin' already configured & funded. The script:
      1. Builds WASM for token, lp_token, amm
      2. Deploys Token A (STAR), Token B (MOON), AMM, then LP-token with AMM as admin
      3. Initializes each contract with admin = testnet-admin
      4. Calls amm.init() to wire everything together
      5. Writes .env.local in the project root so the frontend picks them up

.EXAMPLE
    pwsh ./scripts/deploy.ps1 -Identity testnet-admin
#>

param(
    [string]$Identity = "testnet-admin",
    [string]$Network  = "testnet"
)

$ErrorActionPreference = "Stop"

function Invoke-Stellar {
    param([string[]]$Cmd)
    Write-Host "> stellar $($Cmd -join ' ')" -ForegroundColor DarkGray
    $out = & stellar @Cmd
    if ($LASTEXITCODE -ne 0) { throw "stellar failed: $($Cmd -join ' ')" }
    return ($out | Out-String).Trim()
}

Write-Host "==> Checking prerequisites" -ForegroundColor Cyan
& stellar --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Stellar CLI not found. See https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup" }

$adminAddr = Invoke-Stellar @("keys","address",$Identity)
Write-Host "    admin = $adminAddr" -ForegroundColor Green

Write-Host "==> Building contracts" -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../contracts"
try {
    & stellar contract build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
}
finally { Pop-Location }

$wasmDir = "$PSScriptRoot/../target/wasm32v1-none/release"
if (-not (Test-Path "$wasmDir/token.wasm")) {
    # Fallback to older output path
    $wasmDir = "$PSScriptRoot/../target/wasm32-unknown-unknown/release"
}
if (-not (Test-Path "$wasmDir/token.wasm")) {
    throw "WASM artifacts not found under target/"
}

Write-Host "==> Deploying Token A (STAR)" -ForegroundColor Cyan
$TOKEN_A_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/token.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    TOKEN_A_ID = $TOKEN_A_ID" -ForegroundColor Green

Write-Host "==> Deploying Token B (MOON)" -ForegroundColor Cyan
$TOKEN_B_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/token.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    TOKEN_B_ID = $TOKEN_B_ID" -ForegroundColor Green

Write-Host "==> Deploying AMM" -ForegroundColor Cyan
$AMM_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/amm.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    AMM_ID = $AMM_ID" -ForegroundColor Green

Write-Host "==> Deploying LP Token" -ForegroundColor Cyan
$LP_TOKEN_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/lp_token.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    LP_TOKEN_ID = $LP_TOKEN_ID" -ForegroundColor Green

Write-Host "==> Initializing contracts" -ForegroundColor Cyan

# Token A
Invoke-Stellar @(
    "contract","invoke","--id",$TOKEN_A_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init","--admin",$adminAddr,"--decimal","7",
    "--name","Stellar Star","--symbol","STAR") | Out-Null
Write-Host "    STAR initialized" -ForegroundColor Green

# Token B
Invoke-Stellar @(
    "contract","invoke","--id",$TOKEN_B_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init","--admin",$adminAddr,"--decimal","7",
    "--name","Stellar Moon","--symbol","MOON") | Out-Null
Write-Host "    MOON initialized" -ForegroundColor Green

# LP token — admin = AMM contract address
Invoke-Stellar @(
    "contract","invoke","--id",$LP_TOKEN_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init","--admin",$AMM_ID,"--decimal","7",
    "--name","STAR-MOON LP","--symbol","S-LP") | Out-Null
Write-Host "    LP token initialized (admin=AMM)" -ForegroundColor Green

# AMM
Invoke-Stellar @(
    "contract","invoke","--id",$AMM_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init",
    "--token_a",$TOKEN_A_ID,
    "--token_b",$TOKEN_B_ID,
    "--lp_token",$LP_TOKEN_ID) | Out-Null
Write-Host "    AMM initialized" -ForegroundColor Green

Write-Host "==> Writing .env.local" -ForegroundColor Cyan
$envFile = "$PSScriptRoot/../.env.local"
@"
VITE_TOKEN_A_ID=$TOKEN_A_ID
VITE_TOKEN_B_ID=$TOKEN_B_ID
VITE_LP_TOKEN_ID=$LP_TOKEN_ID
VITE_AMM_ID=$AMM_ID
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_RPC_URL=https://soroban-testnet.stellar.org
"@ | Set-Content -Path $envFile -Encoding utf8

Write-Host "`n======================================" -ForegroundColor Green
Write-Host " Deployed to Testnet. IDs in .env.local" -ForegroundColor Green
Write-Host "======================================`n" -ForegroundColor Green
Write-Host " TOKEN_A (STAR) : $TOKEN_A_ID"
Write-Host " TOKEN_B (MOON) : $TOKEN_B_ID"
Write-Host " LP TOKEN       : $LP_TOKEN_ID"
Write-Host " AMM            : $AMM_ID"
Write-Host ""
Write-Host "Next: npm run dev" -ForegroundColor Cyan
