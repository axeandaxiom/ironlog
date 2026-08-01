// The jiu-jitsu library.
//
// Two jobs, one screen: browse the technique library, and pick techniques to
// tag on a session being logged. Everything it says about your progress —
// drill counts, last-seen dates, the running totals at the top — is computed
// from logged sessions on every open. Nothing is stored here.

import { el, num, fmtClock } from '../util.js';
import * as store from '../store.js';
import { JJ_TYPES, JJ_TECHNIQUES } from '../data/jiujitsu.js';
import { sheet } from '../app.js';

const bySport = (db) => (db.sessions || []).filter(
  (s) => s.type === 'conditioning' && s.sport === 'jiu-jitsu');

/** How often each technique has been tagged, and when last. */
function drillStats(db) {
  const stats = {};
  for (const s of bySport(db)) {
    for (const t of s.techniques || []) {
      stats[t] ||= { count: 0, last: '' };
      stats[t].count++;
      if (s.date > stats[t].last) stats[t].last = s.date;
    }
  }
  return stats;
}

/** Mat-time headline: sessions, hours, rounds, subs both ways. */
function totals(db) {
  const ss = bySport(db);
  return {
    sessions: ss.length,
    hours: ss.reduce((a, s) => a + (s.durationMin || 0), 0) / 60,
    rounds: ss.reduce((a, s) => a + (s.rounds || 0), 0),
    subsFor: ss.reduce((a, s) => a + (s.subsFor || 0), 0),
    subsAgainst: ss.reduce((a, s) => a + (s.subsAgainst || 0), 0),
  };
}

/**
 * Open the library. With `pick`, rows toggle instead of expanding and the
 * chosen ids are handed back — that is the tagging flow inside a session log.
 */
export function openJJLibrary(ctx, { pick = null, selected = [] } = {}) {
  const db = store.get();
  const stats = drillStats(db);
  const chosen = new Set(selected);

  sheet(pick ? 'Tag techniques' : 'Jiu-jitsu library', (body, close) => {
    if (!pick) {
      const t = totals(db);
      body.append(el('div', { class: 'card tight' },
        el('div', { class: 'row', style: { justifyContent: 'space-around', textAlign: 'center' } },
          stat(t.sessions, 'Sessions'), stat(num(t.hours, 1), 'Hours'),
          stat(t.rounds, 'Rounds'), stat(`${t.subsFor}/${t.subsAgainst}`, 'Subs for/against'))));
      if (t.subsAgainst > t.subsFor && t.rounds > 10) {
        body.append(el('div', { class: 'note' },
          'You concede more than you land. That is not a verdict — it is a reading list: the escapes and defences below, most-conceded position first.'));
      }
    }

    const search = el('input', { type: 'search', placeholder: 'Search techniques…' });
    let typeFilter = null;
    const chips = el('div', { class: 'chips', style: { margin: '10px 0' } },
      JJ_TYPES.map((tp) => {
        const c = el('button', { class: 'chip', 'aria-pressed': 'false' }, tp.name);
        c.addEventListener('click', () => {
          typeFilter = typeFilter === tp.id ? null : tp.id;
          [...chips.children].forEach((x, i) =>
            x.setAttribute('aria-pressed', String(JJ_TYPES[i].id === typeFilter)));
          draw();
        });
        return c;
      }));

    const list = el('div', { class: 'list' });
    const draw = () => {
      list.replaceChildren();
      const q = search.value.trim().toLowerCase();
      const shown = JJ_TECHNIQUES.filter((t) =>
        (!typeFilter || t.type === typeFilter)
        && (!q || t.name.toLowerCase().includes(q) || t.pos.includes(q)));
      if (!shown.length) list.append(el('p', { class: 'sub' }, 'Nothing matches.'));
      for (const t of shown) {
        const st = stats[t.id];
        const row = el('button', { class: 'list-item', 'aria-pressed': String(chosen.has(t.id)) },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, t.name,
              chosen.has(t.id) ? el('span', { class: 'pill accent', style: { marginLeft: '7px' } }, '✓') : null),
            el('div', { class: 'li-sub' }, `${t.pos} · ${JJ_TYPES.find((x) => x.id === t.type).name}`),
            el('div', { class: 'li-sub dim' }, t.cue)),
          el('span', { class: 'li-right' },
            st ? `${st.count}×` : '—'));
        row.addEventListener('click', () => {
          if (!pick) return;
          chosen.has(t.id) ? chosen.delete(t.id) : chosen.add(t.id);
          draw();
        });
        list.append(row);
      }
    };
    search.addEventListener('input', draw);

    body.append(search, chips, list);
    draw();

    if (pick) {
      body.append(el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' },
        onclick: () => { pick([...chosen]); close(); } },
        'Done'));
    } else {
      body.append(el('div', { class: 'note', style: { marginTop: '12px' } },
        'The counts are how many logged sessions tag each technique — they come from your log, not from a stored score. Tag techniques when you log a jiu-jitsu session under Conditioning.'));
    }
  });
}

const stat = (v, label) => el('div', {},
  el('div', { style: { fontSize: '20px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' } }, String(v)),
  el('div', { class: 'li-sub' }, label));

void fmtClock;
