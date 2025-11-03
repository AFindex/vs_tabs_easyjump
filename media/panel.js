const vscode = acquireVsCodeApi();

const state = {
  alphabet: '',
  entries: [],
  buffer: '',
  locked: false,
  matches: [],
  exactHint: undefined,
  nextHintChar: undefined,
  singleMatchHint: undefined,
  domEntries: [],
  singleMatchEntry: undefined
};

const container = document.getElementById('hintContainer');
const statusBar = document.getElementById('statusBar');

let filterHandle = 0;

function applyPayload(payload) {
  if (!payload) {
    return;
  }

  const { entries, alphabet, themeKind } = payload;
  state.entries = entries ?? [];
  state.alphabet = (alphabet ?? '').toLowerCase();
  state.buffer = '';
  state.locked = false;
  state.nextHintChar = undefined;
  state.singleMatchHint = undefined;
  document.body.dataset.theme = String(themeKind ?? '');
  renderEntries();
}

function clampHeat(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function heatToHslComponents(heat) {
  const hue = Math.round(210 - heat * 185);
  const saturation = Math.round(48 + heat * 32);
  const lightness = Math.round(70 - heat * 20);
  return `${hue} ${saturation}% ${lightness}%`;
}

function padTwoDigits(value) {
  return value < 10 ? `0${value}` : String(value);
}

function formatAbsoluteTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const hour = padTwoDigits(date.getHours());
  const minute = padTwoDigits(date.getMinutes());

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return '';
  }

  const diff = Date.now() - timestamp;

  if (diff < 0) {
    return '刚刚';
  }

  const second = 1000;
  const minute = 60 * second;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 5 * second) {
    return '刚刚';
  }

  if (diff < minute) {
    return `${Math.floor(diff / second)} 秒前`;
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }

  if (diff < 14 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }

  return formatAbsoluteTime(timestamp);
}

function buildUsageMeta(entry) {
  const parts = [];
  const count = entry?.usageCount ?? 0;
  const lastActivatedAt = entry?.lastActivatedAt ?? 0;

  if (count > 0) {
    parts.push(`激活 ${count} 次`);
  }

  const relative = formatRelativeTime(lastActivatedAt);
  if (relative) {
    parts.push(`最近 ${relative}`);
  }

  if (parts.length === 0) {
    return '暂无使用记录';
  }

  return parts.join(' · ');
}

function buildTooltip(entry, usageMeta) {
  const lines = [entry.title];
  if (entry.description && entry.description !== entry.title) {
    lines.push(entry.description);
  }

  if (usageMeta) {
    lines.push(usageMeta);
  }

  return lines.join('\n');
}

window.addEventListener('message', event => {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === 'updateEntries' && message.payload) {
    applyPayload(message.payload);
    if (typeof vscode.setState === 'function') {
      vscode.setState(message.payload);
    }
  }
});

window.addEventListener('load', () => {
  document.body.focus();
  setTimeout(() => document.body.focus(), 0);
  vscode.postMessage({ type: 'ready' });
});

const bootstrapPayload = window.__TAB_EASY_MOTION_BOOTSTRAP__;
if (bootstrapPayload) {
  applyPayload(bootstrapPayload);
  if (typeof vscode.setState === 'function') {
    vscode.setState(bootstrapPayload);
  }
  window.__TAB_EASY_MOTION_BOOTSTRAP__ = undefined;
}

if (!bootstrapPayload && typeof vscode.getState === 'function') {
  const restored = vscode.getState();
  if (restored) {
    applyPayload(restored);
  }
}

document.addEventListener('keydown', event => {
  if (state.locked) {
    event.preventDefault();
    return;
  }

  const key = event.key;

  if (key === 'Escape') {
    event.preventDefault();
    vscode.postMessage({ type: 'cancel' });
    return;
  }

  if (key === 'Tab') {
    event.preventDefault();
    return;
  }

  if (key === 'Backspace') {
    event.preventDefault();
    if (state.buffer.length > 0) {
      state.buffer = state.buffer.slice(0, -1);
      applyFilter();
    }
    return;
  }

  if (key === 'Enter') {
    event.preventDefault();
    selectCandidate();
    return;
  }

  if (key.length === 1) {
    const lower = key.toLowerCase();
    if (!state.alphabet || state.alphabet.includes(lower)) {
      state.buffer += lower;
      applyFilter();
    } else {
      triggerShake();
    }
    event.preventDefault();
  }
});

function composeClassName(baseClass, extraClasses) {
  if (!extraClasses || extraClasses.length === 0) {
    return baseClass;
  }

  return `${baseClass} ${extraClasses.join(' ')}`;
}

function applyEntryClasses(entry, extraClasses) {
  const extraKey = extraClasses.length ? extraClasses.join(' ') : '';

  if (entry.lastAppliedExtraKey === extraKey) {
    return;
  }

  entry.element.className = composeClassName(entry.baseClass, extraClasses);
  entry.lastAppliedExtra = extraClasses.slice();
  entry.lastAppliedExtraKey = extraKey;
}

function updateLetterClass(entry, index, newState) {
  if (entry.letterStates[index] === newState) {
    return;
  }

  const span = entry.hintLetters[index];

  if (!span) {
    return;
  }

  const baseClass = entry.letterBaseClass;
  span.className = newState ? `${baseClass} ${newState}` : baseClass;
  entry.letterStates[index] = newState;
}

function renderEntries() {
  if (!container) {
    return;
  }

  state.domEntries = [];
  state.singleMatchEntry = undefined;

  const fragment = document.createDocumentFragment();

  state.entries.forEach(entry => {
    const hintValue = entry.hint || '';
    const item = document.createElement('div');
    item.dataset.hint = hintValue;
    item.dataset.title = entry.title;
    const usageMeta = buildUsageMeta(entry);
    item.title = buildTooltip(entry, usageMeta);

    const heat = clampHeat(entry.usageHeat ?? 0);
    item.style.setProperty('--heat-strength', heat.toFixed(3));
    item.style.setProperty('--heat-color', heatToHslComponents(heat));
    item.dataset.heat = heat.toFixed(2);
    item.dataset.usageCount = String(entry.usageCount ?? 0);

    const titleLength = entry.title.length;
    const lengthScore = titleLength;

    let sizeClass = 'size-sm';
    if (lengthScore <= 20) {
      sizeClass = 'size-xs';
    } else if (lengthScore <= 40) {
      sizeClass = 'size-sm';
    } else if (lengthScore <= 70) {
      sizeClass = 'size-md';
    } else if (lengthScore <= 100) {
      sizeClass = 'size-lg';
    } else {
      sizeClass = 'size-xl';
    }

    const baseClass = `tab-item ${sizeClass}`;
    item.className = baseClass;

    const hintEl = document.createElement('div');
    hintEl.className = 'tab-hint';

    const hintLetters = [];
    const letterBaseClass = 'tab-hint-letter';
    hintValue.split('').forEach(char => {
      const span = document.createElement('span');
      span.className = letterBaseClass;
      span.textContent = char.toUpperCase();
      hintEl.appendChild(span);
      hintLetters.push(span);
    });

    const titleEl = document.createElement('div');
    titleEl.className = 'tab-title';
    titleEl.textContent = entry.title;

    const metaEl = document.createElement('div');
    metaEl.className = 'tab-meta';
    metaEl.textContent = usageMeta;

    item.appendChild(hintEl);
    item.appendChild(titleEl);
    item.appendChild(metaEl);

    item.addEventListener('click', () => {
      if (state.locked) {
        return;
      }
      sendSelection(hintValue);
    });

    fragment.appendChild(item);

    state.domEntries.push({
      element: item,
      hintValue,
      hintLower: hintValue.toLowerCase(),
      hintLetters,
      baseClass,
      letterBaseClass,
      letterStates: new Array(hintLetters.length).fill(''),
      lastAppliedExtra: [],
      lastAppliedExtraKey: ''
    });
  });

  container.replaceChildren(fragment);

  applyFilter();
}

function applyFilter() {
  if (filterHandle) {
    cancelAnimationFrame(filterHandle);
  }

  filterHandle = requestAnimationFrame(() => {
    filterHandle = 0;
    runFilter();
  });
}

function runFilter() {
  if (!container) {
    return;
  }

  const buffer = state.buffer.toLowerCase();
  const hasBuffer = buffer.length > 0;
  state.matches = [];
  state.exactHint = undefined;
  state.nextHintChar = undefined;
  state.singleMatchHint = undefined;
  state.singleMatchEntry = undefined;

  if (state.domEntries.length === 0) {
    updateStatus();
    return;
  }

  state.domEntries.forEach(entry => {
    const { hintLower, hintValue, hintLetters } = entry;

    if (!hasBuffer) {
      for (let i = 0; i < hintLetters.length; i += 1) {
        updateLetterClass(entry, i, 'remaining');
      }

      applyEntryClasses(entry, []);
      return;
    }

    const extraClasses = [];

    if (hintLower.startsWith(buffer)) {
      state.matches.push(hintValue);

      if (state.matches.length === 1) {
        state.singleMatchEntry = entry;
      } else {
        state.singleMatchEntry = undefined;
      }

      extraClasses.push('match');

      for (let i = 0; i < hintLetters.length; i += 1) {
        if (i < buffer.length) {
          updateLetterClass(entry, i, 'matched');
        } else if (i === buffer.length) {
          updateLetterClass(entry, i, 'next');
        } else {
          updateLetterClass(entry, i, 'remaining');
        }
      }

      if (hintLower === buffer) {
        state.exactHint = hintValue;
        extraClasses.push('exact');
      } else if (!state.nextHintChar && buffer.length < hintLower.length) {
        state.nextHintChar = hintLower.charAt(buffer.length).toUpperCase();
      }
    } else {
      extraClasses.push('dimmed');

      for (let i = 0; i < hintLetters.length; i += 1) {
        updateLetterClass(entry, i, 'inactive');
      }
    }

    applyEntryClasses(entry, extraClasses);
  });

  if (!hasBuffer) {
    state.matches = state.domEntries.map(entry => entry.hintValue);
    updateStatus();
    return;
  }

  if (state.matches.length === 0) {
    triggerShake();
    updateStatus();
    return;
  }

  if (state.matches.length === 1) {
    const onlyHint = state.matches[0];
    const singleEntry = state.singleMatchEntry;

    state.singleMatchHint = onlyHint;

    if (singleEntry) {
      const lastExtras = singleEntry.lastAppliedExtra ?? [];
      if (!lastExtras.includes('single')) {
        const updatedExtras = lastExtras.concat('single');
        applyEntryClasses(singleEntry, updatedExtras);
      }

      if (!state.nextHintChar && singleEntry.hintLower.length > buffer.length) {
        state.nextHintChar = singleEntry.hintLower.charAt(buffer.length).toUpperCase();
      }

      if (singleEntry.hintLower === buffer) {
        updateStatus();
        sendSelection(onlyHint);
        return;
      }
    }
  }

  updateStatus();
}

function updateStatus() {
  if (!statusBar) {
    return;
  }

  if (!state.buffer) {
    statusBar.innerHTML = `<span>输入提示键以跳转 · 鼠标点击卡片也可立即切换。</span><span class="status-actions"><code>Esc</code>取消</span>`;
    return;
  }

  const bufferText = state.buffer.toUpperCase();
  const matchCount = state.matches.length;
  const nextKey = state.nextHintChar ? ` · 下一键：<code>${state.nextHintChar}</code>` : '';
  const helper = matchCount === 0
    ? ' · 未匹配任何提示'
    : state.exactHint
      ? ' · 已定位'
      : state.singleMatchHint
        ? ' · 按 Enter 或继续输入确认'
        : '';
  const detail = `当前输入：<strong>${bufferText}</strong> · 匹配：${matchCount}${nextKey}${helper}`;
  const actions = state.exactHint
    ? '<code>Esc</code>取消'
    : matchCount === 0
      ? '<code>Esc</code>取消'
      : '<code>Enter</code>确认 <code>Esc</code>取消';

  statusBar.innerHTML = `<span>${detail}</span><span class="status-actions">${actions}</span>`;
}

function selectCandidate() {
  if (!state.buffer) {
    triggerShake();
    return;
  }

  if (state.exactHint) {
    sendSelection(state.exactHint);
    return;
  }

  if (state.singleMatchHint) {
    sendSelection(state.singleMatchHint);
    return;
  }

  if (state.matches.length > 0) {
    sendSelection(state.matches[0]);
  }
}

function sendSelection(hint) {
  if (state.locked) {
    return;
  }

  state.locked = true;
  vscode.postMessage({ type: 'select', hint });
}

function triggerShake() {
  if (!container) {
    return;
  }

  if (!container.classList.contains('shake')) {
    container.classList.add('shake');
    setTimeout(() => {
      container.classList.remove('shake');
    }, 250);
  }
}

