import * as THREE from 'three';
import type { MarbleState } from '../core/MarbleRunner';

export class MarbleMesh {
  public group: THREE.Group;
  public sphereMesh: THREE.Mesh;
  public nameSprite: THREE.Sprite;
  public marbleId: number;

  constructor(state: MarbleState) {
    this.marbleId = state.id;
    this.group = new THREE.Group();

    // 1. 구체 마블 메시
    const radius = 0.28;
    const geom = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(state.color),
      emissive: new THREE.Color(state.color),
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.4,
    });
    this.sphereMesh = new THREE.Mesh(geom, mat);
    this.sphereMesh.castShadow = true;
    this.group.add(this.sphereMesh);

    // 2. 이름표 / 이모지 스프라이트
    this.nameSprite = this.createNameSprite(state);
    this.nameSprite.position.set(0, radius + 0.35, 0);
    this.group.add(this.nameSprite);
  }

  private createNameSprite(state: MarbleState): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;

    // 배경 둥근 박스
    ctx.fillStyle = 'rgba(15, 20, 26, 0.85)';
    ctx.strokeStyle = state.color;
    ctx.lineWidth = 4;
    const r = 16;
    const w = 240;
    const h = 64;
    const x = 8;
    const y = 8;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 텍스트 / 이모지 렌더링
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#ffffff';

    const displayName = state.name.length > 8 ? `${state.name.slice(0, 7)}…` : state.name;
    ctx.fillText(displayName, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: true,
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.44, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  public updateTransform(state: MarbleState, cylinderRadius: number, cylinderHeight: number) {
    const angle = state.currentAngle;
    const r = cylinderRadius; // 공의 중심이 선(레일 및 사다리 다리)을 정확히 지나가도록 설정

    // Three.js 좌표계: Y가 위쪽
    const x = r * Math.sin(angle);
    const y = cylinderHeight / 2 - state.currentY;
    const z = r * Math.cos(angle);

    this.group.position.set(x, y, z);

    // 이름표를 원통 바깥쪽(법선 r 방향)으로 +0.42 돌출시켜 사다리 선/기둥에 가려지지 않게 처리
    const rOffset = 0.42;
    const normX = Math.sin(angle);
    const normZ = Math.cos(angle);
    this.nameSprite.position.set(normX * rOffset, 0.28 + 0.35, normZ * rOffset);

    // Z축 앞/뒤 깊이에 따른 명암 및 투명도 조절 (앞쪽은 선명하고 밝게, 뒤쪽은 은은하게)
    const t = Math.max(0, Math.min(1, (z / Math.max(0.1, r) + 1) / 2)); // 0 (뒤) ~ 1 (앞)
    this.nameSprite.material.opacity = 0.3 + 0.7 * t;
    const mat = this.sphereMesh.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.emissiveIntensity = 0.15 + 0.35 * t;
    }

    // 완료 상태일 때 살짝 펄스 스케일 효과
    if (state.isFinished) {
      const scale = 1.0 + 0.15 * Math.sin(Date.now() * 0.008);
      this.sphereMesh.scale.set(scale, scale, scale);
    } else {
      this.sphereMesh.scale.set(1, 1, 1);
    }
  }

  public destroy() {
    this.sphereMesh.geometry.dispose();
    (this.sphereMesh.material as THREE.Material).dispose();
    this.nameSprite.material.dispose();
  }
}
