# Georigami

Fold a real city map into the abstract geometry of its transit diagram (or anything else).

Drop a geographic image and a schematic metro map side-by-side, pin matching landmarks on each, and Georigami warps the geography to fit the schematic.

## Usage

1. **Load images:** Drag-and-drop your schematic on the left and your geographic image on the right.
2. **Pin control points:** click a landmark on the geographic image, then click its matching location on the schematic.
3. **Export:** click **Export PNG** to download the warped geographic image at full resolution, from a choice of methods.

## Develop

```bash
bun install
bun run dev
```

## Test

```bash
bun run test         # unit + visual regression (Vitest)
bun run test:e2e     # end-to-end happy path (Playwright)
```

## Build

```bash
bun run build
```
