const MODERN_RESOURCE_ACTIONS_ID = 'x1080x-ex-resource-actions';
const ACTION_ORDER = [
  'x1080x-ex-download',
  'x1080x-ex-agaghhh-hdblog-search',
  'x1080x-ex-agaghhh-copy-code',
];

function favoriteButton(actions) {
  return actions?.querySelector(
    '.button.dock-side, button.dock-side, button[aria-pressed], .dock-side'
  ) || null;
}

export function ensureModernDownloadStatus(document) {
  const header = document?.querySelector('.thread-header');
  if (!header) return null;
  const row = header.querySelector('.thread-header-nums') || header;
  const actions = row.querySelector('.thread-header-actions');
  let status = document.getElementById('x1080x-ex-download-status');
  if (!status) {
    status = document.createElement('span');
    status.id = 'x1080x-ex-download-status';
    status.setAttribute('role', 'status');
    Object.assign(status.style, {
      flex: '1 1 0px',
      width: '0',
      minWidth: '0',
      contain: 'inline-size',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      alignSelf: 'center',
    });
  }
  // Reserve the available space before the actions from the idle state onward.
  // Text must never add width after the right-aligned toolbar.
  if (actions) {
    if (status.parentElement !== row || status.nextElementSibling !== actions) row.insertBefore(status, actions);
  } else if (status.parentElement !== row) row.prepend(status);
  return status;
}

export function ensureModernResourceActionGroup(document) {
  if (!document?.querySelector('.thread-header h1')) return null;
  const actions = document.querySelector('.thread-header .thread-actions');
  if (!actions) return null;

  let group = document.getElementById(MODERN_RESOURCE_ACTIONS_ID);
  if (!group || group.parentElement !== actions) {
    group = document.createElement('div');
    group.id = MODERN_RESOURCE_ACTIONS_ID;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '资源快捷操作');
    Object.assign(group.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '8px',
      flex: '0 0 auto',
      minWidth: '0',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
    });
  }

  const favorite = favoriteButton(actions);
  if (favorite) {
    if (group.parentElement !== actions || group.nextElementSibling !== favorite) {
      actions.insertBefore(group, favorite);
    }
  } else if (group.parentElement !== actions) {
    actions.prepend(group);
  }
  return group;
}

export function placeModernResourceActionButton(document, button) {
  if (!button) return false;
  const group = ensureModernResourceActionGroup(document);
  if (!group) return false;

  Object.assign(button.style, {
    float: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: button.id === 'x1080x-ex-download' ? '112px' : 'max-content',
    minWidth: button.id === 'x1080x-ex-download' ? '112px' : '38px',
    maxWidth: button.id === 'x1080x-ex-download' ? '112px' : '',
    boxSizing: 'border-box',
    margin: '0',
    flex: '0 0 auto',
    verticalAlign: 'middle',
  });

  const rank = ACTION_ORDER.indexOf(button.id);
  const next = [...group.children].find((candidate) => {
    const candidateRank = ACTION_ORDER.indexOf(candidate.id);
    return rank >= 0 && candidateRank > rank;
  }) || null;
  if (button.parentElement !== group || button.nextElementSibling !== next) {
    group.insertBefore(button, next);
  }
  return true;
}
