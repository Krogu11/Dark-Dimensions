# Dark Dimensions Assets

- `source/` contains original editable assets.
- `source/world/locations/` contains world-map location source images such as `townred.png` and `villagered.png`.
- `source/cards/` is reserved for future card artwork sources.
- `../public/assets/` contains optimized runtime assets loaded by the game.
- `../public/assets/world/locations/*-red.png` are transparent archival runtime cutouts.
- `../public/assets/world/locations/*-red-map.png` are downsampled world-map sprites to avoid zoom shimmer.
- `../public/assets/world/locations/*-map.png` contains optimized world-map sprites for discovered dungeon camps.
