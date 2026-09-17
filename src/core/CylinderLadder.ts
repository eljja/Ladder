export interface LadderBridge {
  id: string;
  fromCol: number;
  toCol: number;
  fromY: number;
  toY: number;
  isDiagonal: boolean;
}

export interface BridgeEndpoint {
  bridge: LadderBridge;
  atCol: number;
  targetCol: number;
  enterY: number;
  exitY: number;
  isDownward: boolean;
}

export class CylinderLadder {
  public colCount: number;
  public height: number;
  public radius: number;
  public bridges: LadderBridge[] = [];

  constructor(colCount: number = 6, height: number = 12, radius: number = 3.5) {
    this.colCount = Math.max(2, colCount);
    this.height = height;
    this.radius = radius;
  }

  public setColCount(count: number) {
    this.colCount = Math.max(2, count);
    // Remove invalid bridges
    this.bridges = this.bridges.filter((b) => b.fromCol < this.colCount && b.toCol < this.colCount);
  }

  /**
   * 인접한 두 기둥인지 확인 (0번과 N-1번도 인접)
   */
  public isAdjacent(colA: number, colB: number): boolean {
    const diff = Math.abs(colA - colB);
    return diff === 1 || diff === this.colCount - 1;
  }

  /**
   * 다리 추가
   */
  public addBridge(fromCol: number, toCol: number, fromY: number, toY: number): LadderBridge | null {
    if (!this.isAdjacent(fromCol, toCol)) return null;

    // Y 범위 클리핑
    const minY = 0.8;
    const maxY = this.height - 0.8;
    const clampedFromY = Math.max(minY, Math.min(maxY, fromY));
    const clampedToY = Math.max(minY, Math.min(maxY, toY));

    // 같은 기둥의 너무 가까운 위치에 다리가 이미 있는지 확인 (최소 간격 0.35)
    const minGap = 0.35;
    const conflictFrom = this.bridges.some(
      (b) =>
        (b.fromCol === fromCol && Math.abs(b.fromY - clampedFromY) < minGap) ||
        (b.toCol === fromCol && Math.abs(b.toY - clampedFromY) < minGap)
    );
    const conflictTo = this.bridges.some(
      (b) =>
        (b.fromCol === toCol && Math.abs(b.fromY - clampedToY) < minGap) ||
        (b.toCol === toCol && Math.abs(b.toY - clampedToY) < minGap)
    );

    if (conflictFrom || conflictTo) return null;

    const isDiagonal = Math.abs(clampedFromY - clampedToY) > 0.15;
    const bridge: LadderBridge = {
      id: `bridge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fromCol,
      toCol,
      fromY: clampedFromY,
      toY: clampedToY,
      isDiagonal,
    };

    this.bridges.push(bridge);
    return bridge;
  }

  /**
   * 다리 삭제
   */
  public removeBridge(bridgeId: string): boolean {
    const idx = this.bridges.findIndex((b) => b.id === bridgeId);
    if (idx >= 0) {
      this.bridges.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 모든 다리 지우기
   */
  public clearBridges() {
    this.bridges = [];
  }

  /**
   * 특정 기둥 col에서 currentY 아래로 내려갈 때 가장 먼저 만나는 다리 진입점 탐색
   * (지나가는 연결 다리는 100% 무조건 진입하도록 보장)
   */
  public getNextBridge(col: number, currentY: number, excludeBridgeId?: string | null): BridgeEndpoint | null {
    const candidates: BridgeEndpoint[] = [];

    for (const b of this.bridges) {
      if (excludeBridgeId && b.id === excludeBridgeId) continue;

      // 1. col이 b.fromCol인 경우
      if (b.fromCol === col && b.fromY >= currentY - 0.0001) {
        candidates.push({
          bridge: b,
          atCol: col,
          targetCol: b.toCol,
          enterY: b.fromY,
          exitY: b.toY,
          isDownward: b.toY >= b.fromY,
        });
      }
      // 2. col이 b.toCol인 경우
      if (b.toCol === col && b.toY >= currentY - 0.0001) {
        candidates.push({
          bridge: b,
          atCol: col,
          targetCol: b.fromCol,
          enterY: b.toY,
          exitY: b.fromY,
          isDownward: b.fromY >= b.toY,
        });
      }
    }

    if (candidates.length === 0) return null;

    // 가장 먼저 만나는(enterY가 가장 작은) 다리 선택
    candidates.sort((a, b) => a.enterY - b.enterY);
    return candidates[0];
  }

  /**
   * 랜덤 사다리 가로선/대각선 자동 생성
   * @param density 기둥당 평균 다리 수 (기본 3.5개)
   */
  public generateRandomBridges(density: number = 3.5) {
    this.clearBridges();
    const N = this.colCount;
    const minY = 1.0;
    const maxY = this.height - 1.2;
    const availableHeight = maxY - minY;

    // 각 인접 쌍 (0,1), (1,2), ..., (N-1, 0)
    const targetBridgesPerPair = Math.max(2, Math.round(density));

    for (let c = 0; c < N; c++) {
      const nextCol = (c + 1) % N;
      const count = targetBridgesPerPair + (Math.random() > 0.5 ? 1 : 0);

      for (let i = 0; i < count; i++) {
        // 시도 횟수 제한
        for (let attempt = 0; attempt < 15; attempt++) {
          const segH = availableHeight / count;
          const baseY = minY + i * segH + (Math.random() * 0.6 + 0.2) * segH;

          // 랜덤 생성은 100% 공평한 전단사(1:1 매핑)를 보장하기 위해 수평선으로 생성
          const fromY = baseY;
          const toY = baseY;

          const added = this.addBridge(c, nextCol, fromY, toY);
          if (added) break;
        }
      }
    }
  }
}
