param(
  [string]$Version = "v1.0"
)

# Resolve repo root (this script lives in scripts/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
$DistDir   = Join-Path $RepoRoot "dist"
$OutputsDir = Join-Path $RepoRoot "outputs"

# Create dist directory
if (!(Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

# Validate outputs
if (!(Test-Path $OutputsDir)) {
  Write-Error "outputs/ directory not found at: $OutputsDir. Run the analysis first to generate outputs."
  exit 1
}

# Prepare data ZIP (outputs + data license)
$DataZip = Join-Path $DistDir ("useeio_sectors_disaggregation-" + $Version + "-data.zip")
$DataTempDir = Join-Path $DistDir ("data_" + $Version)
if (Test-Path $DataTempDir) { Remove-Item -Recurse -Force $DataTempDir }
New-Item -ItemType Directory -Path $DataTempDir | Out-Null

# Copy outputs
Copy-Item -Path (Join-Path $OutputsDir "*") -Destination $DataTempDir -Recurse -Force

# Include data license files
$LicenseDataPath = Join-Path $RepoRoot "LICENSE-DATA.md"
if (Test-Path $LicenseDataPath) { Copy-Item $LicenseDataPath -Destination $DataTempDir -Force }
$DataTxtPath = Join-Path $OutputsDir "DATA_LICENSE.txt"
if (Test-Path $DataTxtPath) { Copy-Item $DataTxtPath -Destination $DataTempDir -Force }

# Create data ZIP
if (Test-Path $DataZip) { Remove-Item $DataZip -Force }
Compress-Archive -Path (Join-Path $DataTempDir "*") -DestinationPath $DataZip -Force

# Prepare code ZIP (code + licenses, excluding local and outputs)
$CodeZip = Join-Path $DistDir ("useeio_sectors_disaggregation-" + $Version + "-code.zip")
$CodeTempDir = Join-Path $DistDir ("code_" + $Version)
if (Test-Path $CodeTempDir) { Remove-Item -Recurse -Force $CodeTempDir }
New-Item -ItemType Directory -Path $CodeTempDir | Out-Null

# Include selected folders
$IncludeDirs = @("analysis","scripts","docs","spec_files")
foreach ($d in $IncludeDirs) {
  $src = Join-Path $RepoRoot $d
  if (Test-Path $src) { Copy-Item -Path $src -Destination $CodeTempDir -Recurse -Force }
}

# Include selected files
$IncludeFiles = @("LICENSE","LICENSE-DATA.md","README.md","config.yml","model_spec_mapping.yml")
foreach ($f in $IncludeFiles) {
  $src = Join-Path $RepoRoot $f
  if (Test-Path $src) { Copy-Item -Path $src -Destination $CodeTempDir -Force }
}

# Remove unwanted dirs if present
$RemoveDirs = @("local","outputs",".git",".github")
foreach ($rd in $RemoveDirs) {
  $path = Join-Path $CodeTempDir $rd
  if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}

# Create code ZIP
if (Test-Path $CodeZip) { Remove-Item $CodeZip -Force }
Compress-Archive -Path (Join-Path $CodeTempDir "*") -DestinationPath $CodeZip -Force

# Create release notes template
$NotesPath = Join-Path $DistDir ("RELEASE-NOTES-" + $Version + ".md")
$notes = @(
  "# useeio_sectors_disaggregation $Version",
  "",
  ("Release date: " + (Get-Date -Format "yyyy-MM-dd")),
  "",
  "## Summary",
  "- Dynamic USEEIO model selection via model_spec_mapping.yml (no defaults; explicit mapping required)",
  "- Data licensing added: CC BY 4.0 (LICENSE-DATA.md); license surfaced in Excel Author_Info and outputs/DATA_LICENSE.txt",
  "- UI docs and packaging improvements",
  "",
  "## Assets",
  ("- Data: " + (Split-Path $DataZip -Leaf)),
  ("- Code: " + (Split-Path $CodeZip -Leaf)),
  "",
  "## Notes",
  "- Datasets derive from USEPA USEEIO and Supply Chain Emission Factors; please acknowledge upstream sources.",
  "- See README for run instructions; outputs saved under outputs/."
)
Set-Content -Path $NotesPath -Value $notes -NoNewline:$false

Write-Host "Prepared release artifacts:" -ForegroundColor Green
Write-Host "  " $DataZip
Write-Host "  " $CodeZip
Write-Host "  " $NotesPath
