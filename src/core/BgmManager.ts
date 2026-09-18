declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export class BgmManager {
  private player: any = null;
  public isPlaying: boolean = false;
  public isMuted: boolean = false;
  private isReady: boolean = false;
  private hasUserInteracted: boolean = false;
  private readonly videoId: string = 'tETK474k3PU';
  private volume: number = 38; // 쾌적한 기본 배경음 볼륨 (38%)

  constructor() {
    this.loadYouTubeApi();
    this.setupInteractionListeners();
  }

  private loadYouTubeApi() {
    if (typeof window === 'undefined') return;

    if (window.YT?.Player) {
      this.createPlayer();
      return;
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      this.createPlayer();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag?.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }

  private createPlayer() {
    const el = document.querySelector('#youtube-bgm-player');
    if (!el || !window.YT) return;

    try {
      this.player = new window.YT.Player('youtube-bgm-player', {
        height: '100',
        width: '100',
        videoId: this.videoId,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: this.videoId,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            this.isReady = true;
            event.target.setVolume(this.volume);
            if (this.hasUserInteracted && !this.isMuted) {
              event.target.playVideo();
              this.isPlaying = true;
            }
          },
          onStateChange: (event: any) => {
            // 0: Ended -> 재시작
            if (event.data === 0) {
              this.player?.playVideo();
            }
            // 1: Playing
            if (event.data === 1) {
              this.isPlaying = true;
            }
          },
        },
      });
    } catch (err) {
      console.warn('YouTube BGM Player init error:', err);
    }
  }

  private setupInteractionListeners() {
    const onFirstUserAction = () => {
      this.hasUserInteracted = true;
      if (this.isReady && !this.isMuted && !this.isPlaying) {
        this.play();
      }
    };

    window.addEventListener('click', onFirstUserAction, { once: false });
    window.addEventListener('pointerdown', onFirstUserAction, { once: false });
    window.addEventListener('touchstart', onFirstUserAction, { once: false });
  }

  public play() {
    if (this.isReady && this.player?.playVideo) {
      this.player.setVolume(this.volume);
      this.player.playVideo();
      this.isPlaying = true;
      this.isMuted = false;
    }
  }

  public pause() {
    if (this.isReady && this.player?.pauseVideo) {
      this.player.pauseVideo();
      this.isPlaying = false;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.pause();
    } else {
      this.play();
    }
    return !this.isMuted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.isReady && this.player?.setVolume) {
      this.player.setVolume(this.volume);
    }
  }
}

export const bgmManager = new BgmManager();
