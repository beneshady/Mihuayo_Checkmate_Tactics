/* 电脑上的双端试玩入口。只调整 iframe 视口，不读取或改写游戏状态。 */
(function () {
  'use strict';
  const stage = document.getElementById('preview-stage');
  const shell = document.getElementById('device-shell');
  const frame = document.getElementById('game-preview');
  const selector = document.getElementById('preview-device');
  const devices = {
    desktop: { width: 1920, height: 1080, label: '电脑网页 · 基准视口 1920×1080' },
    // 参考 DPR=3 的布局尺寸；设备硬件像素为 1344×2772。实际手机浏览器视口仍需真机复验。
    mate40pro: { width: 448, height: 924, label: 'Mate 40 Pro 竖屏 · 屏幕 1344×2772 · 布局视口 448×924（参考 DPR 3）' },
    adaptive: { label: '电脑网页 · 随当前预览区域自适应' },
  };
  const requested = new URLSearchParams(location.search).get('device');
  let device = Object.hasOwn(devices, requested) ? requested : 'desktop';

  function resize() {
    const availableWidth = Math.max(1, stage.clientWidth);
    const availableHeight = Math.max(1, stage.clientHeight);
    const preset = devices[device];
    const width = preset.width || Math.max(320, Math.floor(availableWidth));
    const height = preset.height || Math.max(320, Math.floor(availableHeight));
    const scale = device === 'adaptive' ? 1 : Math.min(1, availableWidth / width, availableHeight / height);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    shell.style.width = `${width * scale}px`;
    shell.style.height = `${height * scale}px`;
    shell.dataset.device = device;
    selector.value = device;
    selector.title = `${preset.label}；显示 ${Math.round(scale * 100)}%；切换时保留棋局`;
  }
  selector.addEventListener('change', () => {
    device = selector.value;
    const url = new URL(location.href);
    url.searchParams.set('device', device);
    history.replaceState(null, '', url);
    resize();
  });
  // 下一帧合并尺寸计算，避免观察器在同一轮布局中递归通知。
  let resizeFrame = 0;
  new ResizeObserver(() => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
  }).observe(stage);
  resize();
})();
