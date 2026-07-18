import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { WORLD_DISCOVERY_CELL_SIZE } from "../domain/world/WorldSimulation";
import { getTerrainAt } from "../domain/world/WorldTerrain";
import { requestWorldZoom } from "../phaser/input/WorldInput";

interface WorldMapControlsProps {
  onOpenMap: () => void;
}

export function WorldMapControls({ onOpenMap }: WorldMapControlsProps) {
  const { t } = useTranslation();
  const map = gameSession.world.map;
  const columns = Math.ceil(map.width / WORLD_DISCOVERY_CELL_SIZE);
  const rows = Math.ceil(map.height / WORLD_DISCOVERY_CELL_SIZE);
  const terrainSectors = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * WORLD_DISCOVERY_CELL_SIZE;
    const y = row * WORLD_DISCOVERY_CELL_SIZE;
    return {
      id: `${column}:${row}`,
      x,
      y,
      type: getTerrainAt(map, x + WORLD_DISCOVERY_CELL_SIZE / 2, y + WORLD_DISCOVERY_CELL_SIZE / 2),
    };
  });
  const visibleLocations = map.locations.filter((location) => {
    if (location.type === "city" || location.type === "village") return true;
    if (location.type !== "dungeon") return true;
    return (
      gameSession.world.isDungeonActive(location.id) &&
      gameSession.world.isPositionExplored(location.x, location.y)
    );
  });

  return (
    <aside className="world-map-controls" aria-label={t("map.controls")}>
      <button
        className="minimap"
        type="button"
        onClick={onOpenMap}
        aria-label={t("map.open")}
      >
        <svg viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true">
          <rect
            className="minimap-land"
            x={map.boundaryInset}
            y={map.boundaryInset}
            width={map.width - map.boundaryInset * 2}
            height={map.height - map.boundaryInset * 2}
          />
          {terrainSectors.map((sector) => (
            <rect
              key={sector.id}
              className={`minimap-terrain ${sector.type}`}
              x={sector.x}
              y={sector.y}
              width={WORLD_DISCOVERY_CELL_SIZE + 2}
              height={WORLD_DISCOVERY_CELL_SIZE + 2}
            />
          ))}
          {visibleLocations.map((location) => (
            <circle
              key={location.id}
              className={`minimap-location ${location.type}`}
              cx={location.x}
              cy={location.y}
              r={location.type === "city" ? 74 : 46}
            />
          ))}
          {gameSession.waypoint ? (
            <circle
              className="minimap-waypoint"
              cx={gameSession.waypoint.x}
              cy={gameSession.waypoint.y}
              r={78}
            />
          ) : null}
          <circle
            className="minimap-player"
            cx={gameSession.world.state.x}
            cy={gameSession.world.state.y}
            r={72}
          />
        </svg>
        <span>{t("map.open")}</span>
      </button>
      <div className="map-zoom-controls">
        <button
          type="button"
          onClick={() => requestWorldZoom(1)}
          aria-label={t("map.zoomIn")}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => requestWorldZoom(-1)}
          aria-label={t("map.zoomOut")}
        >
          -
        </button>
      </div>
    </aside>
  );
}
