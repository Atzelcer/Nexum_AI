# Copia ROMs web + nucleos EmulatorJS para el modulo 03 (videojuego).
# Uso (desde la raiz del proyecto):
#   powershell -ExecutionPolicy Bypass -File scripts\setup_game_assets.ps1
# Opcional: -Source "D:\ruta\con\web-roms"

param(
  [string]$Source = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DestRoms = Join-Path $Root "modulo_game\panel\web-roms"
$DestCores = Join-Path $Root "modulo_game\panel\ejs\cores"

$candidates = @()
if ($Source) { $candidates += $Source }
$candidates += @(
  (Join-Path $Root "..\NEXUM_AI\modulo_game\panel\web-roms"),
  (Join-Path $Root "..\NEXUM_ENTREGA\02_Codigo_fuente\modulo_game\panel\web-roms"),
  (Join-Path $Root "modulo_game\panel\web-roms")
)

function Find-RomsDir {
  foreach ($c in $candidates) {
    $full = [System.IO.Path]::GetFullPath($c)
    if ((Test-Path (Join-Path $full "mslug.zip")) -and (Test-Path (Join-Path $full "neogeo.zip"))) {
      return $full
    }
  }
  return $null
}

New-Item -ItemType Directory -Force -Path $DestRoms | Out-Null
New-Item -ItemType Directory -Force -Path $DestCores | Out-Null

$srcRoms = Find-RomsDir
if (-not $srcRoms) {
  Write-Host "No se encontraron ROMs (mslug.zip + neogeo.zip)."
  Write-Host "Coloca la carpeta web-roms en:"
  Write-Host "  $DestRoms"
  Write-Host "o pasa -Source con la ruta que ya las tenga."
  exit 1
}

if ($srcRoms -ne ([System.IO.Path]::GetFullPath($DestRoms))) {
  Write-Host "Copiando ROMs desde:"
  Write-Host "  $srcRoms"
  Copy-Item -Path (Join-Path $srcRoms "*") -Destination $DestRoms -Recurse -Force
}

$srcCoresCandidates = @(
  (Join-Path $srcRoms "..\ejs\cores"),
  (Join-Path $Root "..\NEXUM_AI\modulo_game\panel\ejs\cores"),
  (Join-Path $Root "modulo_game\panel\ejs\cores")
)
$srcCores = $null
foreach ($c in $srcCoresCandidates) {
  $full = [System.IO.Path]::GetFullPath($c)
  if (Test-Path (Join-Path $full "mame2003_plus-wasm.data")) {
    $srcCores = $full
    break
  }
}

if ($srcCores -and $srcCores -ne ([System.IO.Path]::GetFullPath($DestCores))) {
  Write-Host "Copiando nucleos EmulatorJS desde:"
  Write-Host "  $srcCores"
  Copy-Item -Path (Join-Path $srcCores "*") -Destination $DestCores -Recurse -Force
}

Write-Host ""
Write-Host "Listo."
Write-Host "  ROMs:  $DestRoms"
Write-Host "  Cores: $DestCores"
Write-Host "Abre http://127.0.0.1:8090/modulo_game/panel/ y pulsa Jugar."
