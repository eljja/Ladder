import assert from 'node:assert/strict';
import test from 'node:test';

function createElementStub(tagName: string = 'div') {
  const listeners = new Map<string, Set<Function>>();
  const children: any[] = [];
  let _innerHTML = '';
  let _textContent = '';
  const classListSet = new Set<string>();

  const el: any = {
    tagName: tagName.toUpperCase(),
    style: {},
    value: '',
    dataset: {},
    className: '',
    children,
    classList: {
      add: (...cls: string[]) => cls.forEach((c) => classListSet.add(c)),
      remove: (...cls: string[]) => cls.forEach((c) => classListSet.delete(c)),
      toggle: (c: string, force?: boolean) => {
        if (force === undefined) {
          if (classListSet.has(c)) classListSet.delete(c);
          else classListSet.add(c);
        } else if (force) classListSet.add(c);
        else classListSet.delete(c);
      },
      contains: (c: string) => classListSet.has(c),
    },
    get innerHTML() {
      return _innerHTML;
    },
    set innerHTML(val: string) {
      _innerHTML = val;
      if (val === '') children.length = 0;
    },
    get textContent() {
      return _textContent;
    },
    set textContent(val: string) {
      _textContent = String(val);
    },
    appendChild(child: any) {
      children.push(child);
      return child;
    },
    querySelector(sel: string) {
      if (sel === '.btn-item-exclude') {
        return createElementStub('button');
      }
      return null;
    },
    addEventListener(type: string, fn: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    dispatchClick() {
      for (const fn of listeners.get('click') ?? []) fn({});
    },
    remove() {},
  };
  return el;
}

test('MarbleRunner individual mode emits singleFinish for each marble even when multiple are launched overlappingly', async () => {
  (globalThis as any).window = {};
  const { CylinderLadder } = await import('../src/core/CylinderLadder');
  const { MarbleRunner } = await import('../src/core/MarbleRunner');

  const ladder = new CylinderLadder(3, 10, 3.5);
  ladder.clearBridges();
  const runner = new MarbleRunner(ladder);
  runner.setParticipants(['A', 'B', 'C']);

  const singleFinishes: number[] = [];
  runner.addEventListener('singleFinish', (e: any) => {
    singleFinishes.push(e.detail?.marble?.id);
  });

  runner.startSingle(0);
  runner.update(2.0); // Marble 0 halfway down
  runner.startSingle(1); // Launch marble 1 while marble 0 is still running

  // Advance until both finish (height 10 / speed 2.4 ~= 4.17s)
  for (let i = 0; i < 60; i++) {
    runner.update(0.1);
  }

  assert.ok(singleFinishes.includes(0), `Expected marble 0 singleFinish, got: ${JSON.stringify(singleFinishes)}`);
  assert.ok(singleFinishes.includes(1), `Expected marble 1 singleFinish, got: ${JSON.stringify(singleFinishes)}`);
});

test('LadderUI.excludeParticipant keeps duplicate-named participants synced with colCount and escapes XSS in result modal', async () => {
  const elements = new Map<string, any>();
  const getEl = (id: string, tag = 'div') => {
    if (!elements.has(id)) elements.set(id, createElementStub(tag));
    return elements.get(id);
  };
  getEl('#in_names', 'textarea').value = '철수, 철수, 영희, <img src=x onerror=alert(1)>';
  getEl('#in_goals', 'textarea').value = '당첨, 꽝1, 꽝2, 꽝3';
  getEl('#sliderDensity', 'input').value = '3.5';
  getEl('#sliderTaper', 'input').value = '1.0';

  (globalThis as any).window = {
    innerWidth: 1200,
    location: { hash: '' },
    addEventListener() {},
  };
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  (globalThis as any).document = {
    querySelector: (sel: string) => getEl(sel),
    createElement: (tag: string) => createElementStub(tag),
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementsByTagName: () => [],
  };
  (globalThis as any).HTMLCanvasElement = class {};
  (globalThis as any).MediaRecorder = undefined;

  const { CylinderLadder } = await import('../src/core/CylinderLadder');
  const { MarbleRunner } = await import('../src/core/MarbleRunner');
  const { LadderUI } = await import('../src/ui/LadderUI');

  const ladder = new CylinderLadder(4, 12, 3.5);
  const runner = new MarbleRunner(ladder);
  const sceneStub: any = {
    canvas: {},
    goalNames: [],
    setGoalNames(g: string[]) {
      this.goalNames = g;
    },
    buildCylinderStructure() {},
    refreshAllAvatars() {},
    resetView() {},
    updateWorkspaceOffset() {},
  };

  const ui = new LadderUI(ladder, runner, sceneStub);

  // 1. Test XSS safety in showResultModal
  (ui as any).showResultModal();
  const resultList = getEl('#resultList');
  assert.equal(resultList.children.length, 4);
  const xssChild = resultList.children[3];
  assert.equal(
    xssChild.innerHTML,
    '',
    'showResultModal should build DOM nodes safely via textContent instead of raw innerHTML string interpolation'
  );

  // 2. Test duplicate participant removal
  ui.excludeParticipant('철수', 0, '당첨');
  assert.equal(
    runner.marbles.length,
    3,
    `Expected 3 remaining marbles after excluding one '철수', got ${runner.marbles.length}`
  );
  assert.equal(ladder.colCount, 3);
});

test('MarbleMesh.destroy() disposes nameSprite CanvasTexture map', async () => {
  const { MarbleMesh } = await import('../src/render/MarbleMesh');
  let mapDisposed = false;
  let matDisposed = false;
  let geomDisposed = false;

  const fakeMesh: any = {
    sphereMesh: {
      geometry: { dispose() { geomDisposed = true; } },
      material: { dispose() { matDisposed = true; } },
    },
    selectionRingMesh: {
      geometry: { dispose() {} },
      material: { dispose() {} },
    },
    nameSprite: {
      material: {
        map: {
          dispose() {
            mapDisposed = true;
          },
        },
        dispose() {},
      },
    },
  };

  MarbleMesh.prototype.destroy.call(fakeMesh);
  assert.equal(geomDisposed, true);
  assert.equal(matDisposed, true);
  assert.equal(mapDisposed, true, 'nameSprite CanvasTexture map was not disposed');
});

test('BgmManager updates isPlaying to false on YouTube PAUSED state (2)', async () => {
  let stateHandler: ((e: any) => void) | null = null;
  (globalThis as any).window = {
    addEventListener() {},
    YT: {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
      Player: class {
        constructor(_id: string, opts: any) {
          stateHandler = opts.events.onStateChange;
          opts.events.onReady({ target: this });
        }
        setVolume() {}
        playVideo() {}
        pauseVideo() {}
      },
    },
  };
  (globalThis as any).document = {
    querySelector: (sel: string) => (sel === '#youtube-bgm-player' ? {} : null),
    getElementsByTagName: () => [],
    createElement: () => ({}),
    head: { appendChild() {} },
  };

  const { BgmManager } = await import('../src/core/BgmManager');
  const bgm = new BgmManager();
  assert.ok(stateHandler);
  stateHandler!({ data: 1 }); // PLAYING
  assert.equal(bgm.isPlaying, true);
  stateHandler!({ data: 2 }); // PAUSED
  assert.equal(bgm.isPlaying, false, 'isPlaying should become false when YouTube enters PAUSED state');
});
