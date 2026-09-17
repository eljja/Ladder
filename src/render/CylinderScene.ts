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
  private goalSprites: THREE.Sprite[] = [];

  // 드래그로 다리 그리기 상태
  public isEditMode: boolean = true;
  private isDrawingBridge: boolean = false;
  private drawStartCol: number | null = null;
  private drawStartY: number = 0;
  private previewBridgeMesh: THREE.Mesh | null = null;

  // 수동 실린더 회전 상태
  private isDraggingToRotate: boolean = false;
  private prevPointerX: number = 0;
  private prevPointerY: number = 0;

  // 카메라 줌
  private cameraDistance: number = 11.5;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();

  private goalNames: string[] = [];

  constructor(canvas: HTMLCanvasElement, ladder: CylinderLadder, runner: MarbleRunner) {
    this.canvas = canvas;
    this.ladder = ladder;
    this.runner = runner;

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

    // 3. 조명 (사이버펑크 네온 앰비언트 + 포인트 라이트)
    const ambientLight = new THREE.AmbientLight(0x223344, 1.2);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00e5ff, 1.5);
    dirLight1.position.set(5, 10, 8);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff007f, 1.2);
    dirLight2.position.set(-5, -5, -6);
    this.scene.add(dirLight2);

    // 4. 중심 실린더 그룹 (모든 사다리 부속은 이 그룹의 자식)
    this.cylinderGroup = new THREE.Group();
    this.scene.add(this.cylinderGroup);

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

    const N = this.ladder.colCount;
    const R = this.ladder.radius;
    const H = this.ladder.height;

    // 수직 기둥 (Rails) 생성
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const x = R * Math.sin(angle);
      const z = R * Math.cos(angle);

      const railGeom = new THREE.CylinderGeometry(0.065, 0.065, H, 16);
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });

      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(x, 0, z);
      rail.userData = { isRail: true, colIndex: i };
      this.cylinderGroup.add(rail);
      this.railMeshes.push(rail);
    }

    // 상단 및 하단 네온 링 장식
    const ringGeom = new THREE.TorusGeometry(R, 0.08, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.5,
    });
    const topRing = new THREE.Mesh(ringGeom, ringMat);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = H / 2;
    this.cylinderGroup.add(topRing);

    const botRing = new THREE.Mesh(ringGeom.clone(), ringMat.clone());
    botRing.rotation.x = Math.PI / 2;
    botRing.position.y = -H / 2;
    this.cylinderGroup.add(botRing);

    this.rebuildBridges();
    this.updateGoalLabels();
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
  private createBridgeMesh(bridge: LadderBridge, isPreview: boolean = false): THREE.Mesh {
    const N = this.ladder.colCount;
    const R = this.ladder.radius;
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

      const x = R * Math.sin(angle);
      const z = R * Math.cos(angle);
      points.push(new THREE.Vector3(x, y3D, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, 16, isPreview ? 0.08 : 0.06, 8, false);

    const color = isPreview
      ? 0xffd700
      : bridge.isDiagonal
        ? 0xff007f // 대각선 다리: 핫핑크
        : 0x00ffcc; // 수평 다리: 네온 민트

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
    const R = this.ladder.radius;
    const H = this.ladder.height;

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const x = (R + 0.35) * Math.sin(angle);
      const z = (R + 0.35) * Math.cos(angle);
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
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
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
      } else {
        // 빈 공간 클릭 -> 실린더 수동 회전
        this.isDraggingToRotate = true;
      }
    });

    window.addEventListener('pointermove', (e) => {
      this.updatePointer(e);

      if (this.isDrawingBridge && this.drawStartCol !== null) {
        // 인접 기둥과의 드래그 선 실시간 프리뷰
        const railHit = this.raycastRail();
        const N = this.ladder.colCount;
        const targetCol = (this.drawStartCol + 1) % N; // 기본 다음 기둥
        const targetY = railHit ? railHit.ladderY : this.drawStartY;

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
          true
        );
        this.cylinderGroup.add(this.previewBridgeMesh);
      } else if (this.isDraggingToRotate) {
        // 마우스 드래그로 실린더 수동 회전 (Y축 자전 및 미세한 X축 틸트)
        const dx = e.clientX - this.prevPointerX;
        const dy = e.clientY - this.prevPointerY;
        this.cylinderGroup.rotation.y += dx * 0.008;
        this.cylinderGroup.rotation.x = Math.max(-0.4, Math.min(0.4, this.cylinderGroup.rotation.x + dy * 0.005));
        this.prevPointerX = e.clientX;
        this.prevPointerY = e.clientY;
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.isDrawingBridge && this.drawStartCol !== null) {
        const railHit = this.raycastRail();
        const N = this.ladder.colCount;

        // 인접 기둥으로 드래그를 마쳤을 때 다리 생성
        let toCol = (this.drawStartCol + 1) % N;
        let toY = this.drawStartY;

        if (railHit && this.ladder.isAdjacent(this.drawStartCol, railHit.colIndex)) {
          toCol = railHit.colIndex;
          toY = railHit.ladderY;
        }

        const added = this.ladder.addBridge(this.drawStartCol, toCol, this.drawStartY, toY);
        if (added) {
          soundManager.playBridgeAdd();
          this.rebuildBridges();
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
    });

    // 마우스 휠 줌
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(6, Math.min(22, this.cameraDistance + e.deltaY * 0.01));
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
    const intersects = this.raycaster.intersectObjects(this.railMeshes);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const colIndex = hit.object.userData.colIndex;
      // 3D Y -> Ladder Y 변환
      const H = this.ladder.height;
      const ladderY = H / 2 - hit.point.y;
      return { colIndex, ladderY };
    }
    return null;
  }

  private raycastBridge(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = Array.from(this.bridgeMeshes.values());
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      return intersects[0].object.userData.bridgeId || null;
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

  public resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 프레임 렌더링 및 동적 실린더 자전(Spin) 추적
   */
  public update(dtSeconds: number) {
    const H = this.ladder.height;

    // 마블 메시 동기화
    this.syncMarbleMeshes();

    // 경기 진행 중: 1등/활성 마블을 향해 실린더 자전(Y축 회전) 자동 추적
    if (this.runner.isRunning && !this.isDraggingToRotate) {
      const focused = this.runner.getFocusedMarble();
      if (focused) {
        // 마블의 3D 월드 각도를 카메라 정면(0도)으로 맞추기 위한 목표 실린더 회전각
        const targetRotY = -focused.currentAngle;

        // 원환 최단 각도 보간 (Wrap to [-PI, PI])
        let diff = targetRotY - this.cylinderGroup.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.cylinderGroup.rotation.y += diff * Math.min(1.0, 7.5 * dtSeconds);

        // 카메라 수직 시점도 마블의 하강을 살짝 추적 (카메라 상하 이동)
        const targetCamY = (H / 2 - focused.currentY) * 0.45;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 4.0 * dtSeconds;
      }
    } else if (!this.runner.isRunning && !this.isDraggingToRotate) {
      // 대기 중일 때 카메라 천천히 원래 높이(0)로 복귀
      this.camera.position.y += (0 - this.camera.position.y) * 3.0 * dtSeconds;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private syncMarbleMeshes() {
    const H = this.ladder.height;
    const R = this.ladder.radius;
    const currentIds = new Set(this.runner.marbles.map((m) => m.id));

    // 없어진 마블 메시 제거
    for (const [id, mesh] of this.marbleMeshes.entries()) {
      if (!currentIds.has(id)) {
        this.cylinderGroup.remove(mesh.group);
        mesh.destroy();
        this.marbleMeshes.delete(id);
      }
    }

    // 마블 메시 생성 및 위치 갱신
    for (const state of this.runner.marbles) {
      let mm = this.marbleMeshes.get(state.id);
      if (!mm) {
        mm = new MarbleMesh(state);
        this.cylinderGroup.add(mm.group);
        this.marbleMeshes.set(state.id, mm);
      }
      mm.updateTransform(state, R, H);
    }
  }
}
