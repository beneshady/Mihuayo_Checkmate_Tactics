/* HUD 辅助交互：只读取 DOM，通过既有按钮提交操作。 */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const overlays = Array.from(document.querySelectorAll('.overlay'));
  const backgroundIds = ['topbar', 'scene', 'panel', 'threat-panel', 'mobile-tools', 'action-bar', 'desktop-objective'];
  let currentOverlay = null;
  let returnFocus = null;
  const sheet = byId('ov-mobile-info');
  const viewNames = { piece: '当前棋子', preview: '完整动作预览', skills: '技能成长', units: '我方队伍', intents: '敌方意图', status: '战斗状态', log: '战况记录 · 最近消息', rules: '规则与夹具' };
  const viewNodes = { piece: byId('selected-card'), preview: byId('preview-box'), skills: byId('skills'), units: byId('ally-list'), intents: byId('intent-list'), status: document.querySelector('.status-metrics'), log: byId('battle-log'), rules: document.querySelector('.fixture-links') };
  const viewSlots = {};
  let activeView = null;
  Object.entries(viewNodes).forEach(([key, node]) => {
    const slot = document.createComment(`mobile-${key}`);
    node.before(slot);
    viewSlots[key] = slot;
  });
  function restoreView() {
    if (!activeView) return;
    viewSlots[activeView].after(viewNodes[activeView]);
    activeView = null;
  }
  function closeMobileSheet() { restoreView(); sheet.classList.remove('show'); }
  function showMobileSheet(key) {
    if (!window.M0Display.isMobile()) return;
    restoreView();
    activeView = key;
    byId('mobile-sheet-content').replaceChildren(viewNodes[key]);
    byId('mobile-sheet-title').textContent = viewNames[key];
    if (key === 'skills') {
      const points = byId('team-sp').textContent.match(/\d+/);
      if (points) byId('mobile-sheet-title').textContent += ` · 公共 SP ${points[0]}`;
    }
    sheet.querySelectorAll('[data-ui-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.uiView === key)));
    sheet.classList.add('show');
    byId('mobile-sheet-content').scrollTop = 0;
  }
  document.querySelectorAll('[data-ui-view]').forEach(button => button.addEventListener('click', () => showMobileSheet(button.dataset.uiView)));
  byId('btn-mobile-info-close').addEventListener('click', closeMobileSheet);
  sheet.addEventListener('click', event => { if (event.target === sheet) closeMobileSheet(); });
  window.addEventListener('resize', () => { if (!window.M0Display.isMobile()) closeMobileSheet(); });

  const endButton = byId('btn-end'), endHint = byId('end-turn-hint');
  function hideEndHint() { endHint.hidden = true; }
  function showEndHint() {
    if (endButton.disabled || document.querySelector('.overlay.show')) return;
    endHint.hidden = false;
    const rect = endButton.getBoundingClientRect(),size=window.M0Display.size();
    const start=window.M0Display.local({x:rect.left,y:rect.top}),finish=window.M0Display.local({x:rect.right,y:rect.bottom});
    const button={top:start.y,right:finish.x},box={width:endHint.offsetWidth,height:endHint.offsetHeight};
    const left = !window.M0Display.isMobile() ? button.right + 12 : button.right - box.width;
    endHint.style.left = `${Math.max(8, Math.min(left, size.width - box.width - 8))}px`;
    const top = !window.M0Display.isMobile() ? button.top : button.top - box.height - 10;
    endHint.style.top = `${Math.max(8, Math.min(top, size.height - box.height - 8))}px`;
  }
  endButton.addEventListener('mouseenter', showEndHint);
  endButton.addEventListener('mouseleave', hideEndHint);
  endButton.addEventListener('focus', showEndHint);
  endButton.addEventListener('blur', hideEndHint);
  endButton.addEventListener('click', hideEndHint);
  window.addEventListener('resize', hideEndHint);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideEndHint(); });

  function refreshMobilePreview() {
    const source = byId('preview-box'), root = byId('mobile-preview');
    const hits = Array.from(source.querySelectorAll('.hit'));
    const heading = source.querySelector('b');
    const risks = Array.from(source.querySelectorAll('span.warn, span.ok'));
    const condition=source.querySelector('.preview-conditions');
    const lines = [];if(condition)lines.push(condition.textContent);
    if (!byId('btn-execute').disabled) {
      lines.push(`${heading ? heading.textContent : '攻击'} · ${condition?'可能命中':'命中'} ${hits.length} 个目标`);
      lines.push(hits.length === 0 ? '无伤害，位移落点请展开详情' : hits.length === 1 ? hits[0].textContent.trim().replace(/ @ \([^)]+\)/, '').replace(/，HP /, ' HP ').replace('（阵亡）', ' 阵亡') : '多目标伤害请展开详情核对');
      lines.push(`${source.querySelector('.friendly-fire') ? '⚠ 包含友伤 · ' : ''}${risks.at(-1)?.textContent || ''}`);
    } else {
      if (heading) lines.push(heading.textContent);
      lines.push(risks.at(-1)?.textContent || source.textContent.trim());
    }
    root.replaceChildren();
    lines.filter(Boolean).forEach((text, index) => {
      const line = document.createElement('p');
      line.textContent = text;
      if (index === lines.length - 1 && source.querySelector('.warn, .friendly-fire')) line.className = 'warn';
      root.appendChild(line);
    });
  }

  overlays.forEach(overlay => {
    const dialog = overlay.querySelector('.dialog');
    const title = dialog.querySelector('h2');
    if (!title.id) title.id = `${overlay.id}-title`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.tabIndex = -1;
  });

  function refreshUnits() {
    byId('ally-list').querySelectorAll('[data-unit]').forEach(unit => {
      unit.setAttribute('role', 'button');
      unit.tabIndex = 0;
      unit.setAttribute('aria-pressed', String(unit.classList.contains('selected')));
      unit.setAttribute('aria-label', unit.textContent.trim());
    });
    for (const id of ['rook-modes', 'directions']) {
      byId(id).querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.classList.contains('active')));
      });
    }
    const selected = byId('ally-list').querySelector('.selected');
    byId('action-hint').textContent = !window.M0Display.isMobile() ? '悬停预览 · 点击攻击' : !byId('btn-execute').disabled
      ? '核对右侧伤害与风险，再执行攻击'
      : selected
        ? '点击合法空格直接移动；攻击需预览确认'
        : '选择我方棋子，规划本次行动';
    refreshMobilePreview();
    if (activeView === 'skills') {
      const points = byId('team-sp').textContent.match(/\d+/);
      byId('mobile-sheet-title').textContent = viewNames.skills + (points ? ` · 公共 SP ${points[0]}` : '');
    }
  }

  function focusableIn(dialog) {
    return Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex="0"]'))
      .filter(element => element.getClientRects().length > 0);
  }

  function refreshOverlays() {
    if (sheet.classList.contains('show') && overlays.some(overlay => overlay !== sheet && overlay.classList.contains('show'))) closeMobileSheet();
    const next = overlays.filter(overlay => overlay.classList.contains('show')).at(-1) || null;
    const labels = {
      
      
      'ov-rescue': '救援机会',
      'ov-tutorial': '教学提示',
      'ov-deploy': '布置队伍',
      'ov-pause': '已暂停',
      'ov-confirm': '确认结束回合',
      'ov-result': '战斗结束',
      'ov-mobile-info': '战斗信息',
    };
    byId('phase-label').textContent = next ? labels[next.id] : byId('ov-deploy').hidden ? '我方行动' : '布置队伍';
    backgroundIds.forEach(id => { byId(id).inert = Boolean(next); });
    overlays.forEach(overlay => { overlay.inert = Boolean(next && overlay !== next); });
    if (next) hideEndHint();
    if (next === currentOverlay) return;
    if (next) {
      if (!currentOverlay) returnFocus = document.activeElement;
      currentOverlay = next;
      const preferred = next.id === 'ov-confirm' ? byId('btn-confirm-no') : null;
      (preferred || focusableIn(next)[0] || next.querySelector('.dialog')).focus({ preventScroll: true });
    } else {
      currentOverlay = null;
      if (returnFocus && returnFocus.isConnected && !returnFocus.disabled && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
      else byId('btn-end').focus({ preventScroll: true });
      returnFocus = null;
    }
  }

  // 单位列表由 app.js 重建；事件代理保留其既有点选处理。
  byId('ally-list').addEventListener('click', event => {
    if (event.target.closest('[data-unit]')) {
      if (!window.M0Display.isMobile() && event.detail > 0) byId('panel').scrollTop = 0;
      else if (window.M0Display.isMobile()) closeMobileSheet();
    }
  });
  byId('ally-list').addEventListener('keydown', event => {
    const unit = event.target.closest('[data-unit]');
    if (!unit || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const id = unit.dataset.unit;
    unit.click();
    const replacement = Array.from(byId('ally-list').querySelectorAll('[data-unit]'))
      .find(element => element.dataset.unit === id);
    if (replacement) {
      replacement.tabIndex = 0;
      replacement.focus({ preventScroll: true });
    }
  });

  document.addEventListener('keydown', event => {
    if (!currentOverlay) return;
    if (event.key === 'Escape') {
      const cancel = currentOverlay.id === 'ov-confirm' ? byId('btn-confirm-no')
        : currentOverlay.id === 'ov-pause' ? byId('btn-resume')
          : currentOverlay === sheet ? byId('btn-mobile-info-close') : null;
      if (cancel) { event.preventDefault(); cancel.click(); }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableIn(currentOverlay);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !currentOverlay.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !currentOverlay.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });

  const contentObserver = new MutationObserver(refreshUnits);
  ['ally-list', 'selected-card', 'preview-box', 'skills'].forEach(id => {
    contentObserver.observe(byId(id), { childList: true, subtree: true });
  });
  ['rook-modes', 'directions'].forEach(id => {
    contentObserver.observe(byId(id), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  contentObserver.observe(byId('btn-execute'), { attributes: true, attributeFilter: ['disabled'] });
  const previewObserver = new MutationObserver(() => {
    // 方向预览即使没有合法命中，也应显示盲区/不可提交的原因。
    if (byId('btn-execute').disabled && !byId('preview-box').querySelector('b')) return;
    if (!window.M0Display.isMobile()) byId('threat-panel').scrollTop = 0;
  });
  previewObserver.observe(byId('preview-box'), { childList: true });
  const overlayObserver = new MutationObserver(refreshOverlays);
  overlays.forEach(overlay => { overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] }); });
  overlayObserver.observe(byId('ov-deploy'), { attributes: true, attributeFilter: ['hidden'] });
  // 记录原型已有的战况提示，不推断未提供的完整战斗事件。
  const log = byId('battle-log');
  let hasMessages = false;
  new MutationObserver(() => {
    const message = byId('banner').textContent.trim();
    if (!message) return;
    if (!hasMessages) { log.replaceChildren(); hasMessages = true; }
    const entry = document.createElement('li');
    entry.textContent = `第 ${byId('turn').textContent} 回合 · ${message}`;
    log.prepend(entry);
    while (log.children.length > 30) log.lastElementChild.remove();
  }).observe(byId('banner'), { childList: true, characterData: true, subtree: true });
  refreshUnits();
  refreshOverlays();
})();
