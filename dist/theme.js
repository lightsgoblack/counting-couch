// Theme engine: sets data-theme on <html> before first paint, exposes
// themeColor(token) for canvas/SVG code, fires `themechange` on document,
// and adds a theme picker to the masthead.
(() => {
  const THEMES = [
    {id:'couch', name:'Couch', note:'Acid green after dark', swatch:['#101510','#d1f897','#78adf0','#ed8e8b']},
    {id:'broadsheet', name:'Broadsheet', note:'Morning-edition newsprint', swatch:['#f3eee3','#16130f','#1d4f91','#b3261e']},
    {id:'studio', name:'Studio', note:'Network election-night set', swatch:['#060a18','#ffd23f','#3d8bff','#ff3b4e']},
    {id:'fever', name:'Fever Dream', note:'Psychedelic poster', swatch:['#12061f','#ff5fd2','#62c6ff','#ff7a45']},
    {id:'phosphor', name:'Phosphor', note:'Amber CRT terminal', swatch:['#0a0700','#ffc45c','#6fd3ff','#ff6b57']}
  ];
  const KEY = 'cc-theme';
  const root = document.documentElement;
  const valid = id => THEMES.some(theme => theme.id === id);
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const fromURL = new URLSearchParams(location.search).get('theme');
  let current = valid(fromURL) ? fromURL : valid(stored()) ? stored() : 'couch';
  root.dataset.theme = current;

  window.themeColor = name => getComputedStyle(root).getPropertyValue('--' + name).trim();
  window.themeList = name => window.themeColor(name).split(',').map(value => value.trim()).filter(Boolean);

  function syncMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = window.themeColor('bg') || '#101510';
  }

  function setTheme(id, save = true) {
    if (!valid(id) || id === current) return;
    current = id;
    root.dataset.theme = id;
    if (save) { try { localStorage.setItem(KEY, id); } catch {} }
    syncMeta();
    document.querySelectorAll('.theme-option').forEach(option => option.setAttribute('aria-checked', String(option.dataset.themeId === id)));
    const label = document.querySelector('.theme-toggle b');
    if (label) label.textContent = THEMES.find(theme => theme.id === id).name;
    document.dispatchEvent(new CustomEvent('themechange', {detail: {theme: id}}));
  }
  window.setTheme = setTheme;

  function swatch(colors) {
    const chip = document.createElement('span');
    chip.className = 'theme-swatch';
    chip.setAttribute('aria-hidden', 'true');
    const [ground, ...dots] = colors;
    chip.style.background = ground;
    for (const color of dots) {
      const dot = document.createElement('i');
      dot.style.background = color;
      chip.append(dot);
    }
    return chip;
  }

  function buildPicker() {
    syncMeta();
    const host = document.querySelector('.mast-actions') || document.querySelector('.mast');
    if (!host || host.querySelector('.theme-picker')) return;
    const picker = document.createElement('div');
    picker.className = 'theme-picker';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Choose a theme');
    const label = document.createElement('b');
    label.textContent = THEMES.find(theme => theme.id === current).name;
    toggle.append(swatch(['var(--bg)', 'var(--acid)', 'var(--dem)', 'var(--rep)']), label);
    const menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const heading = document.createElement('p');
    heading.textContent = 'Theme';
    menu.append(heading);
    for (const theme of THEMES) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'theme-option';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(theme.id === current));
      option.dataset.themeId = theme.id;
      const text = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = theme.name;
      const note = document.createElement('small');
      note.textContent = theme.note;
      text.append(name, note);
      option.append(swatch(theme.swatch), text);
      option.addEventListener('click', () => { setTheme(theme.id); close(true); });
      menu.append(option);
    }
    const options = () => [...menu.querySelectorAll('.theme-option')];
    function open() {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      (options().find(option => option.getAttribute('aria-checked') === 'true') || options()[0]).focus();
    }
    function close(focusToggle) {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focusToggle) toggle.focus();
    }
    toggle.addEventListener('click', () => menu.hidden ? open() : close(false));
    menu.addEventListener('keydown', event => {
      const list = options(), index = list.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length].focus(); }
      else if (event.key === 'Home') { event.preventDefault(); list[0].focus(); }
      else if (event.key === 'End') { event.preventDefault(); list[list.length - 1].focus(); }
    });
    document.addEventListener('click', event => { if (!picker.contains(event.target)) close(false); });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close(false); });
    picker.append(toggle, menu);
    const anchor = host.querySelector('#signal') || host.querySelector('.elections-nav');
    if (anchor && anchor.parentNode === host) host.insertBefore(picker, anchor); else host.append(picker);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPicker);
  else buildPicker();
  window.addEventListener('storage', event => { if (event.key === KEY && valid(event.newValue)) setTheme(event.newValue, false); });
})();
