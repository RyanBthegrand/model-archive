# Model Archive

A three.js turntable showcase for this year's models. It has a misty, rim-lit look based on the Dota 2 update pages.

## Adding models

Drop files into the month folders:

```
models/
  JAN/  dragon.glb
  FEB/  frost_icicle.fbx
  MAR/  sword/scene.gltf   <- glTF with separate textures can live in a subfolder
  ...
  DEC/
```

- Supported formats: **.glb / .gltf** (recommended), **.fbx**, **.obj** (OBJ files get a plain grey material)
- The file name becomes the title: `frost_icicle-v2.fbx` → "frost icicle v2" (shown in caps)
- Models are scaled automatically, so export at any size
- If a glTF has animations, the first clip plays (good for idle poses)
- A folder can hold several models. Months with nothing in them are greyed out.

## Running it

Double-click **`serve.bat`**. It starts a small local server (PowerShell, nothing to install) and opens
`http://localhost:8080`. It rebuilds `models/manifest.json` from the folders on every page load, so to add a
model you just drop it in and refresh.

Opening `index.html` straight from disk won't work, because browsers block loading 3D files from `file://`.

If you'd rather use another server (VS Code Live Server, `npx serve`, etc.), first run
`powershell -ExecutionPolicy Bypass -File serve.ps1 -ManifestOnly` to update the manifest.

## Controls

- **Arrows / ← →**: next and previous model (the model slides off with an ease-out)
- **Month strip**: jump straight to a month
- **Drag**: spin the model by hand

## Shrinking models

Exports straight from Blender are often huge: 4K textures, plus a PNG copy of every WebP texture. Phones struggle with
these. Before publishing, compress big `.glb` files with [gltf-transform](https://gltf-transform.dev) (needs Node.js):

```
npx @gltf-transform/cli optimize models-src/MAY/model.glb models/MAY/model.glb --compress meshopt --texture-compress webp --texture-size 2048 --simplify false
```

Keep the originals in `models-src/` (same month folders). That folder is git-ignored, so it never gets uploaded.
This took ToolsSceneV3 from 35 MB to 1 MB and BasicEnemyV2 from 7.6 MB to 0.9 MB.

FBX files load their textures as separate files, so put the `.png`s next to the `.fbx`. If a texture is missing, the
model still shows, just untextured.

## Publishing (GitHub Pages)

GitHub Pages only serves files, so `serve.ps1` doesn't run there. **Before every push, rebuild the manifest:**

```
powershell -ExecutionPolicy Bypass -File serve.ps1 -ManifestOnly
git add -A
git commit -m "Add new models"
git push
```

The site updates a minute or so after the push.

## Tweaking

The settings are at the top of `js/main.js` (`CONFIG` for size, spin speed, slide time and bloom; `MONTHS` for the
per-month accent colours). The mist layers are defined in `MIST_LAYERS` in `js/effects.js`.
