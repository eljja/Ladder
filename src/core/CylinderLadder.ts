import { LadderSolver } from './LadderSolver';

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
  public taperRatio: number = 1.0; // 하단/상단 반경 비율 (기본값 1.0 = 균일 원통, <1.0 = 아래 좁아짐, >1.0 = 아래 넓어짐)
  public bridges: LadderBridge[] = [];

  constructor(colCount: number = 6, height: number = 12, radius: number = 3.5, taperRatio: number = 1.0) {
    this.colCount = Math.max(2, colCount);
    this.height = height;
    this.radius = radius;
    this.taperRatio = taperRatio;
  }

  public get radiusTop(): number {
    return this.radius;
  }

  public get radiusBottom(): number {
    return this.radius * this.taperRatio;
  }

  /**
   * 사다리 높이 yNorm (0 = 상단 출발선, height = 하단 골선)에서의 반경 계산
   */
  public getRadiusAt(yNorm: number): number {
    const t = Math.max(0, Math.min(1, yNorm / this.height));
    return this.radiusTop + (this.radiusBottom - this.radiusTop) * t;
  }

  public setTaperRatio(ratio: number) {
    this.taperRatio = Math.max(0.2, Math.min(2.5, ratio));
  }

  public setColCount(count: number) {
    this.colCount = Math.max(2, count);
    // Remove invalid bridges
    this.bridges = this.bridges.filter((b) => b.fromCol < this.colCount && b.toCol < this.colCount);
    this.ensureMinBridges();
  }

  /**
   * 특정 기둥(columnIndex)을 제거하면서 연결된 가로선 중 한쪽을 남은 이웃 기둥으로 승계/재연결
   * 양쪽 가로선이 모두 사라져서 남은 사다리가 고립되는 문제를 원천 해결
   */
  public removeColumn(colIndex: number) {
    const N = this.colCount;
    if (N <= 2 || colIndex < 0 || colIndex >= N) return;

    const K = colIndex;
    const prevCol = (K - 1 + N) % N;
    const nextCol = (K + 1) % N;
    const minGap = 0.25;

    // 1. K와 관련 없는 기존 다리 먼저 수집
    const safeBridges: LadderBridge[] = [];
    for (const b of this.bridges) {
      if (b.fromCol !== K && b.toCol !== K) {
        safeBridges.push({ ...b });
      }
    }

    // 2. K에 연결되어 있던 가로선들을 prevCol <-> nextCol로 연결 승계 (한쪽 가로선 보존)
    for (const b of this.bridges) {
      if (b.fromCol !== K && b.toCol !== K) continue;

      let candidateFrom = b.fromCol;
      let candidateTo = b.toCol;
      const candidateFromY = b.fromY;
      const candidateToY = b.toY;

      // prevCol과 연결된 다리는 nextCol로 재지정
      if (b.fromCol === prevCol || b.toCol === prevCol) {
        candidateFrom = b.fromCol === K ? nextCol : b.fromCol;
        candidateTo = b.toCol === K ? nextCol : b.toCol;
      } else if (b.fromCol === nextCol || b.toCol === nextCol) {
        // nextCol과 연결된 다리는 prevCol로 재지정
        candidateFrom = b.fromCol === K ? prevCol : b.fromCol;
        candidateTo = b.toCol === K ? prevCol : b.toCol;
      }

      if (candidateFrom === candidateTo) continue;

      // 충돌(Y 최소 간격 0.25) 검사하여 겹치지 않는 유효한 다리만 보존
      const conflictFrom = safeBridges.some(
        (sb) =>
          (sb.fromCol === candidateFrom && Math.abs(sb.fromY - candidateFromY) < minGap) ||
          (sb.toCol === candidateFrom && Math.abs(sb.toY - candidateFromY) < minGap)
      );
      const conflictTo = safeBridges.some(
        (sb) =>
          (sb.fromCol === candidateTo && Math.abs(sb.fromY - candidateToY) < minGap) ||
          (sb.toCol === candidateTo && Math.abs(sb.toY - candidateToY) < minGap)
      );

      if (!conflictFrom && !conflictTo) {
        safeBridges.push({
          ...b,
          fromCol: candidateFrom,
          toCol: candidateTo,
          fromY: candidateFromY,
          toY: candidateToY,
        });
      }
    }

    // 3. 기둥 번호 재인덱싱 (col > K 이면 col - 1로 당김)
    const shiftedBridges: LadderBridge[] = [];
    for (const b of safeBridges) {
      const f = b.fromCol > K ? b.fromCol - 1 : b.fromCol;
      const t = b.toCol > K ? b.toCol - 1 : b.toCol;
      if (f !== t && f < N - 1 && t < N - 1) {
        shiftedBridges.push({
          ...b,
          fromCol: f,
          toCol: t,
        });
      }
    }

    this.colCount = N - 1;
    this.bridges = shiftedBridges;

    // 4. 남은 사다리(특히 2개 사다리) 간 최소 가로선 개수 보장
    this.ensureMinBridges(N - 1 === 2 ? 3 : 2);
  }

  /**
   * 인접 기둥 쌍 사이에 최소 가로선 개수가 유지되도록 보충 생성
   * 특히 사다리가 2개만 남았을 때 0번과 1번 사이에 충분한 가로선이 항상 존재하도록 보장
   */
  public ensureMinBridges(minPerPair: number = 2) {
    const N = this.colCount;
    const minY = 1.0;
    const maxY = this.height - 1.2;
    const availableHeight = maxY - minY;

    for (let c = 0; c < N; c++) {
      const nextCol = (c + 1) % N;
      if (N === 2 && c === 1) break; // 2개 기둥일 때는 (0, 1) 쌍 하나만 처리

      const currentCount = this.bridges.filter(
        (b) => (b.fromCol === c && b.toCol === nextCol) || (b.fromCol === nextCol && b.toCol === c)
      ).length;

      const targetCount = N === 2 ? Math.max(3, minPerPair) : minPerPair;
      const deficit = targetCount - currentCount;

      for (let i = 0; i < deficit; i++) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const baseY = minY + Math.random() * availableHeight;
          const added = this.addBridge(c, nextCol, baseY, baseY);
          if (added) break;
        }
      }
    }

    // 1:1 매칭 무결성 검증 (혹시 모를 루프나 매칭 실패 방지)
    const solutions = LadderSolver.solveAll(this);
    const allFinished = solutions.every(
      (s) => s.path.length < 200 && s.path[s.path.length - 1].y >= this.height - 0.01
    );
    const uniqueGoals = new Set(solutions.map((s) => s.finalCol));

    if (!allFinished || uniqueGoals.size !== N) {
      this.generateRandomBridges(3.5);
    }
  }

  /**
   * 인접한 두 기둥인지 확인 (0번과 N-1번도 인접)
   */
  public isAdjacent(colA: number, colB: number): boolean {
    const diff = Math.abs(colA - colB);
    return diff === 1 || diff === this.colCount - 1;
  }

  /**
   * 다리 추가 가능 여부 및 충돌 사유 검사 (null이면 추가 가능)
   */
  public checkBridgeConflict(fromCol: number, toCol: number, fromY: number, toY: number): string | null {
    if (!this.isAdjacent(fromCol, toCol)) {
      return '인접한 기둥끼리만 연결할 수 있습니다.';
    }

    // Y 범위 클리핑
    const minY = 0.8;
    const maxY = this.height - 0.8;
    const clampedFromY = Math.max(minY, Math.min(maxY, fromY));
    const clampedToY = Math.max(minY, Math.min(maxY, toY));

    // 같은 기둥의 너무 가까운 위치에 다리가 이미 있는지 확인 (최소 간격 0.25)
    const minGap = 0.25;
    const conflictFrom = this.bridges.some(
      (b) =>
        (b.fromCol === fromCol && Math.abs(b.fromY - clampedFromY) < minGap) ||
        (b.toCol === fromCol && Math.abs(b.toY - clampedFromY) < minGap)
    );
    if (conflictFrom) {
      return '시작 위치 근처에 이미 연결된 다리가 있습니다.';
    }

    const conflictTo = this.bridges.some(
      (b) =>
        (b.fromCol === toCol && Math.abs(b.fromY - clampedToY) < minGap) ||
        (b.toCol === toCol && Math.abs(b.toY - clampedToY) < minGap)
    );
    if (conflictTo) {
      return '도착 위치 근처에 이미 연결된 다리가 있습니다.';
    }

    return null;
  }

  /**
   * 다리 추가
   */
  public addBridge(fromCol: number, toCol: number, fromY: number, toY: number): LadderBridge | null {
    const conflict = this.checkBridgeConflict(fromCol, toCol, fromY, toY);
    if (conflict) return null;

    const minY = 0.8;
    const maxY = this.height - 0.8;
    const clampedFromY = Math.max(minY, Math.min(maxY, fromY));
    const clampedToY = Math.max(minY, Math.min(maxY, toY));

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
   * 랜덤 사다리 가로선 및 대각선 다리 자동 생성
   * (대각선 다리를 포함하며, 모든 참가자가 완주하고 1:1 매칭되는 유효 배치를 검증하여 생성)
   * @param density 기둥당 평균 다리 수 (기본 3.5개)
   */
  public generateRandomBridges(density: number = 3.5) {
    const N = this.colCount;
    const minY = 1.0;
    const maxY = this.height - 1.2;
    const availableHeight = maxY - minY;
    const targetBridgesPerPair = Math.max(2, Math.round(density));

    for (let globalAttempt = 0; globalAttempt < 30; globalAttempt++) {
      this.clearBridges();

      for (let c = 0; c < N; c++) {
        const nextCol = (c + 1) % N;
        const count = targetBridgesPerPair + (Math.random() > 0.6 ? 1 : 0);

        for (let i = 0; i < count; i++) {
          for (let attempt = 0; attempt < 15; attempt++) {
            const segH = availableHeight / count;
            const baseY = minY + i * segH + (Math.random() * 0.6 + 0.2) * segH;

            // 약 35% 확률로 대각선 다리 생성 (경사각 0.4 ~ 0.5)
            const isDiagonal = Math.random() < 0.35;
            const slope = isDiagonal ? (Math.random() > 0.5 ? 0.45 : -0.45) : 0;
            const fromY = baseY;
            const toY = Math.max(minY, Math.min(maxY, baseY + slope));

            const added = this.addBridge(c, nextCol, fromY, toY);
            if (added) break;
          }
        }
      }

      // LadderSolver를 통해 모든 참가자가 루프 없이 바닥에 닿고 1:1 매칭되는지 검증
      const solutions = LadderSolver.solveAll(this);
      const allFinished = solutions.every(
        (s) => s.path.length < 200 && s.path[s.path.length - 1].y >= this.height - 0.01
      );
      const uniqueGoals = new Set(solutions.map((s) => s.finalCol));

      if (allFinished && uniqueGoals.size === N) {
        return;
      }
    }

    // fallback: 수평선 생성 (수학적 100% 보장)
    this.clearBridges();
    for (let c = 0; c < N; c++) {
      const nextCol = (c + 1) % N;
      const count = targetBridgesPerPair;
      for (let i = 0; i < count; i++) {
        for (let attempt = 0; attempt < 15; attempt++) {
          const segH = availableHeight / count;
          const baseY = minY + i * segH + (Math.random() * 0.6 + 0.2) * segH;
          const added = this.addBridge(c, nextCol, baseY, baseY);
          if (added) break;
        }
      }
    }
  }
}
