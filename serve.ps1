# Tiny local web server for the model showcase.
# - Every folder inside models/ is one model; the folder name is its title
# - Rebuilds models/manifest.json from those folders every time the page loads
# - Saves notes / display mode from the page into models/<folder>/info.json
# - Serves the site on http://localhost:8080 (or the next free port)
#
# Usage:  serve.bat                                   (double-click)
#         powershell -File serve.ps1 -ManifestOnly    (just rebuild manifest.json)

param(
    [int]$Port = 8080,
    [switch]$ManifestOnly,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Root      = $PSScriptRoot
$ModelsDir = [IO.Path]::GetFullPath((Join-Path $Root 'models'))
$ModelExts = '.glb', '.gltf', '.fbx', '.obj'   # in order of preference when a folder has several
$Utf8      = New-Object Text.UTF8Encoding $false

function Read-Info([string]$Dir) {
    $path = Join-Path $Dir 'info.json'
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        return [IO.File]::ReadAllText($path, $Utf8) | ConvertFrom-Json
    } catch {
        Write-Warning "Ignoring invalid $path"
        return $null
    }
}

function Find-ModelFile([string]$Dir) {
    $files = @(Get-ChildItem -LiteralPath $Dir -Recurse -File |
        Where-Object { $ModelExts -contains $_.Extension.ToLower() })
    if ($files.Count -eq 0) { return $null }
    # Prefer files nearest the top of the folder, then by format preference
    return $files | Sort-Object `
        @{ Expression = { $_.FullName.Substring($Dir.Length).Split('\').Count } },
        @{ Expression = { [array]::IndexOf($ModelExts, $_.Extension.ToLower()) } },
        Name | Select-Object -First 1
}

function Update-Manifest {
    if (-not (Test-Path -LiteralPath $ModelsDir)) { New-Item -ItemType Directory -Path $ModelsDir | Out-Null }
    $list = New-Object System.Collections.ArrayList
    # Folders starting with _ or . are skipped, so you can hide a model without deleting it
    $folders = Get-ChildItem -LiteralPath $ModelsDir -Directory |
        Where-Object { $_.Name -notmatch '^[_.]' } |
        Sort-Object Name
    foreach ($folder in $folders) {
        $file = Find-ModelFile $folder.FullName
        if (-not $file) { continue }
        $entry = [ordered]@{
            folder = $folder.Name
            file   = $file.FullName.Substring($folder.FullName.Length + 1).Replace('\', '/')
        }
        $info = Read-Info $folder.FullName
        if ($info) { $entry.info = $info }
        [void]$list.Add([pscustomobject]$entry)
    }
    $json = [pscustomobject]@{ generated = (Get-Date).ToString('s'); models = $list } | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $ModelsDir 'manifest.json'), $json, $Utf8)
    return $list.Count
}

# Merges notes / mode into models/<folder>/info.json, keeping any other keys you added by hand.
function Save-Info([string]$FolderName, [string]$Body) {
    $dir = [IO.Path]::GetFullPath((Join-Path $ModelsDir $FolderName))
    if ((Split-Path $dir -Parent) -ne $ModelsDir -or -not (Test-Path -LiteralPath $dir -PathType Container)) {
        throw "Unknown model folder '$FolderName'"
    }
    $incoming = $Body | ConvertFrom-Json
    $info = Read-Info $dir
    if (-not $info) { $info = New-Object PSObject }
    foreach ($key in 'notes', 'mode') {
        if ($incoming.PSObject.Properties[$key]) {
            $info | Add-Member -NotePropertyName $key -NotePropertyValue ([string]$incoming.$key) -Force
        }
    }
    [IO.File]::WriteAllText((Join-Path $dir 'info.json'), ($info | ConvertTo-Json -Depth 5), $Utf8)
}

$count = Update-Manifest
Write-Host "manifest.json updated - $count model(s) found." -ForegroundColor DarkGray
if ($ManifestOnly) { return }

$Mime = @{
    '.html' = 'text/html; charset=utf-8';  '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8';   '.json' = 'application/json; charset=utf-8'
    '.glb'  = 'model/gltf-binary';         '.gltf' = 'model/gltf+json'
    '.bin'  = 'application/octet-stream';  '.fbx'  = 'application/octet-stream'
    '.obj'  = 'text/plain';                '.mtl'  = 'text/plain'
    '.png'  = 'image/png';                 '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg';                '.webp' = 'image/webp'
    '.ktx2' = 'image/ktx2';                '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

function Send-Response($Res, [int]$Status, [byte[]]$Bytes, [string]$Type) {
    $Res.StatusCode = $Status
    if ($Type) { $Res.ContentType = $Type }
    $Res.Headers.Add('Cache-Control', 'no-store')
    $Res.ContentLength64 = $Bytes.Length
    $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

function Send-Json($Res, [int]$Status, [string]$Json) {
    Send-Response $Res $Status $Utf8.GetBytes($Json) 'application/json; charset=utf-8'
}

# Find a free port
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$p/")
        $listener.Start()
        $Port = $p
        break
    } catch {
        $listener = $null
    }
}
if (-not $listener) { throw "Could not find a free port between $Port and $($Port + 19)." }

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Model showcase running at $url" -ForegroundColor Yellow
Write-Host "  Add a folder per model inside models\, then refresh the page."
Write-Host "  Press Ctrl+C (or close this window) to stop."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

$RootPrefix = $Root.TrimEnd('\') + '\'
try {
    while ($listener.IsListening) {
        # Poll so Ctrl+C still works while waiting for a request
        $task = $listener.GetContextAsync()
        while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
        $ctx = $task.GetAwaiter().GetResult()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

            if ($path -eq '/api/ping') {
                Send-Json $res 200 '{"ok":true}'
            }
            elseif ($path.StartsWith('/api/info/') -and $req.HttpMethod -eq 'PUT') {
                $origin = $req.Headers['Origin']
                if ($origin -and $origin -ne "http://localhost:$Port") {
                    Send-Json $res 403 '{"ok":false}'
                } else {
                    $reader = New-Object IO.StreamReader($req.InputStream, $Utf8)
                    $body = $reader.ReadToEnd()
                    if ($body.Length -gt 200000) {
                        Send-Json $res 413 '{"ok":false}'
                    } else {
                        Save-Info $path.Substring('/api/info/'.Length) $body
                        Send-Json $res 200 '{"ok":true}'
                    }
                }
            }
            else {
                if ($path -eq '/') { $path = '/index.html' }
                if ($path -eq '/models/manifest.json') { Update-Manifest | Out-Null }

                $full = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))
                if (-not $full.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
                    -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                    Send-Response $res 404 $Utf8.GetBytes('Not found') 'text/plain'
                } else {
                    $ext = [IO.Path]::GetExtension($full).ToLower()
                    $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
                    Send-Response $res 200 ([IO.File]::ReadAllBytes($full)) $type
                }
            }
        } catch {
            Write-Warning $_
            try { Send-Json $res 500 '{"ok":false}' } catch { }
        } finally {
            $res.Close()
        }
    }
} finally {
    $listener.Stop()
}
