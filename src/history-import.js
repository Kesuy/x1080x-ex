const HOST_ID = 'x1080x-ex-history-import';

// A userscript-manager menu callback may lack browser user activation. Open a
// visible panel first; the user activates the native file input on the page.
export function showHistoryImportDialog(document, importFile) {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.shadowRoot?.querySelector('input')?.focus();
    return existing;
  }
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { color-scheme:light; font:14px/1.6 system-ui,sans-serif; color:#172033; }
      * { box-sizing:border-box; }
      .overlay { display:flex; align-items:center; justify-content:center; width:100%; height:100%; padding:20px; background:#0009; }
      form { width:min(480px,100%); max-height:100%; overflow:auto; padding:24px; border-radius:12px; background:#fff; box-shadow:0 16px 60px #0005; }
      h2 { margin:0 0 12px; font-size:20px; }
      p { margin:0 0 18px; color:#526077; }
      label { display:block; font-weight:600; }
      input { display:block; width:100%; margin:8px 0 16px; padding:10px; border:1px solid #cbd5e1; border-radius:6px; }
      [role=status] { min-height:24px; margin-bottom:18px; white-space:pre-line; overflow-wrap:anywhere; }
      footer { display:flex; justify-content:flex-end; gap:10px; }
      button { padding:8px 18px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; color:#172033; font:inherit; cursor:pointer; }
      button[type=submit] { border-color:#2563eb; background:#2563eb; color:#fff; }
      button:disabled { opacity:.5; cursor:default; }
      :focus-visible { outline:2px solid #2563eb; outline-offset:3px; }
    </style>
    <div class="overlay">
      <form role="dialog" aria-modal="true" aria-labelledby="history-import-title">
        <h2 id="history-import-title">导入旧论坛历史恢复文件</h2>
        <p>仅在需要补充旧记录时使用。选择恢复工具生成的 JSON 文件，再点击“导入”；原始旧记录会保留。</p>
        <label for="history-import-file">选择恢复文件</label>
        <input id="history-import-file" type="file" accept=".json,application/json">
        <div role="status" aria-live="polite">尚未选择文件。</div>
        <footer><button type="button" data-close>关闭</button><button type="submit" disabled>导入</button></footer>
      </form>
    </div>`;
  const form = root.querySelector('form');
  const input = root.querySelector('input');
  const submit = root.querySelector('[type=submit]');
  const status = root.querySelector('[role=status]');
  const close = () => { host.remove(); previousFocus?.focus?.(); };
  root.querySelector('[data-close]').addEventListener('click', close);
  root.querySelector('.overlay').addEventListener('click', event => { if (event.target.classList.contains('overlay')) close(); });
  form.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const controls = [...form.querySelectorAll('input, button')].filter(control => !control.disabled);
      const current = root.activeElement;
      if (event.shiftKey && current === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && current === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }
  });
  input.addEventListener('change', () => {
    submit.disabled = !input.files?.length;
    status.textContent = input.files?.length ? '文件已选择，点击“导入”后处理。' : '尚未选择文件。';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const file = input.files?.[0];
    if (!file || submit.disabled) return;
    submit.disabled = true;
    input.disabled = true;
    status.textContent = '正在处理恢复文件…';
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('恢复文件超过 20 MB，请只导出旧论坛相关记录');
      status.textContent = await importFile(file);
    } catch (error) {
      status.textContent = `导入失败：${error?.message || error}`;
      submit.disabled = false;
    } finally { input.disabled = false; }
  });
  document.body.append(host);
  input.focus();
  return host;
}
