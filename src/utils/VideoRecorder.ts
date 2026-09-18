function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export class VideoRecorder {
  private targetCanvas: HTMLCanvasElement;
  private mediaRecorder: MediaRecorder | null = null;
  private videoStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private selectedMimeType: string = 'video/webm';
  private fileExtension: string = 'webm';

  constructor(canvas: HTMLCanvasElement) {
    this.targetCanvas = canvas;
  }

  public get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  public static isSupported(): boolean {
    return (
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof (HTMLCanvasElement.prototype as any).captureStream === 'function' &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  public async start(): Promise<boolean> {
    if (this.isRecording) return true;
    if (!VideoRecorder.isSupported()) return false;

    try {
      this.videoStream = this.targetCanvas.captureStream(60);

      // 브라우저별 최적 지원 코덱 선택
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        this.selectedMimeType = 'video/mp4';
        this.fileExtension = 'mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        this.selectedMimeType = 'video/webm;codecs=vp9';
        this.fileExtension = 'webm';
      } else {
        this.selectedMimeType = 'video/webm';
        this.fileExtension = 'webm';
      }

      this.mediaRecorder = new MediaRecorder(this.videoStream, {
        mimeType: this.selectedMimeType,
        videoBitsPerSecond: 6000000,
      });

      return new Promise<boolean>((resolve) => {
        if (!this.mediaRecorder) return resolve(false);

        this.chunks = [];
        this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            this.chunks.push(e.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          if (this.chunks.length === 0) return;
          const blob = new Blob(this.chunks, { type: this.selectedMimeType });
          const videoUrl = URL.createObjectURL(blob);
          const downloadLink = document.createElement('a');
          const d = new Date();
          const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

          downloadLink.href = videoUrl;
          downloadLink.download = `ladder_match_${timestamp}.${this.fileExtension}`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();
          setTimeout(() => URL.revokeObjectURL(videoUrl), 1000);
        };

        this.mediaRecorder.onstart = () => {
          resolve(true);
        };

        this.mediaRecorder.start();
      });
    } catch (err) {
      console.warn('Failed to start VideoRecorder:', err);
      return false;
    }
  }

  public stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}
