# Model Archive

A three.js turntable showcase for this year's models.

## Adding models

Make one folder per model inside `models/`. **The folder name is the title shown on the page.**

```
models/
  01 Skeleton/         SkeletonGameExport.fbx  (+ its texture .pngs)
  02 Tools Scene/      ToolsSceneV3.glb
  03 Rock Golem/       RockGolem.fbx
  04 Angel Statue/     AngelStatue.glb   info.json
  _Work In Progress/   ...               <- starts with _ so it's hidden
```

- Folders are shown in name order. A leading number like `03 ` sets the order and isn't shown in the title.
- Add as many folders as you like. Folders starting with `_` or `.` are skipped.
- Supported formats: **.glb / .gltf** (recommended), **.fbx**, **.obj** (OBJ files get a plain grey material).
  If a folder has more than one, the one nearest the top of the folder is used, preferring .glb.
- Models are scaled automatically, so export at any size.

### info.json (optional, one per folder)

```json
{
    "notes": "Enemy for my TAFE game project. Sculpted in Blender, textured in Substance.",
    "mode": "both",
    "accent": "#ff8c2a"
}
```

- **notes**: the text under the title. You can type it straight into the notes box on the page (see below).
- **mode**: `turntable` (spin only), `animation` (play the first animation, no spin) or `both`. You can pick it with
  the buttons under the title. Models with an animation default to `both`. Models without one always use turntable.
- **accent**: the model's colour for the rim light, mist and UI. Leave it out (recommended) and the models sweep
  smoothly from blue to green and back along the list.

### Notes and display mode

When the page is running through `serve.bat`, typing in the notes box or clicking a mode saves it straight into
that model's `info.json`. Commit and push those files to update the published site. On GitHub Pages the boxes still
work, but nothing is saved. The page shows "Not saved" if you try.

## Running it

Double-click **`serve.bat`**. It starts a small local server (PowerShell, nothing to install) and opens
`http://localhost:8080`. It rebuilds `models/manifest.json` from the folders on every page load, so to add a
model you just drop it in and refresh.

Opening `index.html` straight from disk won't work, because browsers block loading 3D files from `file://`.

If you'd rather use another server (VS Code Live Server, `npx serve`, etc.), first run
`powershell -ExecutionPolicy Bypass -File serve.ps1 -ManifestOnly` to update the manifest.

## Controls

- **Arrows / ← →**: next and previous model (the model slides off with an ease-out)
- **Number strip**: jump straight to a model (hover for its name)
- **Drag**: spin the model by hand
- **Turntable / Animation / Both**: how the model moves

## Shrinking models

Exports straight from Blender are often huge: 4K textures, plus a PNG copy of every WebP texture. Phones struggle with
these. Before publishing, compress big `.glb` files with [gltf-transform](https://gltf-transform.dev) (needs Node.js):

```
npx @gltf-transform/cli optimize "models-src/02 Tools Scene/ToolsSceneV3.glb" "models/02 Tools Scene/ToolsSceneV3.glb" --compress meshopt --texture-compress webp --texture-size 2048 --simplify false
```

Keep the originals in `models-src/` (same folder names). That folder is git-ignored, so it never gets uploaded.
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

The settings are at the top of `js/main.js` (`CONFIG` for size, spin speed, slide time and bloom; `ACCENT_FROM` /
`ACCENT_TO` for the two ends of the colour sweep). The mist layers are defined in `MIST_LAYERS` in `js/effects.js`.

The faint brush motifs come from `img/decals/`. They're white-on-transparent images tinted with the model's accent.
They're drawn inside the 3D scene just in front of the backdrop, so the mist and the model always render over them.
Their position, size, opacity and spin speed are in `DECALS` in `js/effects.js`, and `DECAL_GAIN` sets their overall
strength. To add one, export white ink on a transparent background into `img/decals/` and add an entry to `DECALS`.
