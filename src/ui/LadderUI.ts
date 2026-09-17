import type { CylinderLadder } from '../core/CylinderLadder';
import { LadderSolver } from '../core/LadderSolver';
import type { MarbleRunner } from '../core/MarbleRunner';
import { soundManager } from '../core/SoundManager';
import { ConfettiManager } from '../render/Confetti';
import type { CylinderScene } from '../render/CylinderScene';

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

  private btnStartSimul!: HTMLButtonElement;
  private btnModeToggle!: HTMLButtonElement;
  private btnReset!: HTMLButtonElement;
  private btnRandomize!: HTMLButtonElement;
  private btnClearBridges!: HTMLButtonElement;
  private btnToggleEdit!: HTMLButtonElement;
  private btnSound!: HTMLButtonElement;
  private sliderDensity!: HTMLInputElement;

  private resultModal!: HTMLElement;
  private resultList!: HTMLElement;
  private btnCopyResult!: HTMLButtonElement;
  private btnNextRoundExclude!: HTMLButtonElement;
  private btnRestartSame!: HTMLButtonElement;
  private btnCloseModal!: HTMLButtonElement;

  private activeResults: { name: string; goal: string }[] = [];

  constructor(ladder: CylinderLadder, runner: MarbleRunner, scene: CylinderScene) {
    this.ladder = ladder;
    this.runner = runner;
    this.scene = scene;

    this.initElements();
    this.initPresets();
    this.bindEvents();
    this.applyCurrentNamesAndGoals();
  }

  private initElements() {
    this.inNames = document.querySelector('#in_names')!;
    this.inGoals = document.querySelector('#in_goals')!;
    this.sltPreset = document.querySelector('#sltPreset')!;
    this.btnSavePreset = document.querySelector('#btnSavePreset')!;
    this.btnDeletePreset = document.querySelector('#btnDeletePreset')!;

    this.btnStartSimul = document.querySelector('#btnStartSimul')!;
    this.btnModeToggle = document.querySelector('#btnModeToggle')!;
    this.btnReset = document.querySelector('#btnReset')!;
    this.btnRandomize = document.querySelector('#btnRandomize')!;
    this.btnClearBridges = document.querySelector('#btnClearBridges')!;
    this.btnToggleEdit = document.querySelector('#btnToggleEdit')!;
    this.btnSound = document.querySelector('#btnSound')!;
    this.sliderDensity = document.querySelector('#sliderDensity')!;

    this.resultModal = document.querySelector('#resultModal')!;
    this.resultList = document.querySelector('#resultList')!;
    this.btnCopyResult = document.querySelector('#btnCopyResult')!;
    this.btnNextRoundExclude = document.querySelector('#btnNextRoundExclude')!;
    this.btnRestartSame = document.querySelector('#btnRestartSame')!;
    this.btnCloseModal = document.querySelector('#btnCloseModal')!;
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
      if (!title || !title.trim()) return;
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

    // 4. 이름/결과 입력 변경 감지
    this.inNames.addEventListener('change', () => this.applyCurrentNamesAndGoals());
    this.inGoals.addEventListener('change', () => this.applyCurrentNamesAndGoals());

    // 5. 전체 동시 출발
    this.btnStartSimul.addEventListener('click', () => {
      if (this.runner.isRunning) return;
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
      this.showToast('🔄 사다리가 리셋되었습니다.');
    });

    // 8. 다리 랜덤 재생성
    this.btnRandomize.addEventListener('click', () => {
      const density = parseFloat(this.sliderDensity.value);
      this.ladder.generateRandomBridges(density);
      this.scene.rebuildBridges();
      soundManager.playBridgeAdd();
      this.showToast('🎲 새로운 랜덤 사다리가 생성되었습니다!');
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

    // 11. 사운드 음소거 토글
    this.btnSound.addEventListener('click', () => {
      soundManager.isMuted = !soundManager.isMuted;
      this.btnSound.textContent = soundManager.isMuted ? '🔇 음소거' : '🔊 사운드 ON';
    });

    // 12. 골인 이벤트 리스너
    this.runner.addEventListener('marbleGoal', (e: any) => {
      const m = e.detail.marble;
      ConfettiManager.shoot();
      const goalText = this.getGoalName(m.finalCol);
      this.showToast(`🏁 ${m.name} ➔ [${goalText}] 도착!`);
    });

    // 13. 모든 마블 완료 이벤트 리스너 -> 결과 창 표시
    this.runner.addEventListener('allFinish', () => {
      ConfettiManager.grandFinale();
      setTimeout(() => {
        this.showResultModal();
      }, 1200);
    });

    // 14. 결과 모달 복사 버튼
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

    // 15. 당첨자 제외하고 다음 판 (서바이벌 모드)
    this.btnNextRoundExclude.addEventListener('click', () => {
      // 1등 또는 당첨자 항목을 받은 참가자 제외
      if (this.activeResults.length <= 1) {
        this.showToast('남은 참가자가 1명 이하입니다.');
        return;
      }
      // 첫 번째 당첨자(또는 '당첨'/'1등' 포함자) 제외
      const winner =
        this.activeResults.find((r) => r.goal.includes('당첨') || r.goal.includes('1등') || r.goal.includes('커피')) ||
        this.activeResults[0];

      const currentList = this.inNames.value
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const nextList = currentList.filter((n) => n !== winner.name);

      this.inNames.value = nextList.join(', ');
      this.applyCurrentNamesAndGoals();
      this.closeResultModal();
      this.showToast(`⏭️ [${winner.name}]님을 제외하고 다음 판을 준비했습니다!`);
    });

    // 16. 같은 명단으로 다시하기
    this.btnRestartSame.addEventListener('click', () => {
      this.closeResultModal();
      this.runner.reset();
      this.showToast('🔄 같은 명단으로 다시 시작합니다.');
    });

    // 17. 결과 모달 닫기
    this.btnCloseModal.addEventListener('click', () => {
      this.closeResultModal();
    });

    // 18. 모바일 사이드바 토글 버튼
    const btnToggleSidebar = document.querySelector('#btnToggleSidebar');
    const sidebar = document.querySelector('#sidebar');
    btnToggleSidebar?.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
    });
  }

  public applyCurrentNamesAndGoals() {
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

    // 2. 다리가 전혀 없으면 기본 랜덤 다리 생성
    if (this.ladder.bridges.length === 0) {
      const density = parseFloat(this.sliderDensity.value);
      this.ladder.generateRandomBridges(density);
    }

    // 3. 3D 씬 재구축
    this.scene.setGoalNames(goals);
    this.scene.buildCylinderStructure();

    // 4. 러너 참가자 동기화
    this.runner.setParticipants(names);
    this.runner.reset();
  }

  private getGoalName(colIndex?: number): string {
    if (colIndex === undefined) return '';
    const rawGoals = this.inGoals.value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return rawGoals[colIndex] || `골 #${colIndex + 1}`;
  }

  private showResultModal() {
    this.activeResults = [];
    this.resultList.innerHTML = '';

    // 실제 사다리 경로를 시뮬레이션 계산하여 결과 정리
    const solutions = LadderSolver.solveAll(this.ladder);

    solutions.forEach((sol) => {
      const marble = this.runner.marbles.find((m) => m.startCol === sol.startCol);
      const name = marble ? marble.name : `참가자 ${sol.startCol + 1}`;
      const goal = this.getGoalName(sol.finalCol);

      this.activeResults.push({ name, goal });

      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="res-name">${name}</span>
        <span class="res-arrow">➔</span>
        <span class="res-goal">${goal}</span>
      `;
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
