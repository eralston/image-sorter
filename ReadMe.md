# Image Sorter

Image Sorter is a Windows desktop app for quickly reviewing a folder of images and sorting them into subfolders one image at a time. The app is designed for a simple, repetitive workflow where the user sees one large image, then drags it into the correct destination folder without losing momentum.

## Goal

Make manual image triage fast and low-friction.

The primary user journey is:

1. Open a folder full of images
2. Create one or more subfolders to sort them into
3. View images one by one in a large preview
4. Drag the current image into one of the visible destination folders
5. Continue until the source folder has been sorted

## Version 1 Scope

Version 1 is intentionally narrow. It focuses on the core sorting loop rather than becoming a full media management tool.

Included in v1:
- Open a source folder from the local file system
- Detect supported image files in that folder
- Display one image at a time in a large viewer
- Show destination subfolders as visible sorting targets
- Create new destination subfolders from within the app
- Move the current image into a selected subfolder
- Automatically advance to the next remaining image
- Keyboard shortcuts for navigation and undo
- Undo the most recent sorting action, or a small bounded undo stack if implemented that way
- Clear error handling for common file operation failures

Not included in v1:
- Bulk multi-image sorting
- Tagging or labeling
- Metadata editing
- Duplicate detection
- Recursive library management
- Cloud sync
- RAW or HEIC-specific workflow support
- Advanced cataloging or search features

## Planned Features

### Core sorting workflow
- Open a folder containing images
- Load images in a stable order
- Present a large preview of the current image
- Keep destination subfolders visible during sorting
- Move files directly on disk when they are sorted

### Folder management
- Discover existing subfolders in the selected folder
- Create new subfolders from the app
- Validate folder names for Windows compatibility

### Productivity
- Next and previous image navigation
- Keyboard shortcuts for common actions
- Undo for accidental moves
- Optional click-to-sort fallback if drag-and-drop proves awkward in practice

### Image editing (auto color correction & cropping)

For batches of old or scanned photos, two lightweight in-place edits are
available right next to the sorting workflow. Both edits write back to the
original file and are intentionally simple — there is no edit history beyond a
single shared backup of the unmodified original.

- **Auto color correct** (`✨ Auto-correct` button, **C** key): a general-purpose,
  per-image automatic color correction. Internally this runs ImageMagick with
  `-auto-orient -auto-level -auto-gamma -contrast-stretch 0.5%x0.5%`. The
  per-channel `-auto-level` is the key step — it stretches each RGB channel
  independently, which removes the kind of color cast that scanned photos
  typically pick up over time. JPEGs are re-encoded at quality 92.
- **Crop** (`✂ Crop` button, **X** key): click and drag anywhere over the image
  to draw a selection rectangle, then press **X** (or click the button) to crop
  the file to that rectangle. **Esc** clears an in-progress selection. The drag
  start and end points are clamped to the displayed image bounds, so it is fine
  to begin or end the drag in the dark letterbox area outside the photo —
  selections still snap to the nearest edge pixel.
- **Revert** (`↶ Revert` button, **Shift+C** key): restores the file from its
  `.orig` backup, undoing all auto-correction and cropping in one step.

Backup behavior:

- The first destructive edit (correct or crop) on a file copies it to a sibling
  named `<photo>.orig.<ext>` (for example `IMG_0001.orig.jpg`).
- Subsequent edits on the same image leave that backup untouched, so it always
  represents the true pre-edit original.
- Backup files are hidden from the sortable image list, so they don't clutter
  the sorting flow.
- Revert consumes the backup; after a revert the file is back to its original
  state and a new edit will create a fresh backup.

### ImageMagick requirement

Auto-correct and crop both shell out to **ImageMagick 7** (`magick.exe`). The
rest of the app — opening folders, sorting, undo, rotation — works without it.

Install ImageMagick from <https://imagemagick.org/script/download.php#windows>.
The official Windows installer's "Add application directory to your system
path" option is convenient but not required.

The app discovers `magick.exe` in this order, the first time you trigger an
edit in a session (the result is cached):

1. Plain `magick` on `PATH`.
2. Any `ImageMagick-*\magick.exe` directly under `%ProgramFiles%`,
   `%ProgramW6432%`, or `%ProgramFiles(x86)%`. When multiple versions are
   installed, the lexically highest (typically the newest) is preferred.

If neither lookup succeeds, the app surfaces a clear error in the status bar
explaining that ImageMagick must be installed and the app restarted.

### Reliability
- Graceful handling of missing files
- Clear feedback for permission issues or invalid operations
- Protection against common Windows filename and folder-name problems

## Technical Direction

This project is planned as a Windows-only desktop app built with Electron and React.

Planned stack:
- Electron for the desktop shell and filesystem access
- React for the renderer UI
- TypeScript across the app
- Electron preload script with context isolation enabled
- IPC boundary between renderer and main process for file operations

Planned architecture:
- Main process: window lifecycle, filesystem operations, folder scanning, file move, undo
- Preload: safe renderer API exposed through the context bridge
- Renderer: image viewer, folder targets, drag-and-drop UI, session state, keyboard shortcuts
- Shared types: contracts for images, folders, move history, and app state

## Expected Project Structure

Planned structure:

- package.json: scripts, dependencies, build tooling
- tsconfig.json: shared TypeScript configuration
- src/main/main.ts: Electron startup and window creation
- src/main/ipc-handlers.ts: IPC endpoints for open folder, create folder, move, undo
- src/main/file-manager.ts: filesystem logic and validation
- src/preload/index.ts: safe API surface for the renderer
- src/renderer/App.tsx: top-level app layout
- src/renderer/components/ImageViewer.tsx: large single-image presentation
- src/renderer/components/DestinationFolders.tsx: folder targets and folder creation UI
- src/renderer/hooks/useSortSession.ts: session and queue state
- src/renderer/hooks/useKeyboardShortcuts.ts: keyboard bindings
- src/shared/types.ts: shared contracts

## Supported File Behavior

Planned default behavior:
- Sorting moves files into the selected destination subfolder
- The source folder loses the file once it is sorted
- Undo moves the file back to its original location when possible

Planned initial supported formats:
- JPG
- JPEG
- PNG
- WEBP
- GIF

Additional formats may be added later.

## Windows Considerations

This app is optimized for Windows and is expected to handle:
- Invalid folder names using Windows-safe validation
- Permission failures with clear user-facing errors
- Missing files without crashing the session
- Target collisions through explicit error handling or naming policy
- Long or awkward paths as a known implementation concern to validate during testing

## Development Status

This project is currently in planning and early setup.

Current status:
- Product scope defined
- Core user workflow defined
- Desktop stack selected: Electron + React
- Version 1 feature boundaries defined
- Implementation plan prepared

## Development Plan

High-level implementation phases:
1. Scaffold the Electron + React + TypeScript project
2. Define shared app contracts and IPC boundaries
3. Implement main-process filesystem operations
4. Build the renderer layout and one-by-one image viewer
5. Add drag-and-drop sorting
6. Add keyboard shortcuts and undo
7. Validate the end-to-end Windows workflow
8. Finalize documentation and packaging

## Local Development

The exact commands will be added once the project is scaffolded. The intended development workflow is:

1. Install dependencies
2. Start the React renderer in development mode
3. Launch Electron against the local renderer
4. Test with a real folder of sample images on Windows

This section will be updated with concrete commands after the initial project setup is in place.

## Design Principles

This project is being built around a few constraints:
- Fast single-image decision making is more important than batch features
- The app should stay usable with minimal setup
- Filesystem operations should be explicit and reliable
- The UI should prioritize the current image and visible sort targets
- Version 1 should stay narrow and avoid feature creep

## Roadmap Ideas

Possible future enhancements:
- Bounded multi-step undo history
- Quick sort hotkeys mapped to folders
- Persistent recent folders
- More image format support
- Thumbnail strip or queue preview
- Optional copy mode instead of move mode
- Bulk selection workflows
- Better collision handling options