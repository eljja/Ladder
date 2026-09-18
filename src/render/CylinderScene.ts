import * as THREE from 'three';
import type { CylinderLadder, LadderBridge } from '../core/CylinderLadder';
import type { MarbleRunner } from '../core/MarbleRunner';
import { soundManager } from '../core/SoundManager';
import { MarbleMesh } from './MarbleMesh';

export class CylinderScene {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public cylinderGroup: THREE.Group;

  public ladder: CylinderLadder;
  public runner: MarbleRunner;

  private marbleMeshes: Map<number, MarbleMesh> = new Map();
  private bridgeMeshes: Map<string, THREE.Mesh> = new Map();
  private railMeshes: THREE.Mesh[] = [];
  private railHitMeshes: THREE.Mesh[] = [];
  private topRingMesh: THREE.Mesh | null = null;
  private botRingMesh: THREE.Mesh | null = null;
  private goalSprites: THREE.Sprite[] = [];
  private coreMesh: THREE.Mesh | null = null;
  public onToast?: (msg: string) => void;

  // 드래그로 다리 그리기 상태
  public isEditMode: boolean = true;
  private isDrawingBridge: boolean = false;
  private drawStartCol: number | null = null;
  private drawStartY: number = 0;
  private drawPointerStartX: number = 0;
  private drawPointerStartY: number = 0;
  private previewBridgeMesh: THREE.Mesh | null = null;

  // 수동 실린더 회전 상태
  private isDraggingToRotate: boolean = false;
  private prevPointerX: number = 0;
  private prevPointerY: number = 0;

  // 시점 모드 (정면 뷰 vs 완전 탑뷰)
  public isTopView: boolean = false;
  public targetPitch: number = 0; // X축 목표 회전각 (0 = 정면, Math.PI * 0.485 = 완전 탑뷰)

  // 카메라 줌 및 핀치 인터랙션 상태
  public hasUserManuallyZoomed: boolean = false;
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private prevPinchDist: number | null = null;
  private cameraDistance: number = 25.5;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();

  private goalNames: string[] = [];

  /**
   * 화면 크기 및 UI 오버레이에 맞춘 최적 카메라 거리 계산
   * (상단 헤더/안내 및 하단 컨트롤 바에 사다리 상/하단이 가려지지 않도록 보장)
   */
  public calculateOptimalCameraDistance(): number {
    const w = this.canvas?.clientWidth || window.innerWidth;
    const h = this.canvas?.clientHeight || window.innerHeight;
    const aspect = w / h;

    // 모바일(폭 768px 이하) 또는 세로 모드(aspect < 1.0)
    if (w <= 768 || aspect < 1.0) {
      return 29.0;
    }
    // 창 높이가 다소 낮은 모니터/노트북
    if (h < 760) {
      return 27.0;
    }
    // 일반 데스크톱 와이드 화면
    return 25.5;
  }

  public toggleTopView(): boolean {
    this.isTopView = !this.isTopView;
    this.targetPitch = this.isTopView ? Math.PI * 0.485 : 0;
    return this.isTopView;
  }

  public isCameraLocked: boolean = false;

  public toggleCameraLock(): boolean {
    this.isCameraLocked = !this.isCameraLocked;
    return this.isCameraLocked;
  }

  constructor(canvas: HTMLCanvasElement, ladder: CylinderLadder, runner: MarbleRunner) {
    this.canvas = canvas;
    this.ladder = ladder;
    this.runner = runner;
    this.cameraDistance = this.calculateOptimalCameraDistance();

    // 1. 렌더러 설정
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 2. 씬 및 카메라
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, this.cameraDistance);

    // 3. 조명 (전면 네온 강조 + 후면 은은한 필라이트)
    const ambientLight = new THREE.AmbientLight(0x223344, 1.2);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00e5ff, 1.8);
    dirLight1.position.set(0, 10, 12);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff007f, 0.4);
    dirLight2.position.set(-5, -5, -8);
    this.scene.add(dirLight2);

    // 4. 중심 실린더 그룹 (모든 사다리 부속은 이 그룹의 자식)
    this.cylinderGroup = new THREE.Group();
    this.scene.add(this.cylinderGroup);

    this.updateWorkspaceOffset();
    this.buildCylinderStructure();
    this.attachEvents();
  }

  public setGoalNames(goals: string[]) {
    this.goalNames = goals;
    this.updateGoalLabels();
  }

  /**
   * 실린더 기둥 및 장식 재구축
   */
  public buildCylinderStructure() {
    // 기존 기둥 정리
    this.railMeshes.forEach((m) => {
      this.cylinderGroup.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.railMeshes = [];

    this.railHitMeshes.forEach((m) => {
      this.cylinderGroup.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.railHitMeshes = [];

    // 기존 중심 코어 정리
    if (this.coreMesh) {
      this.cylinderGroup.remove(this.coreMesh);
      this.coreMesh.geometry.dispose();
      (this.coreMesh.material as THREE.Material).dispose();
      this.coreMesh = null;
    }

    // 기존 링 정리
    if (this.topRingMesh) {
      this.cylinderGroup.remove(this.topRingMesh);
      this.topRingMesh.geometry.dispose();
      (this.topRingMesh.material as THREE.Material).dispose();
      this.topRingMesh = null;
    }
    if (this.botRingMesh) {
      this.cylinderGroup.remove(this.botRingMesh);
      this.botRingMesh.geometry.dispose();
      (this.botRingMesh.material as THREE.Material).dispose();
      this.botRingMesh = null;
    }

    const N = this.ladder.colCount;
    const Rtop = this.ladder.radiusTop;
    const Rbot = this.ladder.radiusBottom;
    const H = this.ladder.height;

    // 1. 중심 반투명 다크 글래스 코어 (상/하단 테이퍼 반영, 구슬 중심이 선에 위치할 때 구슬 뒤쪽에 자연스럽게 배치)
    const coreOffset = 0.3;
    const coreGeom = new THREE.CylinderGeometry(
      Math.max(0.2, Rtop - coreOffset),
      Math.max(0.2, Rbot - coreOffset),
      H + 0.1,
      48,
      1,
      true
    );
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x080d16,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.coreMesh.position.set(0, 0, 0);
    this.cylinderGroup.add(this.coreMesh);

    // 2. 수직 기둥 (Rails) 생성 (상단 pTop에서 하단 pBot을 잇는 3D Tube)
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const xTop = Rtop * Math.sin(angle);
      const zTop = Rtop * Math.cos(angle);
      const xBot = Rbot * Math.sin(angle);
      const zBot = Rbot * Math.cos(angle);

      const pTop = new THREE.Vector3(xTop, H / 2, zTop);
      const pBot = new THREE.Vector3(xBot, -H / 2, zBot);
      const curve = new THREE.LineCurve3(pTop, pBot);

      // (1) 시각적 얇은 네온 레일 (반지름 0.065)
      const railGeom = new THREE.TubeGeometry(curve, 2, 0.065, 8, false);
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });

      const rail = new THREE.Mesh(railGeom, railMat);
      rail.userData = { isRail: true, colIndex: i };
      this.cylinderGroup.add(rail);
      this.railMeshes.push(rail);

      // (2) 마우스/터치 판정용 와이드 투명 히트 실린더 (반지름 0.32: 화면상 20~25px의 넉넉한 터치 영역)
      const hitGeom = new THREE.TubeGeometry(curve, 2, 0.32, 8, false);
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const hitProxy = new THREE.Mesh(hitGeom, hitMat);
      hitProxy.userData = { isRail: true, colIndex: i };
      this.cylinderGroup.add(hitProxy);
      this.railHitMeshes.push(hitProxy);
    }

    // 3. 상단 및 하단 네온 링 장식
    const topRingGeom = new THREE.TorusGeometry(Rtop, 0.08, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.5,
    });
    this.topRingMesh = new THREE.Mesh(topRingGeom, ringMat);
    this.topRingMesh.rotation.x = Math.PI / 2;
    this.topRingMesh.position.y = H / 2;
    this.cylinderGroup.add(this.topRingMesh);

    const botRingGeom = new THREE.TorusGeometry(Rbot, 0.08, 16, 64);
    this.botRingMesh = new THREE.Mesh(botRingGeom, ringMat.clone());
    this.botRingMesh.rotation.x = Math.PI / 2;
    this.botRingMesh.position.y = -H / 2;
    this.cylinderGroup.add(this.botRingMesh);

    this.rebuildBridges();
    this.updateGoalLabels();
    this.syncMarbleMeshes();
  }

  /**
   * 다리(Bridges) 3D 튜브 메시 재생성
   */
  public rebuildBridges() {
    // 기존 다리 정리
    this.bridgeMeshes.forEach((mesh) => {
      this.cylinderGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.bridgeMeshes.clear();

    for (const b of this.ladder.bridges) {
      const mesh = this.createBridgeMesh(b);
      this.cylinderGroup.add(mesh);
      this.bridgeMeshes.set(b.id, mesh);
    }
  }

  /**
   * 단일 다리 3D 곡면 튜브 생성 (원통 둘레 호를 따라 매끄럽게 연결)
   */
  private createBridgeMesh(bridge: LadderBridge, isPreview: boolean = false, isValid: boolean = true): THREE.Mesh {
    const N = this.ladder.colCount;
    const H = this.ladder.height;

    const angleA = (bridge.fromCol / N) * Math.PI * 2;
    const angleB = (bridge.toCol / N) * Math.PI * 2;

    // 원환 최단 호 계산
    let diff = angleB - angleA;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    const points: THREE.Vector3[] = [];
    const segments = 16;

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const angle = angleA + diff * t;
      const yNorm = bridge.fromY + (bridge.toY - bridge.fromY) * t;
      const y3D = H / 2 - yNorm;
      const r = this.ladder.getRadiusAt(yNorm);

      const x = r * Math.sin(angle);
      const z = r * Math.cos(angle);
      points.push(new THREE.Vector3(x, y3D, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, 16, isPreview ? 0.08 : 0.06, 8, false);

    let color: number;
    if (isPreview) {
      color = isValid ? 0xffd700 : 0xff3366; // 유효: 밝은 골드, 충돌/불가: 네온 레드
    } else {
      color = bridge.isDiagonal
        ? 0xff007f // 대각선 다리: 핫핑크
        : 0x00ffcc; // 수평 다리: 네온 민트
    }

    const tubeMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isPreview ? 0.8 : 0.6,
      roughness: 0.3,
      metalness: 0.5,
    });

    const mesh = new THREE.Mesh(tubeGeom, tubeMat);
    mesh.userData = { isBridge: true, bridgeId: bridge.id };
    return mesh;
  }

  /**
   * 하단 목적지/당첨 라벨 스프라이트 업데이트
   */
  private updateGoalLabels() {
    this.goalSprites.forEach((s) => {
      this.cylinderGroup.remove(s);
      s.material.dispose();
    });
    this.goalSprites = [];

    const N = this.ladder.colCount;
    const Rbot = this.ladder.radiusBottom;
    const H = this.ladder.height;

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const x = (Rbot + 0.35) * Math.sin(angle);
      const z = (Rbot + 0.35) * Math.cos(angle);
      const y = -H / 2 - 0.5;

      const label = this.goalNames[i] || `골 #${i + 1}`;
      const sprite = this.createGoalSprite(label);
      sprite.position.set(x, y, z);
      this.cylinderGroup.add(sprite);
      this.goalSprites.push(sprite);
    }
  }

  private createGoalSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(28, 32, 38, 0.9)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 64, 14);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px "Pretendard", sans-serif';
    ctx.fillStyle = '#ffd700';
    const display = text.length > 8 ? text.slice(0, 7) + '…' : text;
    ctx.fillText(display, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.44, 1);
    return sprite;
  }

  /**
   * 마우스 및 터치 인터랙션 이벤트 등록
   */
  private attachEvents() {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 모바일/태블릿 두 손가락 핀치 줌 감지
      if (this.activePointers.size === 2) {
        const [p1, p2] = Array.from(this.activePointers.values());
        this.prevPinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.isDrawingBridge = false;
        this.isDraggingToRotate = false;
        return;
      }
      if (this.activePointers.size > 2) return;

      this.updatePointer(e);
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;

      if (this.runner.isRunning) {
        // 레이스 중에는 클릭으로 마블 출발(개별 모드) 또는 시점 수동 조작
        const clickedMarble = this.raycastMarble();
        if (clickedMarble !== null) {
          this.runner.startSingle(clickedMarble);
        }
        return;
      }

      // 대기/준비 중일 때
      // 1. 마블 클릭 검사 (개별 출발)
      const clickedMarble = this.raycastMarble();
      if (clickedMarble !== null) {
        this.runner.startSingle(clickedMarble);
        return;
      }

      // 2. 기존 다리 클릭 시 삭제
      const clickedBridgeId = this.raycastBridge();
      if (clickedBridgeId) {
        this.ladder.removeBridge(clickedBridgeId);
        soundManager.playBridgeRemove();
        this.rebuildBridges();
        return;
      }

      // 3. 기둥 표면 클릭 시 다리 그리기 시작
      const railHit = this.raycastRail();
      if (railHit && this.isEditMode) {
        this.isDrawingBridge = true;
        this.drawStartCol = railHit.colIndex;
        this.drawStartY = railHit.ladderY;
        this.drawPointerStartX = e.clientX;
        this.drawPointerStartY = e.clientY;
      } else {
        // 빈 공간 클릭 -> 실린더 수동 회전
        this.isDraggingToRotate = true;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // 두 손가락 핀치 줌 (모바일/터치 화면)
      if (this.activePointers.size === 2) {
        const [p1, p2] = Array.from(this.activePointers.values());
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (this.prevPinchDist !== null) {
          const delta = dist - this.prevPinchDist;
          this.hasUserManuallyZoomed = true;
          this.cameraDistance = Math.max(10, Math.min(45, this.cameraDistance - delta * 0.04));
          this.camera.position.z = this.cameraDistance;
        }
        this.prevPinchDist = dist;
        return;
      }

      this.updatePointer(e);

      if (this.isDrawingBridge && this.drawStartCol !== null) {
        // 인접 기둥과의 드래그 선 실시간 프리뷰 (마우스 좌우 이동 방향 반영)
        const railHit = this.raycastRail();
        const N = this.ladder.colCount;

        const dx = e.clientX - this.drawPointerStartX;
        const leftCol = (this.drawStartCol - 1 + N) % N;
        const rightCol = (this.drawStartCol + 1) % N;

        // 드래그 방향에 따라 좌측 또는 우측 인접 기둥 선택
        let targetCol = dx < 0 ? leftCol : rightCol;
        let targetY = this.drawStartY;

        if (railHit) {
          if (this.ladder.isAdjacent(this.drawStartCol, railHit.colIndex)) {
            targetCol = railHit.colIndex;
            targetY = railHit.ladderY;
          } else if (railHit.colIndex === this.drawStartCol) {
            const dy = e.clientY - this.drawPointerStartY;
            targetY = Math.max(0.8, Math.min(this.ladder.height - 0.8, this.drawStartY + dy * 0.015));
          } else {
            targetY = railHit.ladderY;
          }
        } else {
          const dy = e.clientY - this.drawPointerStartY;
          targetY = Math.max(0.8, Math.min(this.ladder.height - 0.8, this.drawStartY + dy * 0.015));
        }

        // 충돌 여부 실시간 검사 (유효하면 밝은 골드, 충돌 시 네온 레드)
        const conflict = this.ladder.checkBridgeConflict(this.drawStartCol, targetCol, this.drawStartY, targetY);
        const isValid = !conflict;

        if (this.previewBridgeMesh) {
          this.cylinderGroup.remove(this.previewBridgeMesh);
          this.previewBridgeMesh.geometry.dispose();
          (this.previewBridgeMesh.material as THREE.Material).dispose();
          this.previewBridgeMesh = null;
        }

        this.previewBridgeMesh = this.createBridgeMesh(
          {
            id: 'preview',
            fromCol: this.drawStartCol,
            toCol: targetCol,
            fromY: this.drawStartY,
            toY: targetY,
            isDiagonal: Math.abs(this.drawStartY - targetY) > 0.15,
          },
          true,
          isValid
        );
        this.cylinderGroup.add(this.previewBridgeMesh);
      } else if (this.isDraggingToRotate) {
        // 마우스 드래그로 실린더 수동 회전 (Y축 자전 및 완전 탑뷰까지 X축 틸트 허용)
        const dx = e.clientX - this.prevPointerX;
        const dy = e.clientY - this.prevPointerY;
        this.cylinderGroup.rotation.y += dx * 0.008;
        this.cylinderGroup.rotation.x = Math.max(
          -Math.PI * 0.49,
          Math.min(Math.PI * 0.49, this.cylinderGroup.rotation.x + dy * 0.006)
        );
        this.targetPitch = this.cylinderGroup.rotation.x;
        this.isTopView = this.targetPitch > 1.1;
        this.prevPointerX = e.clientX;
        this.prevPointerY = e.clientY;
      }
    });

    const handlePointerUp = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.prevPinchDist = null;
      }
      if (this.activePointers.size > 0) return;

      if (this.isDrawingBridge && this.drawStartCol !== null) {
        const railHit = this.raycastRail();
        const N = this.ladder.colCount;

        const dx = e.clientX - this.drawPointerStartX;
        const leftCol = (this.drawStartCol - 1 + N) % N;
        const rightCol = (this.drawStartCol + 1) % N;

        let toCol = dx < 0 ? leftCol : rightCol;
        let toY = this.drawStartY;

        if (railHit && this.ladder.isAdjacent(this.drawStartCol, railHit.colIndex)) {
          toCol = railHit.colIndex;
          toY = railHit.ladderY;
        } else {
          const dy = e.clientY - this.drawPointerStartY;
          toY = Math.max(0.8, Math.min(this.ladder.height - 0.8, this.drawStartY + dy * 0.015));
        }

        // 제자리 클릭이거나 드래그 거리가 너무 짧은 경우(15px 미만이고 다른 기둥 미접촉)는 취소로 처리
        const isDraggedFarEnough = Math.abs(dx) >= 15 || (railHit && railHit.colIndex !== this.drawStartCol);

        if (isDraggedFarEnough) {
          const conflict = this.ladder.checkBridgeConflict(this.drawStartCol, toCol, this.drawStartY, toY);
          if (conflict) {
            this.onToast?.(`⚠️ ${conflict} (살짝 위/아래로 그려보세요)`);
          } else {
            const added = this.ladder.addBridge(this.drawStartCol, toCol, this.drawStartY, toY);
            if (added) {
              soundManager.playBridgeAdd();
              this.rebuildBridges();
            }
          }
        }

        if (this.previewBridgeMesh) {
          this.cylinderGroup.remove(this.previewBridgeMesh);
          this.previewBridgeMesh.geometry.dispose();
          (this.previewBridgeMesh.material as THREE.Material).dispose();
          this.previewBridgeMesh = null;
        }

        this.isDrawingBridge = false;
        this.drawStartCol = null;
      }

      this.isDraggingToRotate = false;
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // 마우스 휠 줌 (초기 줌 25.5 기준 10 ~ 45 허용)
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hasUserManuallyZoomed = true;
      this.cameraDistance = Math.max(10, Math.min(45, this.cameraDistance + e.deltaY * 0.015));
      this.camera.position.z = this.cameraDistance;
    });

    // 윈도우 리사이즈
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  private updatePointer(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastRail(): { colIndex: number; ladderY: number } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // 와이드 히트 프록시(railHitMeshes)를 대상으로 레이캐스팅하여 넉넉한 터치/클릭 영역 보장
    const intersects = this.raycaster.intersectObjects(this.railHitMeshes);

    if (intersects.length > 0) {
      // 전면 레일 우선 (월드 좌표계 Z >= -0.8인 앞쪽 레일 선택하여 뒤쪽 오클릭 방지)
      const frontHit =
        intersects.find((h) => {
          const wp = new THREE.Vector3();
          h.object.getWorldPosition(wp);
          return wp.z >= -0.8;
        }) || intersects[0];

      const colIndex = frontHit.object.userData.colIndex;
      const H = this.ladder.height;
      // 실린더 로컬 좌표계로 변환하여 실린더가 어떤 각도로 회전/기울어져 있어도 정확한 높이 산출
      const localPoint = this.cylinderGroup.worldToLocal(frontHit.point.clone());
      const ladderY = Math.max(0.8, Math.min(H - 0.8, H / 2 - localPoint.y));
      return { colIndex, ladderY };
    }
    return null;
  }

  private raycastBridge(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = Array.from(this.bridgeMeshes.values());
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      // 전면 다리 우선 선택
      const frontHit =
        intersects.find((h) => {
          const wp = new THREE.Vector3();
          h.object.getWorldPosition(wp);
          return wp.z >= -0.5;
        }) || intersects[0];

      return frontHit.object.userData.bridgeId || null;
    }
    return null;
  }

  private raycastMarble(): number | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.marbleMeshes.forEach((mm) => meshes.push(mm.sphereMesh));
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      for (const [id, mm] of this.marbleMeshes.entries()) {
        if (mm.sphereMesh === hitObj) return id;
      }
    }
    return null;
  }

  /**
   * 왼쪽 화면 영역(사이드바를 제외한 작업공간)에 맞춰 카메라 중심축 보정
   */
  public updateWorkspaceOffset() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const sidebar = document.querySelector('#sidebar');
    const isDesktop = window.innerWidth > 768;
    const isSidebarOpen = isDesktop && !sidebar?.classList.contains('collapsed');
    const sidebarWidth = isSidebarOpen ? 320 : 0;

    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    if (sidebarWidth > 0) {
      // 사이드바 너비만큼 가상 화면을 확장하여 3D 원점(0,0,0)을 왼쪽 공간 정중앙에 투영
      this.camera.setViewOffset(w + sidebarWidth, h, sidebarWidth, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  public resize() {
    this.updateWorkspaceOffset();
    if (!this.hasUserManuallyZoomed) {
      this.cameraDistance = this.calculateOptimalCameraDistance();
      this.camera.position.z = this.cameraDistance;
    }
  }

  /**
   * 카메라 줌 및 시점 초기화 (사다리 전체가 한눈에 보이는 상태로 복귀)
   */
  public resetView() {
    this.hasUserManuallyZoomed = false;
    this.cameraDistance = this.calculateOptimalCameraDistance();
    this.targetPitch = 0;
    this.isTopView = false;
    this.cylinderGroup.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, this.cameraDistance);
  }

  /**
   * 프레임 렌더링 및 동적 실린더 자전(Spin) 추적
   */
  public update(dtSeconds: number) {
    const H = this.ladder.height;
    const Rbot = this.ladder.radiusBottom;

    // 마블 메시 동기화
    this.syncMarbleMeshes();

    // 하단 목적지(골) 스프라이트의 Z축 깊이에 따른 투명도 조절 (앞쪽은 선명, 뒤쪽은 은은하게)
    this.goalSprites.forEach((sprite) => {
      const wp = new THREE.Vector3();
      sprite.getWorldPosition(wp);
      const t = Math.max(0, Math.min(1, (wp.z / (Rbot + 0.35) + 1) / 2));
      sprite.material.opacity = 0.45 + 0.55 * t;
    });

    // 목표 피치(정면 0 vs 완전 탑뷰 ~1.52)로 부드럽게 보간
    if (!this.isDraggingToRotate) {
      this.cylinderGroup.rotation.x += (this.targetPitch - this.cylinderGroup.rotation.x) * 4.0 * dtSeconds;
    }

    // 경기 진행 중: 1등/활성 마블을 향해 실린더 자전(Y축 회전) 자동 추적 (카메라 고정 모드가 아닐 때만)
    if (this.runner.isRunning && !this.isDraggingToRotate && !this.isCameraLocked) {
      const focused = this.runner.getFocusedMarble();
      if (focused) {
        // 마블의 3D 월드 각도를 카메라 정면(0도)으로 맞추기 위한 목표 실린더 회전각
        const targetRotY = -focused.currentAngle;

        // 원환 최단 각도 보간 (Wrap to [-PI, PI])
        let diff = targetRotY - this.cylinderGroup.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));

        // 천천히 부드럽게 실린더 회전 추적 (기존 7.5 -> 2.6)
        const rotSpeed = 2.6;
        this.cylinderGroup.rotation.y += diff * Math.min(1.0, rotSpeed * dtSeconds);

        // 카메라 수직 시점 추적 (완전 탑뷰일 때는 수직 이동 없이 중앙 유지, 0.28 계수로 상하단 항상 화면 유지)
        const targetCamY = this.isTopView ? 0 : (H / 2 - focused.currentY) * 0.28;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 1.8 * dtSeconds;

        // 카메라/시점 이동 중에는 마블 이동 속도를 0.5배속으로 늦춰서 안정적 관람 보장
        const angleLag = Math.abs(diff);
        if (angleLag > 0.06) {
          this.runner.trackingCatchupFactor = 0.5;
        } else if (angleLag > 0.02) {
          this.runner.trackingCatchupFactor = 0.75;
        } else {
          this.runner.trackingCatchupFactor = 1.0;
        }
      }
    } else {
      this.runner.trackingCatchupFactor = 1.0;
      if (!this.isDraggingToRotate) {
        // 대기 중이거나 카메라 고정 모드일 때 카메라 높이를 기본(0)으로 부드럽게 유지
        this.camera.position.y += (0 - this.camera.position.y) * 2.0 * dtSeconds;
        this.camera.position.z += (this.cameraDistance - this.camera.position.z) * 3.0 * dtSeconds;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private syncMarbleMeshes() {
    const H = this.ladder.height;
    const currentIds = new Set(this.runner.marbles.map((m) => m.id));

    // 없어진 마블 메시 제거
    for (const [id, mesh] of this.marbleMeshes.entries()) {
      if (!currentIds.has(id)) {
        this.cylinderGroup.remove(mesh.group);
        mesh.destroy();
        this.marbleMeshes.delete(id);
      }
    }

    // 마블 메시 생성 및 위치 갱신 (높이별 테이퍼 반경 적용)
    for (const state of this.runner.marbles) {
      let mm = this.marbleMeshes.get(state.id);
      if (!mm) {
        mm = new MarbleMesh(state);
        this.cylinderGroup.add(mm.group);
        this.marbleMeshes.set(state.id, mm);
      }
      mm.updateTransform(state, this.ladder.getRadiusAt(state.currentY), H);
    }
  }
}
