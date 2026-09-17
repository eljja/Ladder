import type { CylinderLadder } from './CylinderLadder';

export interface PathWaypoint {
  col: number;
  y: number;
  bridgeId?: string;
  isBridgeTraversal?: boolean;
}

export interface LadderResult {
  startCol: number;
  finalCol: number;
  path: PathWaypoint[];
}

export class LadderSolver {
  /**
   * 특정 기둥에서 시작했을 때의 전체 경로 및 최종 목적지 계산
   */
  public static solve(ladder: CylinderLadder, startCol: number): LadderResult {
    const path: PathWaypoint[] = [];
    let currentCol = startCol;
    let currentY = 0;

    // 시작점
    path.push({ col: currentCol, y: 0 });

    while (currentY < ladder.height) {
      const next = ladder.getNextBridge(currentCol, currentY);
      if (!next) {
        // 더 이상 만나는 다리가 없으면 끝까지 하강
        currentY = ladder.height;
        path.push({ col: currentCol, y: currentY });
        break;
      }

      // 다리 입구까지 이동
      currentY = next.enterY;
      path.push({ col: currentCol, y: currentY, bridgeId: next.bridge.id });

      // 다리를 건너 인접 기둥으로 이동
      currentCol = next.targetCol;
      currentY = next.exitY;
      path.push({
        col: currentCol,
        y: currentY,
        bridgeId: next.bridge.id,
        isBridgeTraversal: true,
      });
    }

    return {
      startCol,
      finalCol: currentCol,
      path,
    };
  }

  /**
   * 모든 기둥에 대한 결과 일괄 계산
   */
  public static solveAll(ladder: CylinderLadder): LadderResult[] {
    const results: LadderResult[] = [];
    for (let i = 0; i < ladder.colCount; i++) {
      results.push(this.solve(ladder, i));
    }
    return results;
  }
}
