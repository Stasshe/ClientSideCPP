export type MapMethodName = "size";

export type MapMethodSpec = {
  name: MapMethodName;
  minArgs: number;
  maxArgs: number;
};

const MAP_METHOD_SPECS: Record<MapMethodName, MapMethodSpec> = {
  size: { name: "size", minArgs: 0, maxArgs: 0 },
};

export function getMapMethodSpec(name: string): MapMethodSpec | null {
  return MAP_METHOD_SPECS[name as MapMethodName] ?? null;
}

export function isMapMethodName(name: string): name is MapMethodName {
  return getMapMethodSpec(name) !== null;
}
