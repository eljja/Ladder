import type { CylinderLadder, LadderBridge } from './CylinderLadder';
import { soundManager } from './SoundManager';

export interface MarbleState {
  id: number;
  name: string;
  color: string;
  emoji?: string;
  startCol: number;
  currentCol: number;
  currentY: number;
  isActive: boolean;
  isFinished: boolean;
  finalCol?: number;
  // 다리 건너기 상태
  isTraversingBridge: boolean;
  activeBridge?: LadderBridge;
  lastBridgeId?: string | null;
  bridgeProgress: number; // 0 ~ 1
  bridgeEnterCol: number;
  bridgeTargetCol: number;
  bridgeEnterY: number;
  bridgeExitY: number;
  // 현재 3D 원통 상의 실제 각도 (theta)
  currentAngle: number;
}

export type RunnerMode = 'simultaneous' | 'individual';

export class MarbleRunner extends EventTarget {
  public ladder: CylinderLadder;
  public marbles: MarbleState[] = [];
  public mode: RunnerMode = 'simultaneous';
  public speedMultiplier: number = 1.0;
  public trackingCatchupFactor: number = 1.0; // 카메라/시점 이동 중 0.5배속 감속용
  public isRunning: boolean = false;
  public singleActiveId: number | null = null;

  constructor(ladder: CylinderLadder) {
    super();
    this.ladder = ladder;
  }

  public setParticipants(names: string[]) {
    this.marbles = [];
    const N = this.ladder.colCount;

    names.forEach((rawName, idx) => {
      const col = idx % N;
      const emojiMatch = rawName.match(/^\p{Extended_Pictographic}/u);
      const emoji = emojiMatch ? emojiMatch[0] : undefined;
      const hue = (360 / Math.max(names.length, 1)) * idx;
      const color = `hsl(${hue}, 100%, 65%)`;

      this.marbles.push({
        id: idx,
        name: rawName,
        color,
        emoji,
        startCol: col,
        currentCol: col,
        currentY: 0,
        isActive: false,
        isFinished: false,
        isTraversingBridge: false,
        lastBridgeId: null,
        bridgeProgress: 0,
        bridgeEnterCol: col,
        bridgeTargetCol: col,
        bridgeEnterY: 0,
        bridgeExitY: 0,
        currentAngle: (col / N) * Math.PI * 2,
      });
    });
  }

  /**
   * 전체 동시 출발
   */
  public startSimultaneous() {
    this.mode = 'simultaneous';
    this.singleActiveId = null;
    this.isRunning = true;
    this.marbles.forEach((m) => {
      m.isActive = true;
      m.isFinished = false;
      m.currentY = 0;
      m.currentCol = m.startCol;
      m.isTraversingBridge = false;
      m.lastBridgeId = null;
    });
    this.dispatchEvent(new CustomEvent('start', { detail: { mode: 'simultaneous' } }));
  }

  /**
   * 개별 마블 단독 출발 (터치/클릭한 마블만)
   */
  public startSingle(marbleId: number) {
    const target = this.marbles.find((m) => m.id === marbleId);
    if (!target || target.isFinished) return;

    this.mode = 'individual';
    this.singleActiveId = marbleId;
    this.isRunning = true;
    target.isActive = true;
    target.isFinished = false;
    target.currentY = 0;
    target.currentCol = target.startCol;
    target.isTraversingBridge = false;
    target.lastBridgeId = null;

    this.dispatchEvent(
      new CustomEvent('start', {
        detail: { mode: 'individual', targetId: marbleId },
      })
    );
  }

  /**
   * 모든 마블 초기화
   */
  public reset() {
    this.isRunning = false;
    this.singleActiveId = null;
    const N = this.ladder.colCount;
    this.marbles.forEach((m) => {
      m.isActive = false;
      m.isFinished = false;
      m.currentY = 0;
      m.currentCol = m.startCol;
      m.isTraversingBridge = false;
      m.lastBridgeId = null;
      m.bridgeProgress = 0;
      m.currentAngle = (m.startCol / N) * Math.PI * 2;
    });
  }

  /**
   * 현재 1등 마블(가장 아래에 있는 마블) 또는 단독 실행 중인 마블 반환
   */
  public getFocusedMarble(): MarbleState | null {
    if (this.mode === 'individual' && this.singleActiveId !== null) {
      return this.marbles.find((m) => m.id === this.singleActiveId) || null;
    }

    // 동시 모드: 활성화된 마블 중 Y가 가장 큰(가장 많이 내려간) 마블
    const activeMarbles = this.marbles.filter((m) => m.isActive && !m.isFinished);
    if (activeMarbles.length === 0) {
      // 완료된 마블 중 가장 마지막에 완료된 마블 또는 첫번째 마블
      return this.marbles[0] || null;
    }

    let leader = activeMarbles[0];
    for (let i = 1; i < activeMarbles.length; i++) {
      if (activeMarbles[i].currentY > leader.currentY) {
        leader = activeMarbles[i];
      }
    }
    return leader;
  }

  /**
   * 프레임 업데이트
   */
  public update(dtSeconds: number) {
    if (!this.isRunning) return;

    // 최대 0.016초(60fps) 단위로 서브스텝 분할하여 고속 배속(3x) 및 프레임 드랍 시에도 완벽한 물리 정밀도 유지
    const effectiveDt = dtSeconds * this.trackingCatchupFactor;
    const maxSubStep = 0.016;
    const subSteps = Math.max(1, Math.min(8, Math.ceil(effectiveDt / maxSubStep)));
    const subDt = effectiveDt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this._subStepUpdate(subDt);
      if (!this.isRunning) break;
    }
  }

  private _subStepUpdate(dt: number) {
    const N = this.ladder.colCount;
    const baseSpeed = 2.4 * this.speedMultiplier; // 기본 하강 속도
    let anyRunning = false;

    for (const m of this.marbles) {
      if (!m.isActive || m.isFinished) continue;
      anyRunning = true;

      if (m.isTraversingBridge) {
        // 다리를 건너는 중
        const bridgeSpeed = 2.1 * this.speedMultiplier;
        m.bridgeProgress += bridgeSpeed * dt;

        if (m.bridgeProgress >= 1.0) {
          // 다리 건너기 완료 -> 대상 기둥 도착
          m.bridgeProgress = 1.0;
          m.currentCol = m.bridgeTargetCol;
          m.currentY = m.bridgeExitY;
          m.isTraversingBridge = false;
          m.currentAngle = (m.currentCol / N) * Math.PI * 2;
        } else {
          // 다리 중간 위치 보간
          const angleA = (m.bridgeEnterCol / N) * Math.PI * 2;
          const angleB = (m.bridgeTargetCol / N) * Math.PI * 2;

          // 원통 원환 최단 호(Shortest Arc) 보간
          let diff = angleB - angleA;
          if (diff > Math.PI) diff -= Math.PI * 2;
          if (diff < -Math.PI) diff += Math.PI * 2;

          m.currentAngle = angleA + diff * m.bridgeProgress;
          m.currentY = m.bridgeEnterY + (m.bridgeExitY - m.bridgeEnterY) * m.bridgeProgress;
        }
      } else {
        // 기둥을 타고 수직 하강 중 (이전에 방금 나온 다리는 excludeBridgeId로 전달하여 무한루프 방지)
        m.currentAngle = (m.currentCol / N) * Math.PI * 2;
        const nextBridge = this.ladder.getNextBridge(m.currentCol, m.currentY, m.lastBridgeId);

        if (nextBridge && m.currentY + baseSpeed * dt >= nextBridge.enterY) {
          // 다리 입구 도달!
          m.currentY = nextBridge.enterY;
          m.isTraversingBridge = true;
          m.activeBridge = nextBridge.bridge;
          m.lastBridgeId = nextBridge.bridge.id;
          m.bridgeProgress = 0;
          m.bridgeEnterCol = m.currentCol;
          m.bridgeTargetCol = nextBridge.targetCol;
          m.bridgeEnterY = nextBridge.enterY;
          m.bridgeExitY = nextBridge.exitY;

          soundManager.playSlide(1.0 + (m.id % 5) * 0.1);
        } else {
          m.currentY += baseSpeed * dt;
          if (m.currentY >= this.ladder.height) {
            // 골인 도달!
            m.currentY = this.ladder.height;
            m.isFinished = true;
            m.finalCol = m.currentCol;
            soundManager.playGoal();
            this.dispatchEvent(new CustomEvent('marbleGoal', { detail: { marble: m } }));
          }
        }
      }
    }

    if (!anyRunning) {
      this.isRunning = false;
      const allFinished = this.marbles.every((m) => m.isFinished);
      if (allFinished) {
        this.dispatchEvent(new CustomEvent('allFinish'));
      } else if (this.mode === 'individual') {
        const finished = this.marbles.find((m) => m.id === this.singleActiveId);
        this.singleActiveId = null;
        this.dispatchEvent(new CustomEvent('singleFinish', { detail: { marble: finished } }));
      }
    }
  }
}
