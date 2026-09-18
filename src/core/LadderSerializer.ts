import type { LadderBridge } from './CylinderLadder';

export interface LadderShareData {
  names: string[];
  goals: string[];
  bridges: LadderBridge[];
  taperRatio?: number;
}

export class LadderSerializer {
  /**
   * 사다리 상태(참가자, 골, 다리배치, 테이퍼)를 Base64 URL 해시 문자열로 인코딩
   */
  public static serialize(data: LadderShareData): string {
    const payload = {
      v: 1,
      n: data.names,
      g: data.goals,
      b: data.bridges.map((bridge) => [
        bridge.fromCol,
        bridge.toCol,
        Math.round(bridge.fromY * 100) / 100,
        Math.round(bridge.toY * 100) / 100,
      ]),
      t: data.taperRatio !== undefined ? Math.round(data.taperRatio * 100) / 100 : 1.0,
    };

    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 인코딩된 문자열을 사다리 상태 데이터로 복원
   */
  public static deserialize(encoded: string): LadderShareData | null {
    try {
      const cleanStr = encoded.trim();
      if (!cleanStr) return null;

      const binary = atob(cleanStr);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = new TextDecoder().decode(bytes);
      const data = JSON.parse(json);

      if (!data || !Array.isArray(data.n) || !Array.isArray(data.b)) {
        return null;
      }

      const bridges: LadderBridge[] = data.b.map((item: [number, number, number, number], idx: number) => ({
        id: `bridge_shared_${idx}_${Date.now()}`,
        fromCol: item[0],
        toCol: item[1],
        fromY: item[2],
        toY: item[3],
        isDiagonal: Math.abs(item[2] - item[3]) > 0.15,
      }));

      return {
        names: data.n,
        goals: Array.isArray(data.g) ? data.g : [],
        bridges,
        taperRatio: typeof data.t === 'number' ? data.t : 1.0,
      };
    } catch (err) {
      console.warn('Failed to deserialize ladder URL hash:', err);
      return null;
    }
  }

  /**
   * 현재 사다리 상태의 전체 공유 URL 반환
   */
  public static getShareUrl(data: LadderShareData): string {
    const hash = LadderSerializer.serialize(data);
    const url = new URL(window.location.href);
    url.hash = `ladder=${encodeURIComponent(hash)}`;
    return url.toString();
  }

  /**
   * 브라우저 URL 해시(#ladder=...)에서 사다리 데이터 읽어오기
   */
  public static readFromUrlHash(): LadderShareData | null {
    const hash = window.location.hash;
    if (!hash?.includes('ladder=')) return null;

    const match = hash.match(/ladder=([^&]+)/);
    if (!match?.[1]) return null;

    const encoded = decodeURIComponent(match[1]);
    return LadderSerializer.deserialize(encoded);
  }
}
