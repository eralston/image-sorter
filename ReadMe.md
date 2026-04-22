# Image Sorter

Image Sorter is a Windows desktop app for taking a pile of images on disk and turning it into something useful — whether that's a tidy folder hierarchy, a corrected and cropped batch of scans, or an ordered, sequentially-named set of files ready to hand off to a downstream tool that only understands filenames. The app is built around two tightly focused workflows that share a common image stack:

- **Edit mode** — the original "one image at a time" triage loop. Open a folder, see one large image, optionally rotate / auto-color-correct / crop it, and move it into one of the visible destination subfolders with a click or a hotkey. Optimized for fast keyboard-driven decisions on large batches.

<img width="1919" height="1031" alt="image" src="https://github.com/user-attachments/assets/78852912-d240-4c56-b165-1dd8e1fdb28d" />


- **Organize mode** — once images are sorted into a folder hierarchy, this mode treats that whole hierarchy as a single pool. Select a root folder; the app recursively pulls every image (skipping `.orig.*` backup snapshots), shows them in a draggable grid, and lets you reorder them, exclude the ones you don't want, and export the survivors to a target folder, copied and renamed with a numeric prefix and a project name like `1-mo-ralston-images.jpg`, `2-mo-ralston-images.jpg`, …

<img width="1917" height="1028" alt="image" src="https://github.com/user-attachments/assets/959790e4-9366-4633-a3a6-872ffd0e981f" />

The two modes share a top-of-window tab switcher, so you can flip between editing individual images and assembling them into an ordered set without leaving the app.

PS: This app was originally created to help organize photos for the passing of my father, Maurice Howell Ralston, whose adventures were so numerous I had to turn to Vibe Coding to organize them all

## Goal

Make end-to-end image preparation — triage, light correction, ordering, and final naming — fast and low-friction on Windows.

## Edit mode

The original sorting workflow. Open a folder, page through the images one at a time, and either route each one into a subfolder or apply a quick edit in place.

### Sorting loop

- Open a folder of images via the **Open folder…** button or `Ctrl+O`
- See one large preview at a time, with destination subfolders listed on the right
- Click a destination, or press a number key (`1`–`9`) to send the image to that folder
- Create new subfolders inline from the destinations panel
- The app advances to the next remaining image automatically
- `←` / `→` (or `PageUp` / `PageDown`) move through the queue without sorting
- `Ctrl+Z` undoes the most recent move (bounded undo stack of the last 20)
- Files are physically moved on disk; collisions auto-resolve to `name (1).jpg`, etc.

### In-place image edits

For batches of old or scanned photos, three lightweight in-place edits sit alongside the sorting workflow. All edits write back to the original file and share a single backup of the unmodified original.

- **Rotate** (`↻ Rotate` / `↺ Rotate`, **R** / **Shift+R**): lossless 90° rotation. JPEGs are rotated via re-encoding when needed and EXIF orientation is normalized.
- **Auto color correct** (`✨ Auto-correct`, **C**): a general-purpose, per-image automatic color correction. Internally this runs ImageMagick with `-auto-orient -auto-level -auto-gamma -contrast-stretch 0.5%x0.5%`. The per-channel `-auto-level` is the key step — it stretches each RGB channel independently, which removes the color cast scanned photos typically pick up over time. JPEGs are re-encoded at quality 92.
- **Crop** (`✂ Crop`, **X**): click and drag anywhere over the image to draw a selection rectangle, then press **X** (or click the button) to crop the file to that rectangle. **Esc** clears an in-progress selection. Drag start and end points are clamped to the displayed image bounds, so it's fine to begin or end the drag in the dark letterbox area.
- **Revert** (`↶ Revert`, **Shift+C**): restores the file from its `.orig` backup, undoing all auto-correction and cropping in one step.

#### Backup behavior

- The first destructive edit (correct or crop) on a file copies it to a sibling named `<photo>.orig.<ext>` (e.g. `IMG_0001.orig.jpg`).
- Subsequent edits leave that backup untouched, so it always represents the true pre-edit original.
- Backup files are hidden from the sortable image list in Edit mode and from the recursive scan in Organize mode.
- Revert consumes the backup; after a revert the file is back to its original state and a new edit will create a fresh backup.

### Edit mode keyboard shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next image |
| `1`–`9` | Send current image to the Nth destination folder |
| `R` / `Shift+R` | Rotate clockwise / counter-clockwise |
| `C` / `Shift+C` | Auto color correct / revert to backup |
| Drag + `X` | Apply crop to drawn selection |
| `Esc` | Clear in-progress crop selection |
| `Ctrl+Z` | Undo last move |
| `Ctrl+O` | Open folder |

## Organize mode

Designed for the second half of a project: you have a folder hierarchy full of edited images and need to produce a single, ordered, predictably-named set of files for a downstream tool that only distinguishes by filename (slideshow software, kiosk player, etc.).

### Source scan

- **Choose source folder…** opens a folder picker
- The app walks that folder *and every subfolder* recursively
- Supported image formats are collected (JPG, JPEG, PNG, WEBP, GIF)
- `.orig.*` backup snapshots, `.git`, `node_modules`, and Windows system folders are skipped
- Default order is *folder, then filename* with natural numeric sort (so `2.jpg` < `10.jpg`)

### Grid, ordering, and selection

- Each image is rendered as a tile in a responsive grid
- Tiles are draggable; drop on any tile to insert before it, or drop on the trailing zone to push to the end
- Each tile has a **numbered badge** (top-right) showing its 1-based position among selected images, and an **× Exclude** button (top-left) anchored to a fixed spot regardless of image aspect ratio
- Click an image's thumbnail (anywhere except the **×** button) to open it in the preview lightbox

### Sticky excluded tray

- A single **excluded tray** is pinned at the top of the grid scroll area and stays visible no matter how far you scroll
- Excluding an image from anywhere (tile button, lightbox, *Deselect all*) removes it from the main grid and adds it to the tray
- The tray collapsed view shows a count plus a row of small thumbnail previews
- Expanding the tray reveals every excluded image in a mini-grid, each with a hover **Restore** button that puts it back at its original position in the order
- A **Restore all** action reincludes the entire tray at once
- The tray dims and shows "No excluded images" when empty so the affordance stays discoverable

### Preview lightbox

Hard to tell two similar shots apart at thumbnail size? Click a tile to enlarge.

- Full-screen view of the current image with toolbar showing position (`3 / 87`), the order number, and the source path
- **← / →** (or `PageUp` / `PageDown`) cycle through *only the currently selected images* — excluded ones are skipped
- **X** (or `Delete`) excludes the currently previewed image and automatically advances to the next selected one
- **Ctrl+Z** undoes the most recent exclusion and jumps the preview to the restored image
- **Esc** (or click the dim backdrop) closes the lightbox
- Side arrow buttons auto-disable at the start and end of the selected set
- Excluding the last selected image while previewing falls back to the previous selected image, or closes the lightbox if the set is empty

### Exclusion-undo stack

- Every exclusion (from a tile, the lightbox, or *Deselect all*) is pushed onto an undo stack
- The lightbox's **↶ Undo exclude** button (and `Ctrl+Z` while the preview is open) pops the most recent exclusion off the stack
- Re-including an image by other means (e.g. via the tray's **Restore** button) silently removes its entry from the stack so it can't be accidentally re-excluded
- Loading a new source folder clears the stack

### Export

The **Export…** button opens a small dialog with two inputs:

1. **Project name** — used as the filename suffix; validated against the same Windows-safe rules as folder names (no `< > : " / \ | ? *`, no reserved names like `CON`, no trailing spaces or dots, etc.)
2. **Target folder** — picked from a folder dialog

Confirming **Export** copies (does *not* move) every selected image into the target folder, in the user-specified order, renamed using the pattern:

```
<N>-<project>.<ext>
```

- `N` is the 1-based position in the order, zero-padded to the width of the total count (so 7 selections produce `1-` … `7-`, while 100+ produce `001-` … `100-`).
- `<project>` is the project name as entered.
- `<ext>` is the source image's original extension, preserved per file.

Example: 87 selected images named with project `mo-ralston-images` produce `01-mo-ralston-images.jpg`, `02-mo-ralston-images.png`, …, `87-mo-ralston-images.jpg`.

#### Pre-flight collision check

Before any file is written, the export pre-flight checks that *none* of the generated names already exists in the target folder. If any do, the operation is aborted before copying anything and the conflicting names are surfaced in the status bar — there is no silent overwrite.

The pre-flight also verifies that all source files still exist. Originals are always copied (never moved), so the source hierarchy is left intact and you can re-export with a different project name or selection.

## Tabs and shared image stack

The two modes are toggled via tabs at the top of the window. Each mode keeps its own state (last opened folder in Edit mode, current grid in Organize mode), so you can edit a few images, switch to Organize, refine the ordering, and switch back without losing context.

## Supported formats

JPG · JPEG · PNG · WEBP · GIF

Files are matched by extension; HEIC, RAW, and other specialized formats are out of scope. Auto-correct and crop currently target JPEG and PNG; rotation and the Organize-mode workflow handle all supported formats.

## ImageMagick requirement

Auto-correct and crop both shell out to **ImageMagick 7** (`magick.exe`). Everything else — opening folders, sorting, undo, rotation, the Organize mode in its entirety — works without it.

Install ImageMagick from <https://imagemagick.org/script/download.php#windows>. The official Windows installer's "Add application directory to your system path" option is convenient but not required.

The app discovers `magick.exe` in this order, the first time you trigger an edit in a session (the result is cached):

1. Plain `magick` on `PATH`.
2. Any `ImageMagick-*\magick.exe` directly under `%ProgramFiles%`, `%ProgramW6432%`, or `%ProgramFiles(x86)%`. When multiple versions are installed, the lexically highest (typically the newest) is preferred.

If neither lookup succeeds, the app surfaces a clear error in the status bar explaining that ImageMagick must be installed and the app restarted.

## Reliability

- Graceful handling of missing files mid-session
- Clear status-bar feedback for permission issues, invalid names, and collisions
- Windows-safe folder and project name validation (reserved names, illegal characters, length, trailing whitespace/dots)
- Cross-device moves fall back to copy + unlink so sorting still works across drives
- Permission-denied subfolders are skipped during the recursive Organize scan rather than aborting the whole scan

## Technical Stack

- **Electron** — desktop shell and filesystem access (Windows-targeted)
- **React + TypeScript** — renderer UI
- **electron-vite** — dev server and build pipeline
- Context isolation enabled; renderer talks to the main process exclusively through a typed IPC contract exposed via the preload script
- Local image files are served to the renderer through a custom `safe-file://` protocol rather than disabling web security

## Project Structure

```
src/
  main/                  # Electron main process
    main.ts              # window lifecycle, safe-file:// protocol
    ipc-handlers.ts      # typed IPC endpoints
    file-manager.ts      # folder scan, move, undo, validation
    organize-manager.ts  # recursive scan + export pipeline
    image-rotation.ts    # lossless rotation
    image-correct.ts     # ImageMagick auto color correct
    image-crop.ts        # ImageMagick crop
    image-revert.ts      # restore from .orig backup
  preload/
    index.ts             # context-bridge API surface
  renderer/
    App.tsx              # mode tabs
    components/
      EditView.tsx       # Edit mode
      OrganizeView.tsx   # Organize mode + lightbox + tray
      ExportDialog.tsx   # project name + target folder picker
      ImageViewer.tsx    # Edit mode large preview + crop selection
      DestinationFolders.tsx
    hooks/
      useSortSession.ts
      useKeyboardShortcuts.ts
  shared/
    types.ts             # IPC + UI contracts
```

## Local Development

Requires Node.js 20+. From the repo root:

```powershell
npm install
npm run dev          # launches Electron against the live renderer
npm run typecheck    # tsc --noEmit on both project tsconfigs
npm run build        # production renderer + main bundle
npm run start        # preview the production build
```

For the in-place edit features, install ImageMagick 7 separately as described above.

## Windows Considerations

- Folder and project names validated against Windows-illegal characters and reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`)
- Trailing dots and spaces rejected
- Cross-device file operations handled via copy-then-delete fallback
- File listings stay responsive on long paths
- The app is intentionally Windows-first; macOS / Linux are not supported targets

## Design Principles

- Fast single-image decision making is more important than batch features
- The app should stay usable with minimal setup
- Filesystem operations should be explicit, reversible where reasonable, and never silently overwrite
- The UI should prioritize the current image and visible action targets
- Stay narrow: Edit mode does triage and edits; Organize mode does ordering and naming. Neither tries to be a media library.

## Roadmap Ideas

Possible future enhancements:

- Persistent recent folders / sessions
- Drag-to-reorder inside the excluded tray (currently exclude/restore only)
- Multi-select in the Organize grid
- More image format support (HEIC, AVIF)
- Optional copy mode for Edit-mode sorting
- Saved export presets (project name templates, target folder)
- Thumbnail strip in Edit mode
