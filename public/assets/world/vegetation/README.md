# World Vegetation

These transparent SVG files are the editable source assets used directly by the world-map chunk renderer.

## Prototype sets

- Forest: `forest-oak-cluster.svg`, `forest-pine-group.svg`, `forest-dead-tree.svg`
- Plains: `plains-grass.svg`, `plains-shrub.svg`, `plains-standing-stones.svg`
- Mountains: `mountain-crag.svg`, `mountain-ridge.svg`, `mountain-boulders.svg`

You can edit them in Inkscape, Illustrator, Affinity Designer, or a text editor. Keep each existing `viewBox` unless the corresponding `width` and `height` values in `WorldScene.ts` are updated as well. Transparent backgrounds and generous padding prevent visible boxes on the map.
