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
   * 클립보드 Blob 또는 File을 받아 증명사진에 최적화된 스마트 크롭 & 160x160 원형 아바타로 DataURL 반환
   */
  public static async processImageBlob(blob: Blob, zoom: number = 1.2, offsetYRatio: number = 0.43): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const size = 320;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // 인물 얼굴 중심 증명사진 스마트 크롭 계산
        const baseCropSize = Math.min(img.width, img.height);
        const cropSize = baseCropSize / Math.max(0.5, Math.min(2.5, zoom));

        // 가로는 중앙, 세로는 인물 얼굴 중심(상단 42~45% 지점)
        const cx = img.width / 2;
        const cy = img.height * offsetYRatio;

        let sx = cx - cropSize / 2;
        let sy = cy - cropSize / 2;

        // 경계 제한 (클램프)
        if (sx < 0) sx = 0;
        if (sy < 0) sy = 0;
        if (sx + cropSize > img.width) sx = Math.max(0, img.width - cropSize);
        if (sy + cropSize > img.height) sy = Math.max(0, img.height - cropSize);

        // 원형 클리핑 영역
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // 부드러운 이미지 축소 렌더링
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);

        // 부드러운 외곽선
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // WebP 압축 저장 (약 3~5KB)
        const dataUrl = canvas.toDataURL('image/webp', 0.9);
        resolve(dataUrl);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  public static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear avatars from localStorage:', e);
    }
    AvatarManager.cache.clear();
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
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 1. 기본 마블 배경색
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; // 표준 sRGB 컬러 스페이스 지정 (피부색 왜곡 방지)

    const img = new Image();
    img.onload = () => {
      const drawFace = (cx: number, cy: number, r: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ffd700';
        ctx.stroke();
        ctx.clip();

        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      };

      // Three.js SphereGeometry UV 매핑:
      // u = 0.25 (cx = 128) -> 로컬 +Z 축 (외경 법선 r 방향과 정렬되어 사용자를 정면으로 응시)
      // u = 0.75 (cx = 384) -> 로컬 -Z 축 (반대편 내경)
      // 텍스처 양쪽 끝 Seam(u=0, u=1)에 얼굴이 걸치지 않아 완전한 원형 얼굴이 바깥(r 방향)에서 가장 잘 보입니다.
      drawFace(128, 256, 115);
      drawFace(384, 256, 100);

      texture.needsUpdate = true;
    };
    img.src = avatarDataUrl;

    AvatarManager.cache.set(name, texture);
    return texture;
  }
}
