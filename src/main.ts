import './styles/style.scss';
import { CylinderLadder } from './core/CylinderLadder';
import { MarbleRunner } from './core/MarbleRunner';
import { CylinderScene } from './render/CylinderScene';
import { LadderUI } from './ui/LadderUI';

function init() {
  const canvas = document.querySelector<HTMLCanvasElement>('#three-canvas')!;
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }

  // 1. 코어 모델 생성 (기본 6개 기둥, 높이 12, 반지름 3.5)
  const ladder = new CylinderLadder(6, 12, 3.5);
  const runner = new MarbleRunner(ladder);

  // 2. 3D 렌더링 씬 생성
  const scene = new CylinderScene(canvas, ladder, runner);

  // 3. UI 바인딩 생성
  const ui = new LadderUI(ladder, runner, scene);

  // 속도 버튼 바인딩
  document.querySelectorAll<HTMLButtonElement>('.btn-speed').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-speed').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const spd = parseFloat(btn.dataset.speed || '1.0');
      runner.speedMultiplier = spd;
      ui.showToast(`⚡ 이동 속도: ${spd}x`);
    });
  });

  // 4. 애니메이션 렌더 루프
  let lastTime = performance.now();

  function animate(now: number) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    runner.update(dt);
    scene.update(dt);
  }

  requestAnimationFrame(animate);
}

document.addEventListener('DOMContentLoaded', init);
