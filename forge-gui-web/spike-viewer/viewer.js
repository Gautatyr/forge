// Read-only spike viewer: applies the server's snapshot + deltas to a flat object map and
// re-renders on the next animation frame. No build step, no dependencies.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const objects = new Map();
  let schema = {};
  let log = [];
  let game = null, seq = 0;
  let renderQueued = false;
  let socket = null;
  const meter = { msgs: 0, bytes: 0, last: Date.now(), rateMsgs: 0, rateBytes: 0 };

  const params = new URLSearchParams(location.search);
  // Per-launch token: the server prints http://127.0.0.1:PORT/#token=…; kept for reloads, dropped from the address bar.
  const token = (() => {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
    if (fromHash) {
      history.replaceState(null, '', location.pathname + location.search);
      try { sessionStorage.setItem('forge-token', fromHash); } catch { /* storage blocked: this load only */ }
      return fromHash;
    }
    try { return sessionStorage.getItem('forge-token'); } catch { return null; }
  })();
  // A new URL pasted into this tab differs only by its fragment: the browser does not reload by itself.
  window.addEventListener('hashchange', () => { if (new URLSearchParams(location.hash.slice(1)).get('token')) location.reload(); });
  const imagesBox = $('images');
  imagesBox.checked = params.get('images') === '1';
  imagesBox.addEventListener('change', queueRender);

  const keyOf = (o) => (o.state ? `${o.type}:${o.id}:${o.state}` : `${o.type}:${o.id}`);
  const get = (type, id) => objects.get(`${type}:${id}`);
  const ids = (v) => (Array.isArray(v) ? v : []);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function apply(m) {
    if (m.t === 'hello') { schema = m.schema; return; }
    if (m.t === 'snapshot') {
      objects.clear();
      for (const o of m.objects) objects.set(keyOf(o), o);
      log = m.log.slice();
      game = m.game; seq = m.seq;
      return;
    }
    if (m.t !== 'delta' || m.game !== game) return;
    if (m.seq !== seq + 1) {
      // missed a delta: ignore deltas until the server sends a fresh snapshot
      game = null;
      socket?.send(JSON.stringify({ t: 'requestResync' }));
      return;
    }
    seq = m.seq;
    for (const o of m.new) objects.set(keyOf(o), o);
    for (const c of m.changed) {
      const o = objects.get(keyOf(c));
      if (!o) continue;
      for (const [k, v] of Object.entries(c.props)) { if (v === null) delete o.props[k]; else o.props[k] = v; }
    }
    for (const k of m.removed) objects.delete(k);
    log.push(...m.log);
    if (log.length > 400) log = log.slice(-400);
  }

  function connect(attempt = 0) {
    if (!token) { setStatus('no token: open the URL the server printed', 'down'); return; }
    // the token decides the view: the server prints one URL per seat and one for the spectator
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    socket = ws;
    let opened = false;
    ws.onopen = () => { opened = true; setStatus('live', 'live'); attempt = 0; };
    ws.onmessage = (ev) => {
      meter.msgs++; meter.bytes += ev.data.length;
      apply(JSON.parse(ev.data));
      queueRender();
    };
    ws.onclose = () => {
      const retry = () => setTimeout(() => connect(attempt + 1), Math.min(5000, 500 * 2 ** attempt));
      if (opened) { setStatus('disconnected', 'down'); retry(); return; }
      // Never opened: the browser hides why. A 403 here means this token is dead (each launch makes a new one): stop.
      const restarted = 'cannot connect: if the server restarted, open the new URL it printed';
      fetch(`/metrics?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
        .then((r) => { setStatus(restarted, 'down'); if (r.status !== 403) retry(); })
        .catch(() => { setStatus(restarted, 'down'); retry(); });
    };
  }
  function setStatus(text, cls) { const s = $('status'); s.textContent = text; s.className = `pill ${cls}`; }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  setInterval(() => {
    const now = Date.now(), dt = (now - meter.last) / 1000;
    meter.rateMsgs = meter.msgs / dt; meter.rateBytes = meter.bytes / dt;
    meter.msgs = 0; meter.bytes = 0; meter.last = now;
    $('stats').textContent = `seq ${seq} · ${objects.size} objects · ${meter.rateMsgs.toFixed(1)} msg/s · ${(meter.rateBytes / 1024).toFixed(1)} KB/s`;
  }, 1000);

  // --- view helpers over the flat map ---
  const gameObj = () => [...objects.values()].find((o) => o.type === 'game');
  const stateOf = (card) => card && get('cardState', `${card.id}:${card.props.CurrentState || 'Original'}`);
  const cardName = (id) => { const c = get('card', id); return c ? (c.props.Name || stateOf(c)?.props.Name || `#${id}`) : `#${id}`; };
  const playerName = (id) => get('player', id)?.props.Name ?? `P${id}`;
  const entityName = (e) => (!e ? '?' : e.type === 'player' ? playerName(e.id) : cardName(e.id));
  const phaseLabel = (p) => (p || '').toLowerCase().replace(/_/g, ' ');

  function imageUrl(card, st) {
    const key = st?.props.ImageKey || '';
    if (!key.startsWith('c:')) return null; // tokens and hidden faces: text only
    const [name, set] = key.slice(2).split('|');
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}${set ? `&set=${encodeURIComponent(set.toLowerCase())}` : ''}&format=image&version=art_crop`;
  }

  function tile(card, attachedTo) {
    const p = card.props, st = stateOf(card), sp = st?.props ?? {};
    const type = String(sp.Type || '');
    const isCreature = /Creature/.test(type);
    const counters = Object.entries(p.Counters || {}).map(([k, v]) => `<span class="chip">${esc(k.toLowerCase())} ${v}</span>`).join('');
    const kids = ids(p.AttachedCards).map((id) => `<div class="att">↳ ${esc(cardName(id))}</div>`).join('');
    let pt = '';
    if (isCreature) {
      const dmg = p.Damage || 0;
      pt = `<div class="pt${dmg ? ' hurt' : ''}">${sp.Power ?? 0}/${(sp.Toughness ?? 0) - dmg}${dmg ? '*' : ''}</div>`;
    } else if (sp.Loyalty && sp.Loyalty !== '0') {
      pt = `<div class="pt">◇${esc(sp.Loyalty)}</div>`;
    }
    const img = imagesBox.checked ? imageUrl(card, st) : null;
    const cls = ['tile', p.Tapped && 'tapped', p.Attacking && 'attacking', p.Blocking && 'blocking', img && 'img'].filter(Boolean).join(' ');
    const style = img ? ` style="background-image:url('${img}')"` : '';
    const title = [p.Name || sp.Name, type, sp.ManaCost, sp.OracleText].filter(Boolean).join('\n');
    return `<div class="${cls}"${style} title="${esc(title)}">
      ${p.Token ? '<span class="tok">token</span>' : p.GamePieceType === 'EFFECT' ? '<span class="tok">effect</span>' : ''}
      <div class="nm">${esc(p.Name || sp.Name || '?')}</div>
      ${counters ? `<div class="chips">${counters}</div>` : ''}
      ${kids ? `<div class="attached">${kids}</div>` : ''}
      ${pt}
    </div>`;
  }

  function playerPanel(pl, g) {
    const p = pl.props;
    const zone = (z) => ids(p[z]).length;
    const poison = Object.entries(p.Counters || {}).find(([k]) => /poison/i.test(k))?.[1] || 0;
    const cmdDmg = Object.entries(p.CommanderDamage || {}).filter(([, d]) => d > 0)
      .map(([cid, d]) => `${esc(cardName(cid))} ${d}`).join(' · ');
    const bf = ids(p.Battlefield).map((id) => get('card', id)).filter(Boolean)
      .filter((c) => !c.props.EntityAttachedTo || c.props.EntityAttachedTo.type === 'player');
    const isLand = (c) => /Land/.test(String(stateOf(c)?.props.Type || ''));
    const nonLands = bf.filter((c) => !isLand(c)), lands = bf.filter(isLand);
    const command = ids(p.Command).map((id) => get('card', id)).filter(Boolean);
    const active = g?.props.PlayerTurn === pl.id;
    return `<article class="player${active ? ' active' : ''}${p.HasLost ? ' lost' : ''}">
      <div class="phead">
        <span class="pname">${esc(p.Name)}</span>
        <span class="life" title="Life">${p.Life ?? 0}</span>
      </div>
      <div class="badges">
        ${active ? '<span class="badge turn">active turn</span>' : ''}
        ${p.HasPriority ? '<span class="badge prio">priority</span>' : ''}
        ${poison ? `<span class="badge bad">poison ${poison}</span>` : ''}
        ${p.HasLost ? '<span class="badge bad">lost</span>' : ''}
      </div>
      <div class="zones">
        <span>Hand <b>${zone('Hand')}</b></span><span>Library <b>${zone('Library')}</b></span>
        <span>Graveyard <b>${zone('Graveyard')}</b></span><span>Exile <b>${zone('Exile')}</b></span>
        <span>Command <b>${zone('Command')}</b></span>
      </div>
      ${cmdDmg ? `<div class="cmd">Commander damage taken: ${cmdDmg}</div>` : ''}
      ${command.length ? `<div class="row-label">Command zone</div><div class="bf">${command.map((c) => tile(c)).join('')}</div>` : ''}
      <div class="row-label">Battlefield</div>
      <div class="bf">${nonLands.map((c) => tile(c)).join('') || '<span class="empty">—</span>'}</div>
      ${lands.length ? `<div class="bf" style="margin-top:6px">${lands.map((c) => tile(c)).join('')}</div>` : ''}
    </article>`;
  }

  function render() {
    const g = gameObj();
    if (!g) { $('turn').textContent = 'waiting for game…'; $('players').innerHTML = ''; return; }
    const gp = g.props;
    $('turn').textContent = gp.GameOver
      ? `Game over — ${gp.WinningPlayerName ? `${gp.WinningPlayerName} wins` : 'draw'} (turn ${gp.Turn})`
      : `Turn ${gp.Turn ?? 0} · ${phaseLabel(gp.Phase)} · ${playerName(gp.PlayerTurn)}`;
    $('players').innerHTML = ids(gp.Players).map((id) => get('player', id)).filter(Boolean).map((pl) => playerPanel(pl, g)).join('');

    const stack = ids(gp.Stack).map((id) => get('stackItem', id)).filter(Boolean);
    $('stack').innerHTML = stack.length ? stack.map((si) => {
      const s = si.props;
      const targets = [...ids(s.TargetCards).map(cardName), ...ids(s.TargetPlayers).map(playerName)];
      return `<li><b>${esc(cardName(s.SourceCard))}</b> <span class="muted">(${esc(playerName(s.ActivatingPlayer))})</span><br>${esc(s.Key || s.Description || '')}${targets.length ? `<br><span class="muted">→ ${esc(targets.join(', '))}</span>` : ''}</li>`;
    }).join('') : '<li class="empty">empty</li>';

    const bands = Array.isArray(gp.CombatView) ? gp.CombatView : [];
    $('combat').innerHTML = bands.length ? bands.map((b) =>
      `<li>${esc(b.attackers.map(cardName).join(' + '))} → <b>${esc(entityName(b.defender))}</b>${b.blockers.length ? `<br><span class="muted">blocked by ${esc(b.blockers.map(cardName).join(', '))}</span>` : ''}</li>`).join('')
      : '<li class="empty">no combat</li>';

    $('log').innerHTML = log.slice(-150).reverse().map((e) => `<li><span class="lt">${esc(e.type.toLowerCase())}</span>${esc(e.msg)}</li>`).join('');
  }

  connect();
})();
