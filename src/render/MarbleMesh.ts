import * as THREE from 'three';
import { AvatarManager } from '../core/AvatarManager';
import type { MarbleState } from '../core/MarbleRunner';

export class MarbleMesh {
  public group: THREE.Group;
  public sphereMesh: THREE.Mesh;
  public selectionRingMesh: THREE.Mesh;
  public nameSprite: THREE.Sprite;
  public marbleId: number;
  public isSelected: boolean = false;
  private lastPos: THREE.Vector3 | null = null;
  private marbleColor: string;
  private marbleName: string;

  constructor(state: MarbleState) {
    this.marbleId = state.id;
    this.marbleColor = state.color;
    this.marbleName = state.name;
    this.group = new THREE.Group();

    // 1. 구체 마블 메시 (아바타 텍스처 연동)
    const radius = 0.28;
    const geom = new THREE.SphereGeometry(radius, 28, 28);
    const avatarTex = AvatarManager.getTexture(state.name, state.color);

    const mat = new THREE.MeshStandardMaterial({
      color: avatarTex ? 0xffffff : new THREE.Color(state.color),
      map: avatarTex || null,
      emissive: avatarTex ? new THREE.Color(0xffffff) : new THREE.Color(state.color),
      emissiveMap: avatarTex || null,
      emissiveIntensity: avatarTex ? 0.75 : 0.35,
      roughness: avatarTex ? 0.4 : 0.15,
      metalness: avatarTex ? 0.0 : 0.25,
    });
    this.sphereMesh = new THREE.Mesh(geom, mat);
    this.sphereMesh.castShadow = true;
    this.group.add(this.sphereMesh);

    // 1-1. 선택 하이라이트 링 (골드 펄스 링)
    const ringGeom = new THREE.TorusGeometry(0.38, 0.025, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.9,
    });
    this.selectionRingMesh = new THREE.Mesh(ringGeom, ringMat);
    this.selectionRingMesh.visible = false;
    this.group.add(this.selectionRingMesh);

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
      mat.emissiveIntensity = mat.map ? 0.55 + 0.3 * t : 0.15 + 0.35 * t;
    }

    // 대기 중이거나 아직 출발하지 않았을 때:
    // 로컬 +Z축에 위치한 앞면 얼굴이 실린더 바깥(r 방향)을 정면으로 완벽히 응시하도록 정렬
    if (!state.isActive && !state.isFinished) {
      this.sphereMesh.rotation.set(0, angle, 0);
    }

    // 3D 구르기 회전 연출 (실제 구슬이 굴러가듯이 얼굴과 함께 회전)
    const currentPos = new THREE.Vector3(x, y, z);
    if (this.lastPos && !state.isFinished && state.isActive) {
      const delta = currentPos.clone().sub(this.lastPos);
      const dist = delta.length();
      if (dist > 0.001 && dist < 1.5) {
        // 원통 표면 법선 벡터
        const normal = new THREE.Vector3(normX, 0, normZ).normalize();
        // 회전축 = 법선 x 이동변위 (진행 방향에 수직인 축으로 구름)
        const rollAxis = new THREE.Vector3().crossVectors(normal, delta);
        if (rollAxis.lengthSq() > 0.00001) {
          rollAxis.normalize();
          const rollAngle = dist / 0.28;
          const q = new THREE.Quaternion().setFromAxisAngle(rollAxis, rollAngle);
          this.sphereMesh.quaternion.premultiply(q);
        }
      }
    }
    this.lastPos = currentPos;

    // 선택 하이라이트 링 애니메이션
    if (this.isSelected && this.selectionRingMesh.visible) {
      this.selectionRingMesh.position.set(normX * 0.1, 0, normZ * 0.1);
      this.selectionRingMesh.lookAt(normX * 10, 0, normZ * 10);
      const ringScale = 1.0 + 0.12 * Math.sin(Date.now() * 0.008);
      this.selectionRingMesh.scale.set(ringScale, ringScale, ringScale);
    }

    // 완료 상태일 때 얼굴이 바깥(r 방향)을 향하도록 부드럽게 복귀 및 펄스 스케일 효과
    if (state.isFinished) {
      const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.sphereMesh.quaternion.slerp(targetQ, 0.08);
      const scale = 1.0 + 0.15 * Math.sin(Date.now() * 0.008);
      this.sphereMesh.scale.set(scale, scale, scale);
    } else {
      this.sphereMesh.scale.set(1, 1, 1);
    }
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    this.selectionRingMesh.visible = selected;
  }

  public updateAvatarTexture() {
    const avatarTex = AvatarManager.getTexture(this.marbleName, this.marbleColor);
    const mat = this.sphereMesh.material as THREE.MeshStandardMaterial;
    if (avatarTex) {
      mat.map = avatarTex;
      mat.color.setHex(0xffffff);
      mat.emissive.setHex(0xffffff);
      mat.emissiveMap = avatarTex;
      mat.emissiveIntensity = 0.75;
      mat.metalness = 0.0;
      mat.roughness = 0.4;
      mat.needsUpdate = true;
    } else {
      mat.map = null;
      mat.emissiveMap = null;
      mat.color.set(this.marbleColor);
      mat.emissive.set(this.marbleColor);
      mat.emissiveIntensity = 0.35;
      mat.metalness = 0.25;
      mat.roughness = 0.15;
      mat.needsUpdate = true;
    }
  }

  public resetRotation() {
    this.sphereMesh.quaternion.identity();
    this.lastPos = null;
  }

  public destroy() {
    this.sphereMesh.geometry.dispose();
    (this.sphereMesh.material as THREE.Material).dispose();
    this.selectionRingMesh.geometry.dispose();
    (this.selectionRingMesh.material as THREE.Material).dispose();
    this.nameSprite.material.dispose();
  }
}
