import { useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { enemiesById } from "../content/content";
import { gameSession } from "../domain/session/GameSession";
import { mergeTerrainCellsIntoRenderRects } from "../domain/world/TerrainCellRendering";

interface StrategicMapProps {
  onClose: () => void;
}

export default function StrategicMap({ onClose }: StrategicMapProps) {
  const { t } = useTranslation();
  const map = gameSession.world.map;
  const terrainRects = useMemo(
    () => mergeTerrainCellsIntoRenderRects(map.terrainCells),
    [map.terrainCells],
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const selectedLocation =
    map.locations.find((location) => location.id === selectedLocationId) ?? null;
  const visibleLocations = map.locations.filter((location) => {
    if (location.type === "city" || location.type === "village") return true;
    if (location.type !== "dungeon") return true;
    return (
      gameSession.world.isDungeonActive(location.id) &&
      gameSession.world.isPositionExplored(location.x, location.y)
    );
  });

  function placeWaypoint(event: MouseEvent<SVGSVGElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * map.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * map.height;
    gameSession.setWaypoint(x, y);
  }

  function selectLocation(
    event: MouseEvent<SVGGElement>,
    locationId: string,
  ): void {
    event.stopPropagation();
    setSelectedLocationId(locationId);
  }

  function markSelectedLocation(): void {
    if (!selectedLocation) return;
    gameSession.setWaypoint(
      selectedLocation.x,
      selectedLocation.y,
      selectedLocation.nameKey,
    );
  }

  return (
    <div className="strategic-map-overlay">
      <section className="strategic-map-panel">
        <header className="strategic-map-header">
          <div>
            <span className="eyebrow">{t("map.eyebrow")}</span>
            <h1>{t("map.title")}</h1>
            <p>{t("map.subtitle")}</p>
          </div>
          <button className="button ghost" type="button" onClick={onClose}>
            {t("map.close")}
          </button>
        </header>

        <div className="strategic-map-layout">
          <div className="strategic-map-canvas">
            <svg
              viewBox={`0 0 ${map.width} ${map.height}`}
              onClick={placeWaypoint}
              aria-label={t("map.title")}
            >
              <rect
                className="strategic-sea"
                width={map.width}
                height={map.height}
              />
              <rect
                className="strategic-land"
                x={map.boundaryInset}
                y={map.boundaryInset}
                width={map.width - map.boundaryInset * 2}
                height={map.height - map.boundaryInset * 2}
              />
              {terrainRects.map((rect) => (
                <rect
                  key={`${rect.x}:${rect.y}:${rect.width}`}
                  className={`strategic-terrain ${rect.type}`}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width + 2}
                  height={rect.height + 2}
                />
              ))}
              {map.terrainRivers.map((river) => (
                <polyline
                  key={river.id}
                  className="strategic-river"
                  points={river.points
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  style={{ strokeWidth: river.width }}
                />
              ))}
              {map.terrainRoads.map((road) => (
                <polyline
                  key={road.id}
                  className="strategic-road"
                  points={road.points
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  style={{ strokeWidth: road.width }}
                />
              ))}
              {visibleLocations.map((location) => (
                <g
                  key={location.id}
                  className={`strategic-location ${location.type}`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => selectLocation(event, location.id)}
                >
                  <circle
                    cx={location.x}
                    cy={location.y}
                    r={location.type === "city" ? 72 : 50}
                  />
                  <title>{t(location.nameKey)}</title>
                </g>
              ))}
              {gameSession.world.state.enemies.map((enemy) =>
                enemy.active ? (
                  <circle
                    key={enemy.id}
                    className="strategic-enemy"
                    cx={enemy.x}
                    cy={enemy.y}
                    r={36 + enemy.threat * 8}
                  >
                    <title>
                      {t(enemiesById.get(enemy.archetypeId)?.nameKey ?? "")}
                    </title>
                  </circle>
                ) : null,
              )}
              {gameSession.waypoint ? (
                <g className="strategic-waypoint">
                  <circle
                    cx={gameSession.waypoint.x}
                    cy={gameSession.waypoint.y}
                    r={94}
                  />
                  <line
                    x1={gameSession.world.state.x}
                    y1={gameSession.world.state.y}
                    x2={gameSession.waypoint.x}
                    y2={gameSession.waypoint.y}
                  />
                </g>
              ) : null}
              <circle
                className="strategic-player"
                cx={gameSession.world.state.x}
                cy={gameSession.world.state.y}
                r={68}
              />
            </svg>
          </div>

          <aside className="strategic-map-sidebar">
            <div className="terrain-legend">
              {[
                "plains",
                "tundra",
                "snowMountain",
                "pineForest",
                "forest",
                "darkForest",
                "grassland",
                "heath",
                "swamp",
                "bog",
                "steppe",
                "desert",
                "badlands",
                "hills",
                "mountain",
                "lake",
                "river",
                "road",
              ].map((terrain) => (
                <span key={terrain}>
                  <i className={`legend-swatch ${terrain}`} />
                  {t(`terrain.${terrain}.name`)}
                </span>
              ))}
            </div>

            {selectedLocation ? (
              <div className="map-location-detail">
                <span className="eyebrow">
                  {t(`map.locationType.${selectedLocation.type}`)}
                </span>
                <h2>{t(selectedLocation.nameKey)}</h2>
                <p>{t(selectedLocation.descriptionKey)}</p>
                <button
                  className="button primary"
                  type="button"
                  onClick={markSelectedLocation}
                >
                  {t("map.markDestination")}
                </button>
              </div>
            ) : (
              <p className="map-hint">{t("map.hint")}</p>
            )}

            {gameSession.waypoint ? (
              <button
                className="button ghost"
                type="button"
                onClick={() => gameSession.clearWaypoint()}
              >
                {t("map.clearDestination")}
              </button>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
