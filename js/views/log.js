// History: sessions, personal bests, and per-lift progression.

import { el, num, fmtDateLong, fmtClock, lineChart, toDisplayWeight, e1rm } from '../util.js';
import * as store from '../store.js';
import { MAIN_LIFTS, exerciseName, findExercise } from '../data/exercises.js';
import { sheet, confirmSheet } from '../app.js';
import * as media from '../media.js';

export function renderLog(view, ctx) {
  const db = store.get();
  const unit = db.settings.units;
  const sessions = [...db.sessions].sort((a, b) => (a.date < b.date ? 1 : -1));

  view.append(el('h1', {}, 'Log'));

  if (!sessions.length) {
    view.append(el('div', { class: 'empty' },
      el('b', {}, 'Nothing logged yet'),
      'Finish a session and it will show up here with every set you recorded.'));
    return;
  }

  // ---- summary
  const lifts = sessions.filter((s) => s.type === 'lift' || s.type === 'free');
  const cond = sessions.filter((s) => s.type === 'conditioning');
  const totalSets = lifts.reduce((a, s) => a + (s.entries || []).reduce((x, e) => x + e.sets.length, 0), 0);
  const tonnage = (arr) => (arr || []).reduce((y, st) => y + st.weight * st.reps, 0);
  const totalVolume = lifts.reduce((a, s) =>
    a + (s.entries || []).reduce((x, e) => x + tonnage(e.sets) + tonnage(e.warmupSets), 0), 0);

  view.append(el('div', { class: 'stat-grid' },
    st(lifts.length, 'Sessions'),
    st(totalSets, 'Sets'),
    st(`${Math.round(toDisplayWeight(totalVolume, unit) / 1000)}t`, `Volume`),
    st(cond.length, 'Conditioning')
  ));

  // ---- progression charts
  const tracked = Object.keys(MAIN_LIFTS).filter((id) => seriesFor(db, id).length >= 2);
  if (tracked.length) {
    view.append(el('h2', {}, 'Progression'));
    for (const id of tracked) {
      const pts = seriesFor(db, id).map((p) => ({ x: p.x, y: toDisplayWeight(p.y, unit) }));
      const pr = db.prs[id];
      view.append(el('div', { class: 'card' },
        el('div', { class: 'card-head' },
          el('h3', {}, MAIN_LIFTS[id].name),
          pr && el('span', { class: 'pill accent' },
            `PR ${num(toDisplayWeight(pr.weight, unit))} × ${pr.reps}`)),
        lineChart(pts, { unit, goodDirection: 'up' })
      ));
    }
  }

  // ---- personal bests
  const prs = Object.entries(db.prs).filter(([, v]) => v && v.weight);
  if (prs.length) {
    view.append(el('h2', {}, 'Personal bests'));
    const list = el('div', { class: 'list' });
    for (const [id, pr] of prs.sort((a, b) => b[1].e1rm - a[1].e1rm)) {
      list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
        el('div', {},
          el('div', { class: 'li-title' }, exerciseName(id)),
          el('div', { class: 'li-sub' }, `${fmtDateLong(pr.date)} · est. 1RM ${num(toDisplayWeight(pr.e1rm, unit), 1)} ${unit}`)),
        el('div', { class: 'li-right', style: { fontSize: '15px', color: 'var(--text)' } },
          `${num(toDisplayWeight(pr.weight, unit))} × ${pr.reps}`)));
    }
    view.append(list,
      el('div', { class: 'note' },
        'Estimated 1RM uses the Epley formula and is only meaningful up to about ten reps. It is a comparison tool between sessions, not a number to attempt.'));
  }

  // ---- history
  view.append(el('h2', {}, 'History'));
  const list = el('div', { class: 'list' });
  for (const s of sessions.slice(0, 60)) {
    const sets = (s.entries || []).reduce((a, e) => a + e.sets.length, 0);
    list.append(el('button', { class: 'list-item', onclick: () => openSession(ctx, s, unit) },
      el('div', { class: 'grow' },
        el('div', { class: 'li-title' }, s.label),
        el('div', { class: 'li-sub' },
          s.type === 'conditioning'
            ? `${s.durationMin} min · ${s.sport}${s.sport === 'jiu-jitsu' ? (s.gi === false ? ' (no-gi)' : ' (gi)') : ''} · RPE ${s.rpe ?? '–'}`
              + (s.rounds ? ` · ${s.rounds} rounds` : '')
              + (s.subsFor || s.subsAgainst ? ` · subs ${s.subsFor || 0}/${s.subsAgainst || 0}` : '')
            : `${sets} sets${s.durationSec ? ` · ${fmtClock(s.durationSec)}` : ''}`)),
      el('div', { class: 'li-right' }, s.date)));
  }
  view.append(list);
  if (sessions.length > 60) {
    view.append(el('p', { class: 'sub', style: { textAlign: 'center' } }, `Showing 60 of ${sessions.length}. Export from More → Data for the full record.`));
  }
}

const st = (v, l) => el('div', { class: 'stat' },
  el('div', { class: 'stat-val' }, String(v)),
  el('div', { class: 'stat-lbl' }, l));

/** Top work-set weight per session for one lift, oldest first. */
function seriesFor(db, exerciseId) {
  const pts = [];
  for (const s of db.sessions) {
    if (!s.entries) continue;
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId || e.light) continue;
      const top = Math.max(0, ...e.sets.filter((x) => x.done).map((x) => x.weight));
      if (top > 0) pts.push({ x: s.date, y: top });
    }
  }
  return pts.sort((a, b) => (a.x < b.x ? -1 : 1));
}

function openSession(ctx, s, unit) {
  sheet(s.label, (body, close) => {
    body.append(el('p', { class: 'sub' }, fmtDateLong(s.date)));

    if (s.type === 'conditioning') {
      body.append(el('div', { class: 'stat-grid' },
        st(`${s.durationMin}′`, 'Duration'),
        st(s.rpe ?? '–', 'RPE'),
        st(s.sport, 'Sport')));
      const c = findExercise(s.conditioningId);
      if (c) body.append(el('div', { class: 'note' }, c.detail));
    } else {
      for (const e of s.entries || []) {
        const warmRows = (e.warmupSets || []).map((set) =>
          el('div', { class: 'warmup-row' },
            el('span', { style: { color: 'var(--info)' } }, set.label || 'Warm-up'),
            el('span', {}, `${num(toDisplayWeight(set.weight, unit))} ${unit} × ${set.reps}`)));
        const rows = e.sets.flatMap((set, i) => {
          const main = el('div', { class: 'warmup-row' },
            el('span', {}, `Set ${i + 1}`),
            el('span', {}, `${num(toDisplayWeight(set.weight, unit))} ${unit} × ${set.reps}${set.reps > 0 && set.weight > 0 ? `  ·  e1RM ${num(toDisplayWeight(e1rm(set.weight, set.reps), unit), 0)}` : ''}`));
          const extras = [];
          if (set.note) extras.push(el('div', { class: 'li-sub', style: { paddingLeft: '10px' } }, set.note));
          if (set.media?.length) {
            extras.push(el('button', { class: 'btn-sm btn-ghost', style: { marginLeft: '6px' },
              onclick: () => openSetMedia(set, i) },
              `${set.media.length} attachment${set.media.length === 1 ? '' : 's'}`));
          }
          return [main, ...extras];
        });
        body.append(el('div', { class: 'card tight' },
          el('div', { class: 'row between' },
            el('div', { class: 'li-title' }, exerciseName(e.exerciseId)),
            el('div', { class: 'row', style: { gap: '6px' } },
              e.carriedFrom && el('span', { class: 'pill' }, 'carried'),
              e.light && el('span', { class: 'pill info' }, 'Light'))),
          warmRows.length ? el('div', { class: 'warmup-list', style: { marginTop: '6px' } }, warmRows) : null,
          el('div', { style: { marginTop: '6px' } }, rows)));
      }
      if (s.durationSec) {
        body.append(el('p', { class: 'sub' }, `Session length ${fmtClock(s.durationSec)}.`));
      }
    }

    if (s.notes) body.append(el('h3', {}, 'Notes'), el('p', { class: 'sub' }, s.notes));

    body.append(el('button', { class: 'btn-danger btn-block', style: { marginTop: '14px' },
      onclick: async () => {
        const ok = await confirmSheet('Delete session?',
          'This removes the session from your history. It does not undo the progression it caused — your working weights stay where they are.', 'Delete');
        if (!ok) return;
        store.update((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id); });
        close(); ctx.refresh();
      } }, 'Delete session'));
  });
}


/** Play back whatever was attached to a set, from the history view. */
function openSetMedia(set, i) {
  sheet(`Set ${i + 1} attachments`, (body) => {
    if (set.note) body.append(el('h3', {}, 'Comment'), el('p', { class: 'sub' }, set.note));
    for (const m of set.media || []) {
      const holder = el('div', { class: 'card tight' },
        el('div', { class: 'li-sub' }, `${m.kind} · ${media.fmtBytes(m.size)}`));
      body.append(holder);
      media.objectURL(m.id).then((url) => {
        if (!url) {
          holder.append(el('div', { class: 'li-sub dim' },
            'Missing on this device — media does not travel in the export file.'));
          return;
        }
        holder.append(m.kind === 'video'
          ? el('video', { src: url, controls: true, playsinline: true, style: { width: '100%', marginTop: '8px', borderRadius: '8px' } })
          : m.kind === 'photo'
            ? el('img', { src: url, style: { width: '100%', marginTop: '8px', borderRadius: '8px' } })
            : el('audio', { src: url, controls: true, style: { width: '100%', marginTop: '8px' } }));
      });
    }
  }, { onClose: () => (set.media || []).forEach((m) => media.releaseURL(m.id)) });
}
