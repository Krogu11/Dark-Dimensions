import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { requestWorldZoom } from "../phaser/input/WorldInput";

interface WorldMapControlsProps {
  onOpenMap: () => void;
}

export function WorldMapControls({ onOpenMap }: WorldMapControlsProps) {
  const { t } = useTranslation();
  const map = gameSession.world.map;
  const explored = new Set(gameSession.world.state.exploredSectors);
  const isExplored = (x: number, y: number) => {
    const column = Math.floor(x / 360);
    const row = Math.floor(y / 360);
    return explored.has(`${column}:${row}`);
  };

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
          {map.terrainZones.map((zone) =>
            isExplored(zone.x, zone.y) ? (
              <ellipse
                key={zone.id}
                className={`minimap-terrain ${zone.type}`}
                cx={zone.x}
                cy={zone.y}
                rx={zone.radiusX}
                ry={zone.radiusY}
              />
            ) : null,
          )}
          {map.locations.map((location) =>
            isExplored(location.x, location.y) ? (
              <circle
                key={location.id}
                className={`minimap-location ${location.type}`}
                cx={location.x}
                cy={location.y}
                r={location.type === "city" ? 74 : 46}
              />
            ) : null,
          )}
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
          −
        </button>
      </div>
    </aside>
  );
}
