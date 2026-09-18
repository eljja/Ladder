import * as THREE from 'three';

const STORAGE_KEY = 'marble_face_avatars';

export class AvatarManager {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  public static getAll(): Record<string, string> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  public static getAvatar(name: string): string | null {
    if (!name) return null;
    const cleanName = name.trim();
    const map = AvatarManager.getAll();
    return map[cleanName] || null;
  }

  public static setAvatar(name: string, dataUrl: string): void {
    if (!name) return;
    const cleanName = name.trim();
    const map = AvatarManager.getAll();
    map[cleanName] = dataUrl;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to save avatar to localStorage:', e);
    }
    AvatarManager.cache.delete(cleanName);
  }

  public static removeAvatar(name: string): void {
    if (!name) return;
    const cleanName = name.trim();
    const map = AvatarManager.getAll();
    delete map[cleanName];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to update localStorage after avatar removal:', e);
    }
    AvatarManager.cache.delete(cleanName);
  }

  /**
   * 클립보드 Blob을 받아 중앙 정사각형 크롭 & 160x160 원형 아바타로 리사이즈하여 DataURL 반환
   */
  public static async processImageBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // 중앙 정사각형 크롭 영역 계산 (증명사진 인물 중심)
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // 원형 클리핑 영역
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // 부드러운 이미지 축소 렌더링
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        // WebP 압축 저장 (약 3~5KB)
        const dataUrl = canvas.toDataURL('image/webp', 0.88);
        resolve(dataUrl);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  /**
   * Three.js 3D Sphere에 매핑할 CanvasTexture 생성
   */
  public static getTexture(name: string, baseColor: string): THREE.CanvasTexture | null {
    const avatarDataUrl = AvatarManager.getAvatar(name);
    if (!avatarDataUrl) return null;

    const cached = AvatarManager.cache.get(name);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // 1. 기본 마블 배경색
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);

    const img = new Image();
    img.onload = () => {
      const drawFace = (cx: number, cy: number, r: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffd700';
        ctx.stroke();
        ctx.clip();

        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      };

      // 앞면 (128, 128) 및 뒷면 (0/256) 모두에 얼굴 배치하여 360도 회전 시 어디서든 얼굴이 잘 보이도록 처리
      drawFace(128, 128, 75);
      drawFace(0, 128, 65);
      drawFace(256, 128, 65);

      texture.needsUpdate = true;
    };
    img.src = avatarDataUrl;

    AvatarManager.cache.set(name, texture);
    return texture;
  }
}
