export type ModuleType = 'chapter1' | 'chapter2' | 'chapter3' | 'rateLimiter' | 'chapter5' | 'chapter6' | 'chapter7' | 'chapter8';

export type RateLimiterAlgo = 'tokenBucket' | 'leakyBucket' | 'fixedWindow' | 'slidingLog' | 'slidingCounter';

export interface RateLimiterRequestLog {
  id: string;
  requestId: string;
  userId: string;
  timestamp: number;
  timeString: string;
  status: 'ALLOWED' | 'REJECTED';
  algorithm: RateLimiterAlgo;
  remainingTokens?: number;
  queueLength?: number;
  windowCount?: number;
  reason?: string;
  retryAfterSeconds?: number;
  responseHeaders?: {
    limit: number;
    remaining: number;
    retryAfter?: number;
  };
}

export interface HashKey {
  id: string;
  keyString: string;
  hashValue: number; // Normalized 0 - 10000 or 32-bit unsigned int
  hashHex: string;
  angle: number; // Angle on ring in degrees (0 - 360)
  assignedServerId?: string;
  assignedVNodeId?: string;
  previousServerId?: string; // To track key movement during resharding
  isMoved?: boolean;
}

export interface PhysicalServer {
  id: string;
  name: string;
  color: string;
  hashValue: number; // Primary position for V=1
  angle: number; // Primary angle for V=1
  vnodesCount: number;
}

export interface VirtualNode {
  id: string; // e.g. "S0-v1"
  physicalServerId: string;
  vnodeIndex: number;
  hashValue: number;
  angle: number;
  color: string;
}

export interface LookupStep {
  type: 'hash' | 'position' | 'search' | 'match';
  description: string;
  highlightAngle?: number;
  startAngle?: number;
  endAngle?: number;
  targetServerId?: string;
}

export interface RehashStats {
  totalKeys: number;
  movedKeys: number;
  movedPercentage: number;
  theoreticalOptimal: number;
  serverCountOld: number;
  serverCountNew: number;
}

export interface DistributionStats {
  serverId: string;
  serverName: string;
  color: string;
  keyCount: number;
  percentage: number;
  vnodeCount: number;
  arcCoveragePercentage: number;
}

export interface RequestLog {
  id: string;
  keyString: string;
  angle: number;
  hashHex: string;
  assignedServerName: string;
  assignedServerColor: string;
  timestamp: string;
}

export interface ComparativeMetrics {
  vnodes: number;
  stdDeviation: number;
  maxLoadRatio: number; // Max / Avg
  minLoadRatio: number; // Min / Avg
  keysMovedOnAddServer: number;
  keysMovedPercentage: number;
  distribution: DistributionStats[];
}
