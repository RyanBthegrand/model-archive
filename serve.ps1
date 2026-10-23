# Tiny local web server for the model showcase.
# - Rebuilds models/manifest.json from the JAN..DEC folders every time the page loads
# - Serves the site on http://localhost:8080 (or the next free port)
#
# Usage:  serve.bat                      (double-click)
#         powershell -File serve.ps1 -ManifestOnly   (just rebuild manifest.json)

param(
    [int]$Port = 8080,
    [switch]$ManifestOnly,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Root      = $PSScriptRoot
$ModelsDir = Join-Path $Root 'models'
$Months    = 'JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'
$ModelExts = '.glb','.gltf','.fbx','.obj'

function Update-Manifest {
    $byMonth = [ordered]@{}
    $total = 0
    foreach ($m in $Months) {
        $dir = Join-Path $ModelsDir $m
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        $files = Get-ChildItem -LiteralPath $dir -Recurse -File |
            Where-Object { $ModelExts -contains $_.Extension.ToLower() } |
            Sort-Object FullName
        $byMonth[$m] = @($files | ForEach-Object { $_.FullName.Substring($dir.Length + 1).Replace('\', '/') })
        $total += $byMonth[$m].Count
    }
    $json = [pscustomobject]@{ generated = (Get-Date).ToString('s'); months = [pscustomobject]$byMonth } | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $ModelsDir 'manifest.json'), $json, (New-Object Text.UTF8Encoding $false))
    return $total
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
Write-Host "  Drop models into models\JAN ... models\DEC, then refresh the page."
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
            if ($path -eq '/') { $path = '/index.html' }
            if ($path -eq '/models/manifest.json') { Update-Manifest | Out-Null }

            $full = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))
            if (-not $full.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                $res.StatusCode = 404
                $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
            } else {
                $bytes = [IO.File]::ReadAllBytes($full)
                $ext = [IO.Path]::GetExtension($full).ToLower()
                $res.ContentType = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
            }
            $res.Headers.Add('Cache-Control', 'no-store')
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            Write-Warning $_
        } finally {
            $res.Close()
        }
    }
} finally {
    $listener.Stop()
}
