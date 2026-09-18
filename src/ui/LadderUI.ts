import { AvatarManager } from '../core/AvatarManager';
import { bgmManager } from '../core/BgmManager';
import type { CylinderLadder } from '../core/CylinderLadder';
import { LadderSerializer } from '../core/LadderSerializer';
import { LadderSolver } from '../core/LadderSolver';
import type { MarbleRunner } from '../core/MarbleRunner';
import { soundManager } from '../core/SoundManager';
import { ConfettiManager } from '../render/Confetti';
import type { CylinderScene, LadderTheme } from '../render/CylinderScene';
import { VideoRecorder } from '../utils/VideoRecorder';

export const BUILTIN_PRESETS: Record<string, { names: string; goals: string }> = {
  '점심 메뉴': {
    names: '철수, 영희, 민수, 지우, 수빈, 동현',
    goals: '짜장면, 김치찌개, 돈까스, 햄버거, 쌀국수, 초밥',
  },
  '커피 내기': {
    names: '팀장, 수석, 책임, 선임, 주임, 인턴',
    goals: '☕ 커피 당첨!, 통과, 통과, 통과, 통과, 통과',
  },
  '벌칙 정하기': {
    names: '참가자1, 참가자2, 참가자3, 참가자4, 참가자5',
    goals: '노래 부르기, 물 한잔 원샷, 손목 맞기, 다음 판 간식 쏘기, 애교 부리기',
  },
  '숫자 1~6': {
    names: 'A, B, C, D, E, F',
    goals: '1등, 2등, 3등, 4등, 5등, 6등',
  },
  '숫자 1~8': {
    names: 'A, B, C, D, E, F, G, H',
    goals: '1등, 2등, 3등, 4등, 5등, 6등, 7등, 8등',
  },
};

export class LadderUI {
  private ladder: CylinderLadder;
  private runner: MarbleRunner;
  private scene: CylinderScene;

  // DOM Elements
  private inNames!: HTMLTextAreaElement;
  private inGoals!: HTMLTextAreaElement;
  private sltPreset!: HTMLSelectElement;
  private btnSavePreset!: HTMLButtonElement;
  private btnDeletePreset!: HTMLButtonElement;
  private btnClearAllAvatars!: HTMLButtonElement;

  private sltTheme!: HTMLSelectElement;
  private btnToggleTrail!: HTMLButtonElement;
  private btnToggleRecord!: HTMLButtonElement;
  private btnShareUrl!: HTMLButtonElement;

  private btnStartSimul!: HTMLButtonElement;
  private btnModeToggle!: HTMLButtonElement;
  private btnReset!: HTMLButtonElement;
  private btnRandomize!: HTMLButtonElement;
  private btnClearBridges!: HTMLButtonElement;
  private btnToggleEdit!: HTMLButtonElement;
  private btnSound!: HTMLButtonElement;
  private btnBgm!: HTMLButtonElement;
  private btnToggleView!: HTMLButtonElement;
  private btnQuickTopView!: HTMLButtonElement;
  private btnToggleCamLock!: HTMLButtonElement;
  private btnToggleCamLockSidebar!: HTMLButtonElement;
  private sliderDensity!: HTMLInputElement;
  private sliderTaper!: HTMLInputElement;
  private valTaper!: HTMLElement;
  private btnResetTaper!: HTMLButtonElement;

  private resultModal!: HTMLElement;
  private resultList!: HTMLElement;
  private btnCopyResult!: HTMLButtonElement;
  private btnNextRoundExclude!: HTMLButtonElement;
  private btnRestartSame!: HTMLButtonElement;
  private btnCloseModal!: HTMLButtonElement;

  private videoRecorder!: VideoRecorder;
  private isAutoRecordEnabled: boolean = false;

  private activeResults: { name: string; goal: string; startCol: number }[] = [];

  constructor(ladder: CylinderLadder, runner: MarbleRunner, scene: CylinderScene) {
    this.ladder = ladder;
    this.runner = runner;
    this.scene = scene;
    this.scene.onToast = (msg: string) => this.showToast(msg);
    this.scene.onMarbleSelect = (state) => {
      if (state) {
        const hasAvatar = !!AvatarManager.getAvatar(state.name);
        this.showToast(
          hasAvatar
            ? `👤 [${state.name}] 선택됨! (Ctrl+V로 사진 변경 / Del로 삭제)`
            : `👤 [${state.name}] 선택됨! 사진 복사 후 Ctrl+V로 붙여넣으세요.`
        );
      }
    };

    this.initElements();
    this.initPresets();
    this.bindEvents();

    const loadedFromUrl = this.loadFromUrlHashIfExists();
    if (!loadedFromUrl) {
      this.applyCurrentNamesAndGoals();
    }
  }

  private initElements() {
    this.inNames = document.querySelector('#in_names')!;
    this.inGoals = document.querySelector('#in_goals')!;
    this.sltPreset = document.querySelector('#sltPreset')!;
    this.btnSavePreset = document.querySelector('#btnSavePreset')!;
    this.btnDeletePreset = document.querySelector('#btnDeletePreset')!;
    this.btnClearAllAvatars = document.querySelector('#btnClearAllAvatars')!;

    this.sltTheme = document.querySelector('#sltTheme')!;
    this.btnToggleTrail = document.querySelector('#btnToggleTrail')!;
    this.btnToggleRecord = document.querySelector('#btnToggleRecord')!;
    this.btnShareUrl = document.querySelector('#btnShareUrl')!;

    this.btnStartSimul = document.querySelector('#btnStartSimul')!;
    this.btnModeToggle = document.querySelector('#btnModeToggle')!;
    this.btnQuickTopView = document.querySelector('#btnQuickTopView')!;
    this.btnToggleCamLock = document.querySelector('#btnToggleCamLock')!;
    this.btnReset = document.querySelector('#btnReset')!;
    this.btnRandomize = document.querySelector('#btnRandomize')!;
    this.btnClearBridges = document.querySelector('#btnClearBridges')!;
    this.btnToggleEdit = document.querySelector('#btnToggleEdit')!;
    this.btnSound = document.querySelector('#btnSound')!;
    this.btnBgm = document.querySelector('#btnBgm')!;
    this.btnToggleView = document.querySelector('#btnToggleView')!;
    this.btnToggleCamLockSidebar = document.querySelector('#btnToggleCamLockSidebar')!;
    this.sliderDensity = document.querySelector('#sliderDensity')!;
    this.sliderTaper = document.querySelector('#sliderTaper')!;
    this.valTaper = document.querySelector('#valTaper')!;
    this.btnResetTaper = document.querySelector('#btnResetTaper')!;

    this.resultModal = document.querySelector('#resultModal')!;
    this.resultList = document.querySelector('#resultList')!;
    this.btnCopyResult = document.querySelector('#btnCopyResult')!;
    this.btnNextRoundExclude = document.querySelector('#btnNextRoundExclude')!;
    this.btnRestartSame = document.querySelector('#btnRestartSame')!;
    this.btnCloseModal = document.querySelector('#btnCloseModal')!;

    this.videoRecorder = new VideoRecorder(this.scene.canvas);
  }

  private initPresets() {
    this.refreshPresetDropdown();
  }

  private getCustomPresets(): Record<string, { names: string; goals: string }> {
    try {
      const data = localStorage.getItem('cylinder_ladder_custom_presets');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private saveCustomPresets(presets: Record<string, { names: string; goals: string }>) {
    localStorage.setItem('cylinder_ladder_custom_presets', JSON.stringify(presets));
  }

  private refreshPresetDropdown(selectedKey?: string) {
    this.sltPreset.innerHTML = '<option value="">-- 프리셋 선택 --</option>';

    const builtinGroup = document.createElement('optgroup');
    builtinGroup.label = '기본 프리셋';
    Object.keys(BUILTIN_PRESETS).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = `builtin:${key}`;
      opt.textContent = key;
      if (selectedKey === `builtin:${key}`) opt.selected = true;
      builtinGroup.appendChild(opt);
    });
    this.sltPreset.appendChild(builtinGroup);

    const customPresets = this.getCustomPresets();
    const customKeys = Object.keys(customPresets);
    if (customKeys.length > 0) {
      const customGroup = document.createElement('optgroup');
      customGroup.label = '내 프리셋';
      customKeys.forEach((key) => {
        const opt = document.createElement('option');
        opt.value = `custom:${key}`;
        opt.textContent = key;
        if (selectedKey === `custom:${key}`) opt.selected = true;
        customGroup.appendChild(opt);
      });
      this.sltPreset.appendChild(customGroup);
    }
  }

  private bindEvents() {
    // 1. 프리셋 선택
    this.sltPreset.addEventListener('change', () => {
      if (this.runner.isRunning) {
        this.showToast('⚠️ 경기가 진행 중일 때는 프리셋을 변경할 수 없습니다.');
        return;
      }
      const val = this.sltPreset.value;
      if (!val) return;
      let preset: { names: string; goals: string } | null = null;
      if (val.startsWith('builtin:')) {
        preset = BUILTIN_PRESETS[val.replace('builtin:', '')];
      } else if (val.startsWith('custom:')) {
        preset = this.getCustomPresets()[val.replace('custom:', '')];
      }
      if (preset) {
        this.inNames.value = preset.names;
        this.inGoals.value = preset.goals;
        this.applyCurrentNamesAndGoals();
        this.showToast(`📋 '${val.split(':')[1]}' 프리셋 적용!`);
      }
    });

    // 2. 프리셋 저장
    this.btnSavePreset.addEventListener('click', () => {
      const names = this.inNames.value.trim();
      const goals = this.inGoals.value.trim();
      if (!names) {
        this.showToast('참가자 명단을 먼저 입력하세요.');
        return;
      }
      const title = prompt('저장할 프리셋 이름을 입력하세요:');
      if (!title?.trim()) return;
      const key = title.trim();
      const custom = this.getCustomPresets();
      custom[key] = { names, goals };
      this.saveCustomPresets(custom);
      this.refreshPresetDropdown(`custom:${key}`);
      this.showToast(`💾 '${key}' 프리셋이 저장되었습니다.`);
    });

    // 3. 프리셋 삭제
    this.btnDeletePreset.addEventListener('click', () => {
      const val = this.sltPreset.value;
      if (!val) {
        this.showToast('삭제할 프리셋을 선택하세요.');
        return;
      }
      if (val.startsWith('builtin:')) {
        this.showToast('기본 프리셋은 삭제할 수 없습니다.');
        return;
      }
      const key = val.replace('custom:', '');
      if (confirm(`'${key}' 프리셋을 삭제하시겠습니까?`)) {
        const custom = this.getCustomPresets();
        delete custom[key];
        this.saveCustomPresets(custom);
        this.refreshPresetDropdown();
        this.showToast(`🗑️ '${key}' 프리셋이 삭제되었습니다.`);
      }
    });

    // 4. 이름/결과 입력 변경 감지 (실시간 동기화 + 포커스 아웃 보장)
    let inputDebounceTimer: any = null;
    const handleInputChange = () => {
      if (this.runner.isRunning) return;
      clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        this.applyCurrentNamesAndGoals();
      }, 250);
    };

    this.inNames.addEventListener('input', handleInputChange);
    this.inGoals.addEventListener('input', handleInputChange);
    this.inNames.addEventListener('change', () => this.applyCurrentNamesAndGoals());
    this.inGoals.addEventListener('change', () => this.applyCurrentNamesAndGoals());

    // 5. 전체 동시 출발 (출발 전 입력값 최종 동기화 보장)
    this.btnStartSimul.addEventListener('click', () => {
      if (this.runner.isRunning) return;
      this.applyCurrentNamesAndGoals();
      this.runner.startSimultaneous();
      this.showToast('🚀 모든 마블 동시 출발!');
    });

    // 6. 개별 터치 모드 안내
    this.btnModeToggle.addEventListener('click', () => {
      if (this.runner.mode === 'simultaneous') {
        this.runner.mode = 'individual';
        this.btnModeToggle.textContent = '🎯 개별 터치 모드 (활성)';
        this.btnModeToggle.classList.add('active');
        this.showToast('💡 원하는 구슬을 직접 클릭/터치하면 해당 구슬만 출발합니다!');
      } else {
        this.runner.mode = 'simultaneous';
        this.btnModeToggle.textContent = '🎯 개별 터치 모드로 전환';
        this.btnModeToggle.classList.remove('active');
        this.showToast('🚀 동시 출발 모드로 전환되었습니다.');
      }
    });

    // 7. 다시하기 (리셋)
    this.btnReset.addEventListener('click', () => {
      this.runner.reset();
      this.scene.resetView();
      this.showToast('🔄 사다리가 리셋되었습니다.');
    });

    // 8. 다리 랜덤 재생성 (경기 진행 중 차단)
    this.btnRandomize.addEventListener('click', () => {
      if (this.runner.isRunning) {
        this.showToast('⚠️ 경기가 진행 중일 때는 사다리를 변경할 수 없습니다.');
        return;
      }
      const density = parseFloat(this.sliderDensity.value);
      this.ladder.generateRandomBridges(density);
      this.scene.rebuildBridges();
      soundManager.playBridgeAdd();
      this.showToast('🎲 새로운 랜덤 사다리가 생성되었습니다!');
    });

    // 8-1. 원근 / 하단 크기 조절 슬라이더 (0.2x ~ 1.8x)
    this.sliderTaper?.addEventListener('input', () => {
      const val = parseFloat(this.sliderTaper.value);
      this.ladder.setTaperRatio(val);
      this.scene.buildCylinderStructure();

      let desc = '';
      if (Math.abs(val - 1.0) < 0.02) {
        desc = '1.00x (기본 원통형)';
      } else if (val < 0.98) {
        desc = `${val.toFixed(2)}x (원뿔형: 아래 좁아짐)`;
      } else {
        desc = `${val.toFixed(2)}x (역원뿔형: 아래 넓어짐)`;
      }
      if (this.valTaper) {
        this.valTaper.textContent = desc;
      }
    });

    this.btnResetTaper?.addEventListener('click', () => {
      this.sliderTaper.value = '1.0';
      this.ladder.setTaperRatio(1.0);
      this.scene.buildCylinderStructure();
      if (this.valTaper) {
        this.valTaper.textContent = '1.00x (기본 원통형)';
      }
      this.showToast('📐 원근 비율이 기본(1.0x 원통형)으로 초기화되었습니다.');
    });

    // 9. 다리 모두 지우기
    this.btnClearBridges.addEventListener('click', () => {
      if (confirm('사다리의 모든 가로선을 지우시겠습니까?')) {
        this.ladder.clearBridges();
        this.scene.rebuildBridges();
        soundManager.playBridgeRemove();
        this.showToast('🧹 모든 가로선이 제거되었습니다.');
      }
    });

    // 10. 그리기 모드 토글
    this.btnToggleEdit.addEventListener('click', () => {
      this.scene.isEditMode = !this.scene.isEditMode;
      this.btnToggleEdit.classList.toggle('active', this.scene.isEditMode);
      this.btnToggleEdit.textContent = this.scene.isEditMode ? '✏️ 그리기: ON' : '✏️ 그리기: OFF';
      this.showToast(
        this.scene.isEditMode
          ? '✏️ 기둥 사이를 드래그하여 가로/대각선 다리를 그려보세요!'
          : '👀 뷰 모드: 마우스 드래그로 실린더를 360도 회전할 수 있습니다.'
      );
    });

    // 11. 사운드(SFX) 음소거 토글
    this.btnSound.addEventListener('click', () => {
      soundManager.isMuted = !soundManager.isMuted;
      this.btnSound.textContent = soundManager.isMuted ? '🔇 효과음 OFF' : '🔊 효과음 ON';
      this.showToast(soundManager.isMuted ? '🔇 효과음 음소거' : '🔊 효과음 켜짐');
    });

    // 11-1. 유튜브 배경음악(BGM) 재생/음소거 토글
    this.btnBgm?.addEventListener('click', () => {
      const isPlaying = bgmManager.toggleMute();
      this.btnBgm.classList.toggle('active', isPlaying);
      this.btnBgm.textContent = isPlaying ? '🎵 BGM ON' : '🔇 BGM OFF';
      this.showToast(isPlaying ? '🎵 사다리타기 BGM 재생 중' : '🔇 배경음악 음소거');
    });

    // 11-2. 시점 모드 (정면 뷰 <-> 완전 탑뷰) 토글
    const handleViewToggle = () => {
      const isTop = this.scene.toggleTopView();
      if (this.btnToggleView) {
        this.btnToggleView.textContent = isTop ? '📐 뷰: 탑뷰' : '📐 뷰: 정면';
        this.btnToggleView.classList.toggle('active', isTop);
      }
      if (this.btnQuickTopView) {
        this.btnQuickTopView.textContent = isTop ? '📐 정면뷰 전환' : '📐 탑뷰 전환';
        this.btnQuickTopView.classList.toggle('active', isTop);
      }
      this.showToast(isTop ? '📐 시점: 완전 탑뷰 (위에서 내려다보기)' : '📐 시점: 정면 뷰');
    };

    this.btnToggleView?.addEventListener('click', handleViewToggle);
    this.btnQuickTopView?.addEventListener('click', handleViewToggle);

    // 11-3. 카메라 자동 회전/추적 고정 토글
    const handleCamLockToggle = () => {
      const isLocked = this.scene.toggleCameraLock();
      if (this.btnToggleCamLock) {
        this.btnToggleCamLock.textContent = isLocked ? '🔒 카메라 고정됨' : '🔒 카메라 고정';
        this.btnToggleCamLock.classList.toggle('active', isLocked);
      }
      if (this.btnToggleCamLockSidebar) {
        this.btnToggleCamLockSidebar.textContent = isLocked ? '🔒 카메라 고정: ON' : '🔒 카메라 고정: OFF (추적 중)';
        this.btnToggleCamLockSidebar.classList.toggle('active', isLocked);
      }
      this.showToast(
        isLocked
          ? '🔒 카메라 고정: 경기 진행 중 화면이 자동으로 회전하지 않습니다.'
          : '🎥 카메라 추적: 경기 진행 중 1등 마블을 따라 자동 회전합니다.'
      );
    };

    this.btnToggleCamLock?.addEventListener('click', handleCamLockToggle);
    this.btnToggleCamLockSidebar?.addEventListener('click', handleCamLockToggle);

    // 11-4. 3D 테마 스킨 전환
    this.sltTheme?.addEventListener('change', () => {
      const theme = this.sltTheme.value as LadderTheme;
      this.scene.setTheme(theme);
      const themeName =
        theme === 'wooden' ? '클래식 우든 타워' : theme === 'space' ? '스페이스 코스믹' : '사이버펑크 네온';
      this.showToast(`🎨 3D 테마: [${themeName}] 적용!`);
    });

    // 11-5. 네온 궤적 트레일 토글
    this.btnToggleTrail?.addEventListener('click', () => {
      const enabled = this.scene.toggleNeonTrail();
      this.btnToggleTrail.classList.toggle('active', enabled);
      this.btnToggleTrail.textContent = enabled ? '✨ 네온 트레일: ON' : '✨ 네온 트레일: OFF';
      this.showToast(enabled ? '✨ 네온 궤적 라이트 트레일 활성화' : '✨ 네온 궤적 트레일 비활성화');
    });

    // 11-6. 자동 영상 녹화 토글
    this.btnToggleRecord?.addEventListener('click', () => {
      if (!VideoRecorder.isSupported()) {
        this.showToast('⚠️ 현재 브라우저에서는 Canvas 녹화 API를 지원하지 않습니다.');
        return;
      }
      this.isAutoRecordEnabled = !this.isAutoRecordEnabled;
      this.btnToggleRecord.classList.toggle('active', this.isAutoRecordEnabled);
      this.btnToggleRecord.textContent = this.isAutoRecordEnabled ? '📹 자동 녹화: ON' : '📹 자동 녹화: OFF';
      this.showToast(
        this.isAutoRecordEnabled
          ? '📹 자동 녹화 활성: 경기 시작 시 자동 녹화되며 완료 시 파일로 다운로드됩니다.'
          : '📹 자동 녹화 꺼짐'
      );
    });

    // 11-7. 사다리 URL 링크 복사 및 공유
    this.btnShareUrl?.addEventListener('click', () => {
      const names = this.inNames.value
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const goals = this.inGoals.value
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const shareUrl = LadderSerializer.getShareUrl({
        names,
        goals,
        bridges: this.ladder.bridges,
        taperRatio: this.ladder.taperRatio,
      });

      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => {
            this.showToast('🔗 사다리 링크가 복사되었습니다! 친구에게 공유해보세요.');
          })
          .catch(() => {
            prompt('아래 사다리 링크를 복사하세요:', shareUrl);
          });
      } else {
        prompt('아래 사다리 링크를 복사하세요:', shareUrl);
      }
    });

    // 11-8. 경기 시작 시 자동 영상 녹화 시작
    this.runner.addEventListener('start', () => {
      if (this.isAutoRecordEnabled) {
        this.videoRecorder.start();
      }
    });

    // 12. 골인 이벤트 리스너 (동시 출발 모드 시 골인 알림)
    this.runner.addEventListener('marbleGoal', (e: any) => {
      if (this.runner.mode === 'individual') return; // 개별 모드는 singleFinish에서 처리
      const m = e.detail.marble;
      ConfettiManager.shoot();
      const goalText = this.getGoalName(m.finalCol);
      this.showToast(`🏁 ${m.name} ➔ [${goalText}] 도착!`);
    });

    // 13. 개별 마블 완료 이벤트 (개별 모드에서는 결과를 바로 띄우지 않고 토스트 및 폭죽만)
    this.runner.addEventListener('singleFinish', (e: any) => {
      const m = e.detail?.marble;
      const finishedCount = this.runner.marbles.filter((mb) => mb.isFinished).length;
      const totalCount = this.runner.marbles.length;
      const remaining = totalCount - finishedCount;
      const goalText = this.getGoalName(m?.finalCol);
      ConfettiManager.shoot();
      if (remaining > 0) {
        this.showToast(
          `🏁 [${m?.name || '마블'}] ➔ [${goalText}] 도착! (남은 구슬: ${remaining}개 - 다음 구슬을 터치하세요)`
        );
      }
    });

    // 14. 모든 마블 완료 이벤트 리스너 -> 모든 마블이 끝난 후에만 최종 결과 창 표시
    this.runner.addEventListener('allFinish', () => {
      if (this.isAutoRecordEnabled && this.videoRecorder.isRecording) {
        this.videoRecorder.stop();
        this.showToast('🎬 경기 녹화 완료! 영상 파일이 곧 다운로드됩니다.');
      }
      ConfettiManager.grandFinale();
      setTimeout(() => {
        this.showResultModal();
      }, 1000);
    });

    // 15. 결과 모달 복사 버튼
    this.btnCopyResult.addEventListener('click', () => {
      if (this.activeResults.length === 0) return;
      const lines = ['[원통형 3D 사다리 게임 추첨 결과]'];
      this.activeResults.forEach((r) => {
        lines.push(`${r.name} ➔ ${r.goal}`);
      });
      const text = lines.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 결과가 클립보드에 복사되었습니다!');
      });
    });

    // 16. 당첨자 제외하고 다음 판 (서바이벌 모드)
    this.btnNextRoundExclude.addEventListener('click', () => {
      if (this.activeResults.length <= 2) {
        this.showToast('남은 참가자가 2명 이하입니다. 더 이상 제외할 수 없습니다.');
        return;
      }
      // 당첨자 항목 우선 식별 (당첨, 1등, 1위, 승리, 합격, 커피, 선물, 통과 등)
      const winner =
        this.activeResults.find(
          (r) =>
            r.goal.includes('당첨') ||
            r.goal.includes('1등') ||
            r.goal.includes('1위') ||
            r.goal.includes('승리') ||
            r.goal.includes('합격') ||
            r.goal.includes('커피') ||
            r.goal.includes('선물') ||
            r.goal.includes('통과')
        ) || this.activeResults[0];

      this.excludeParticipant(winner.name, winner.startCol, winner.goal);
    });

    // 17. 같은 명단으로 다시하기
    this.btnRestartSame.addEventListener('click', () => {
      this.closeResultModal();
      this.runner.reset();
      this.scene.resetView();
      this.showToast('🔄 같은 명단으로 다시 시작합니다.');
    });

    // 18. 결과 모달 닫기
    this.btnCloseModal.addEventListener('click', () => {
      this.closeResultModal();
    });

    // 19. 사이드바 접기/열기 버튼 (데스크톱 및 모바일 반응형 + 3D 중심축 재정렬)
    const btnToggleSidebar = document.querySelector('#btnToggleSidebar');
    const btnCollapseSidebar = document.querySelector('#btnCollapseSidebar');
    const sidebar = document.querySelector('#sidebar');
    const app = document.querySelector('#app');

    const toggleSidebar = () => {
      if (window.innerWidth <= 768) {
        sidebar?.classList.toggle('open');
      } else {
        sidebar?.classList.toggle('collapsed');
        app?.classList.toggle('sidebar-collapsed');
        this.scene.updateWorkspaceOffset();
      }
    };

    btnToggleSidebar?.addEventListener('click', toggleSidebar);
    btnCollapseSidebar?.addEventListener('click', toggleSidebar);

    window.addEventListener('resize', () => {
      this.scene.updateWorkspaceOffset();
    });

    // 20. 전체 마블 사진 초기화
    this.btnClearAllAvatars?.addEventListener('click', () => {
      if (confirm('등록된 모든 마블 얼굴 사진을 초기화하시겠습니까?')) {
        AvatarManager.clearAll();
        this.scene.refreshAllAvatars();
        this.showToast('🗑️ 모든 마블 얼굴 사진이 초기화되었습니다.');
      }
    });
  }

  public applyCurrentNamesAndGoals(preserveBridges: boolean = false) {
    const rawNames = this.inNames.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const names = rawNames.length > 0 ? rawNames : ['참가자1', '참가자2', '참가자3', '참가자4'];

    const rawGoals = this.inGoals.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const goals: string[] = [];
    for (let i = 0; i < names.length; i++) {
      goals.push(rawGoals[i] || `골 #${i + 1}`);
    }

    // 1. 사다리 기둥 수 동기화
    this.ladder.setColCount(names.length);

    // 2. 다리가 전혀 없으면 기본 랜덤 다리 생성 (preserveBridges가 아닐 때)
    if (!preserveBridges && this.ladder.bridges.length === 0) {
      const density = parseFloat(this.sliderDensity.value);
      this.ladder.generateRandomBridges(density);
    }

    // 3. 3D 씬 재구축
    this.scene.setGoalNames(goals);
    this.scene.buildCylinderStructure();

    // 4. 러너 참가자 동기화
    this.runner.setParticipants(names);
    this.runner.reset();
    this.scene.refreshAllAvatars();
  }

  /**
   * URL 해시(#ladder=...)에 저장된 사다리 구성이 있으면 자동 로드
   */
  private loadFromUrlHashIfExists(): boolean {
    const shared = LadderSerializer.readFromUrlHash();
    if (!shared?.names || shared.names.length === 0) return false;

    this.inNames.value = shared.names.join(', ');
    this.inGoals.value = shared.goals.join(', ');
    if (shared.taperRatio !== undefined) {
      this.ladder.setTaperRatio(shared.taperRatio);
      if (this.sliderTaper) this.sliderTaper.value = shared.taperRatio.toString();
      if (this.valTaper) {
        const val = shared.taperRatio;
        let desc = '';
        if (Math.abs(val - 1.0) < 0.02) desc = '1.00x (기본 원통형)';
        else if (val < 0.98) desc = `${val.toFixed(2)}x (원뿔형: 아래 좁아짐)`;
        else desc = `${val.toFixed(2)}x (역원뿔형: 아래 넓어짐)`;
        this.valTaper.textContent = desc;
      }
    }
    this.ladder.bridges = shared.bridges;
    this.applyCurrentNamesAndGoals(true);
    this.scene.rebuildBridges();
    this.showToast('🔗 공유받은 사다리를 성공적으로 불러왔습니다!');
    return true;
  }

  private getGoalName(colIndex?: number): string {
    if (colIndex === undefined) return '';
    // 3D 씬 화면 바닥에 렌더링된 골 이름을 1순위로 사용하여 100% 일치 보장
    if (this.scene && (this.scene as any).goalNames?.[colIndex]) {
      return (this.scene as any).goalNames[colIndex];
    }
    const rawGoals = this.inGoals.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return rawGoals[colIndex] || `골 #${colIndex + 1}`;
  }

  /**
   * 특정 참가자를 사다리 및 명단에서 제외하고 다음 판을 준비
   * - ladder.removeColumn으로 한쪽 가로선 보존 및 2개 사다리 연결 보장
   * - 당첨된 골(목적지)도 함께 제외하여 중복/불일치 에러 원천 차단
   */
  public excludeParticipant(winnerName: string, startCol: number, winnerGoal?: string) {
    const currentNames = this.inNames.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (currentNames.length <= 2) {
      this.showToast('⚠️ 최소 참가자 수는 2명입니다. 더 이상 제외할 수 없습니다.');
      return;
    }

    // 1. 사다리에서 해당 기둥 제거 (가로선 한쪽 보존 및 남은 2개 사다리 연결 보장)
    this.ladder.removeColumn(startCol);

    // 2. 참가자 명단에서 해당 참가자 제거
    const nextNames = currentNames.filter((n) => n !== winnerName);
    this.inNames.value = nextNames.join(', ');

    // 3. 골 명단에서도 당첨자가 차지한 골(목적지) 제거하여 다음 라운드와 동기화
    const currentGoals = this.inGoals.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (winnerGoal) {
      const gIdx = currentGoals.indexOf(winnerGoal);
      if (gIdx >= 0) {
        currentGoals.splice(gIdx, 1);
      } else if (currentGoals.length > nextNames.length) {
        currentGoals.pop();
      }
    } else if (currentGoals.length > nextNames.length) {
      currentGoals.pop();
    }
    this.inGoals.value = currentGoals.join(', ');

    // 4. 3D 씬 및 러너 재구축 (사다리 다리는 보존된 상태로 씬 재구성)
    const goals: string[] = [];
    for (let i = 0; i < nextNames.length; i++) {
      goals.push(currentGoals[i] || `골 #${i + 1}`);
    }
    this.scene.setGoalNames(goals);
    this.scene.buildCylinderStructure();

    this.runner.setParticipants(nextNames);
    this.runner.reset();

    this.closeResultModal();
    this.scene.resetView();
    this.showToast(`⏭️ [${winnerName}] ➔ [${winnerGoal || '당첨'}] 제외 완료! (남은 참가자: ${nextNames.length}명)`);
  }

  private showResultModal() {
    this.activeResults = [];
    this.resultList.innerHTML = '';

    // 실제 사다리 경로 계산 및 1:1 매칭 무결성 검증
    const solutions = LadderSolver.solveAll(this.ladder);

    // 1:1 매칭(전단사) 중복 여부 사전 검사
    // 혹시라도 물리 엔진 프레임 글리치 등으로 중복이 감지되면 수학적 솔버 결과(solutions)로 자동 복구!
    const seenCols = new Set<number>();
    let hasDuplicate = false;
    for (const sol of solutions) {
      const marble = this.runner.marbles.find((m) => m.startCol === sol.startCol);
      const col = marble?.isFinished && marble.finalCol !== undefined ? marble.finalCol : sol.finalCol;
      if (seenCols.has(col)) {
        hasDuplicate = true;
        break;
      }
      seenCols.add(col);
    }

    solutions.forEach((sol) => {
      const marble = this.runner.marbles.find((m) => m.startCol === sol.startCol);
      const name = marble ? marble.name : `참가자 ${sol.startCol + 1}`;

      // 중복이 없으면 완주된 마블의 기둥을 쓰고, 중복 감지 시 솔버 결과로 100% 안전 보정
      const finalCol =
        !hasDuplicate && marble && marble.isFinished && marble.finalCol !== undefined ? marble.finalCol : sol.finalCol;
      const goal = this.getGoalName(finalCol);

      this.activeResults.push({ name, goal, startCol: sol.startCol });

      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <div class="result-item-main">
          <span class="res-name">${name}</span>
          <span class="res-arrow">➔</span>
          <span class="res-goal">${goal}</span>
        </div>
        <button type="button" class="btn-item-exclude" title="${name}님 제외하고 다음 판">제외</button>
      `;

      const btnExclude = item.querySelector('.btn-item-exclude') as HTMLButtonElement;
      btnExclude.addEventListener('click', () => {
        this.excludeParticipant(name, sol.startCol, goal);
      });

      this.resultList.appendChild(item);
    });

    this.resultModal.classList.remove('hide');
  }

  private closeResultModal() {
    this.resultModal.classList.add('hide');
  }

  public showToast(msg: string) {
    const toast = document.createElement('div');
    toast.className = 'neon-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 1800);
  }
}
