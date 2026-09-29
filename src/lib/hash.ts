import { HashKey, PhysicalServer, VirtualNode, DistributionStats, ComparativeMetrics } from '../types';

export const HASH_SPACE_MAX = 4294967295; // 2^32 - 1

// Preset distinct server palette
export const SERVER_COLORS = [
  '#3B82F6', // Blue (S0)
  '#10B981', // Emerald (S1)
  '#8B5CF6', // Purple (S2)
  '#F59E0B', // Amber (S3)
  '#EC4899', // Pink (S4)
  '#06B6D4', // Cyan (S5)
  '#F97316', // Orange (S6)
  '#84CC16', // Lime (S7)
];

/**
 * FNV-1a Hash implementation returning 32-bit unsigned integer
 */
export function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by 32-bit FNV prime 16777619
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * MurmurHash3 32-bit implementation
 */
export function murmur3Hash(key: string, seed = 0): number {
  let remainder = key.length & 3;
  let bytes = key.length - remainder;
  let h1 = seed;
  let c1 = 0xcc9e2d51;
  let c2 = 0x1b873593;
  let i = 0;

  while (i < bytes) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    i += 4;

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  let k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    case 1:
      k1 ^= key.charCodeAt(i) & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Main hashing function that maps string -> hash uint32 -> angle in degrees [0, 360)
 */
export function hashToKey(keyString: string, algo: 'murmur3' | 'fnv1a' = 'murmur3'): HashKey {
  const hashVal = algo === 'murmur3' ? murmur3Hash(keyString) : fnv1aHash(keyString);
  const hashHex = '0x' + hashVal.toString(16).padStart(8, '0').toUpperCase();
  const angle = (hashVal / HASH_SPACE_MAX) * 360;

  return {
    id: keyString,
    keyString,
    hashValue: hashVal,
    hashHex,
    angle: angle % 360,
  };
}

/**
 * Generate virtual nodes for physical servers
 */
export function generateVirtualNodes(
  servers: PhysicalServer[],
  vnodesPerServer: number,
  algo: 'murmur3' | 'fnv1a' = 'murmur3'
): VirtualNode[] {
  const vnodes: VirtualNode[] = [];

  servers.forEach((server) => {
    for (let i = 0; i < vnodesPerServer; i++) {
      // Deterministic seed for each virtual node
      const vnodeKey = `${server.id}#vn-${i}`;
      const hashVal = algo === 'murmur3' ? murmur3Hash(vnodeKey) : fnv1aHash(vnodeKey);
      const angle = (hashVal / HASH_SPACE_MAX) * 360;

      vnodes.push({
        id: `${server.id}-vn${i}`,
        physicalServerId: server.id,
        vnodeIndex: i,
        hashValue: hashVal,
        angle: angle % 360,
        color: server.color,
      });
    }
  });

  // Sort virtual nodes clockwise by angle (0 to 360 degrees)
  return vnodes.sort((a, b) => a.angle - b.angle);
}

export type RingNode = { id: string; physicalServerId: string; angle: number; hashValue: number };

/** One ring point per physical server (the basic, no-virtual-node ring), sorted clockwise. */
export function serversToRingNodes(servers: PhysicalServer[]): RingNode[] {
  return servers
    .map((s) => ({ id: s.id, physicalServerId: s.id, angle: s.angle, hashValue: s.hashValue }))
    .sort((a, b) => a.angle - b.angle);
}

/** Virtual nodes as ring nodes (generateVirtualNodes already returns them sorted). */
export function vnodesToRingNodes(vnodes: VirtualNode[]): RingNode[] {
  return vnodes.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle, hashValue: vn.hashValue }));
}

/** Index of the first node clockwise from `angle` (binary search; wraps to 0). */
function clockwiseIndex(sortedRingNodes: { angle: number }[], angle: number): number {
  let lo = 0;
  let hi = sortedRingNodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedRingNodes[mid].angle >= angle) hi = mid;
    else lo = mid + 1;
  }
  return lo === sortedRingNodes.length ? 0 : lo;
}

/**
 * Perform clockwise lookup on ring of VirtualNodes / Physical Server Nodes
 */
export function assignKeysToRingNodes(
  keys: HashKey[],
  sortedRingNodes: RingNode[]
): HashKey[] {
  if (sortedRingNodes.length === 0) return keys;

  return keys.map((key) => {
    // First node clockwise whose angle >= key.angle; past the last node it wraps to the smallest angle.
    const targetNode = sortedRingNodes[clockwiseIndex(sortedRingNodes, key.angle)];

    const previousServerId = key.assignedServerId;
    const isMoved = previousServerId !== undefined && previousServerId !== targetNode.physicalServerId;

    return {
      ...key,
      assignedServerId: targetNode.physicalServerId,
      assignedVNodeId: targetNode.id,
      previousServerId: previousServerId || targetNode.physicalServerId,
      isMoved,
    };
  });
}

/**
 * Find clockwise path/steps for single key lookup
 */
export function getLookupPath(
  key: HashKey,
  sortedRingNodes: { id: string; physicalServerId: string; angle: number; hashValue: number }[]
): {
  targetNode: { id: string; physicalServerId: string; angle: number };
  startAngle: number;
  endAngle: number;
  traversedNodesCount: number;
} | null {
  if (sortedRingNodes.length === 0) return null;

  let targetNodeIndex = sortedRingNodes.findIndex((node) => node.angle >= key.angle);
  let traversedCount = 0;

  if (targetNodeIndex === -1) {
    // Wrap around
    targetNodeIndex = 0;
    traversedCount = sortedRingNodes.length;
  } else {
    traversedCount = targetNodeIndex + 1;
  }

  const targetNode = sortedRingNodes[targetNodeIndex];

  return {
    targetNode,
    startAngle: key.angle,
    endAngle: targetNode.angle,
    traversedNodesCount: traversedCount,
  };
}

/**
 * Traditional modulo sharding assignment: hash(key) % N
 */
export function assignKeysTraditional(keys: HashKey[], servers: PhysicalServer[]): HashKey[] {
  if (servers.length === 0) return keys;

  return keys.map((key) => {
    const serverIndex = key.hashValue % servers.length;
    const assignedServer = servers[serverIndex];
    const isMoved = key.assignedServerId !== undefined && key.assignedServerId !== assignedServer.id;

    return {
      ...key,
      assignedServerId: assignedServer.id,
      assignedVNodeId: undefined,
      previousServerId: key.assignedServerId,
      isMoved,
    };
  });
}

/**
 * Compute statistical metrics (key distribution, standard deviation, max/min load)
 */
export function computeDistributionStats(
  servers: PhysicalServer[],
  keys: HashKey[],
  sortedRingNodes?: { id: string; physicalServerId: string; angle: number }[]
): ComparativeMetrics {
  const serverMap = new Map<string, number>();
  servers.forEach((s) => serverMap.set(s.id, 0));

  keys.forEach((k) => {
    if (k.assignedServerId && serverMap.has(k.assignedServerId)) {
      serverMap.set(k.assignedServerId, (serverMap.get(k.assignedServerId) || 0) + 1);
    }
  });

  const totalKeys = keys.length || 1;
  const counts = Array.from(serverMap.values());
  const mean = totalKeys / (servers.length || 1);

  // Standard deviation calculation: sqrt( sum( (x - mean)^2 ) / N )
  const variance = counts.reduce((acc, count) => acc + Math.pow(count - mean, 2), 0) / (servers.length || 1);
  const stdDeviation = Math.sqrt(variance);

  const maxCount = counts.length ? Math.max(...counts) : 0;
  const minCount = counts.length ? Math.min(...counts) : 0;

  // Calculate arc sizes if ring nodes provided
  const arcMap = new Map<string, number>();
  servers.forEach((s) => arcMap.set(s.id, 0));

  if (sortedRingNodes && sortedRingNodes.length > 0) {
    for (let i = 0; i < sortedRingNodes.length; i++) {
      const current = sortedRingNodes[i];
      const prev = sortedRingNodes[(i - 1 + sortedRingNodes.length) % sortedRingNodes.length];
      
      let arcDeg = current.angle - prev.angle;
      if (arcDeg < 0) arcDeg += 360;

      arcMap.set(current.physicalServerId, (arcMap.get(current.physicalServerId) || 0) + arcDeg);
    }
  }

  const distribution: DistributionStats[] = servers.map((s) => {
    const keyCount = serverMap.get(s.id) || 0;
    const arcDeg = sortedRingNodes && sortedRingNodes.length > 0 ? arcMap.get(s.id) || 0 : 360 / servers.length;
    return {
      serverId: s.id,
      serverName: s.name,
      color: s.color,
      keyCount,
      percentage: Number(((keyCount / totalKeys) * 100).toFixed(1)),
      vnodeCount: s.vnodesCount,
      arcCoveragePercentage: Number(((arcDeg / 360) * 100).toFixed(1)),
    };
  });

  const movedKeys = keys.filter((k) => k.isMoved).length;

  return {
    vnodes: servers[0]?.vnodesCount || 1,
    stdDeviation: Number(stdDeviation.toFixed(2)),
    maxLoadRatio: mean > 0 ? Number((maxCount / mean).toFixed(2)) : 1,
    minLoadRatio: mean > 0 ? Number((minCount / mean).toFixed(2)) : 1,
    keysMovedOnAddServer: movedKeys,
    keysMovedPercentage: Number(((movedKeys / totalKeys) * 100).toFixed(1)),
    distribution,
  };
}

/**
 * Generate batch sample keys for realistic load testing
 */
export function generateSampleKeys(count: number, prefix = 'User'): HashKey[] {
  const keys: HashKey[] = [];
  for (let i = 1; i <= count; i++) {
    keys.push(hashToKey(`${prefix}_${i}`));
  }
  return keys;
}

/**
 * Server number `idx` with a deterministic ring position: hash("Server_<idx>").
 * The same idx always lands at the same place, so demos are reproducible.
 */
export function makeServer(idx: number, vnodesCount = 1): PhysicalServer {
  const { hashValue, angle } = hashToKey(`Server_${idx}`);
  return {
    id: `S${idx}`,
    name: `Server ${idx}`,
    color: SERVER_COLORS[idx % SERVER_COLORS.length],
    hashValue,
    angle,
    vnodesCount,
  };
}

/**
 * Default initial server setup (4 physical servers)
 */
export function getDefaultServers(): PhysicalServer[] {
  return [0, 1, 2, 3].map((i) => makeServer(i));
}

/** Standard deviation expressed as % of the mean load (coefficient of variation) — the unit the book uses. */
export function stdDevPercentOfMean(stdDeviation: number, totalKeys: number, serverCount: number): number {
  const mean = totalKeys / (serverCount || 1);
  return mean > 0 ? Number(((stdDeviation / mean) * 100).toFixed(1)) : 0;
}

/** σ of each server's share of the hash space (arc), as % of the mean share. Independent of how many keys you test. */
export function arcSharePercentOfMean(stats: ComparativeMetrics): number {
  const shares = stats.distribution.map((d) => d.arcCoveragePercentage);
  const n = shares.length || 1;
  const mean = 100 / n;
  const variance = shares.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / n;
  return Number(((Math.sqrt(variance) / mean) * 100).toFixed(1));
}

/** Strip any previous assignment so a fresh mapping does not report "moved" keys. */
export function clearAssignments(keys: HashKey[]): HashKey[] {
  return keys.map(({ assignedServerId, assignedVNodeId, previousServerId, isMoved, ...rest }) => rest);
}

/** How many of `keys` change server when the modulo cluster goes from `before` to `after`. */
export function countMovedTraditional(keys: HashKey[], before: PhysicalServer[], after: PhysicalServer[]): number {
  const placed = assignKeysTraditional(clearAssignments(keys), before);
  return assignKeysTraditional(placed, after).filter((k) => k.isMoved).length;
}

/** How many of `keys` change server when the ring goes from `before` to `after` nodes. */
export function countMovedRing(keys: HashKey[], before: RingNode[], after: RingNode[]): number {
  const placed = assignKeysToRingNodes(clearAssignments(keys), before);
  return assignKeysToRingNodes(placed, after).filter((k) => k.isMoved).length;
}
