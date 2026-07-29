// Attaching a comment, a voice note or a clip to one specific set.
//
// The rule that shapes this screen: nothing here may stop a running timer.
// The round clock and the rest clock both live outside the view and both
// derive their time from the wall clock, so opening this sheet, recording
// audio, or attaching a video leaves them running and correct. The audio note
// is recorded in-page for exactly that reason — handing off to the system
// recorder would suspend the page and silence the bells.

import { el, uid, fmtClock, toast, buzz } from '../util.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { hasAttachments } from '../media.js';
import { exerciseName } from '../data/exercises.js';
import { sheet, confirmSheet } from '../app.js';

export { hasAttachments };

const KINDS = {
  video: { label: 'Video', accept: 'video/*', capture: 'environment', icon: '▶' },
  photo: { label: 'Photo', accept: 'image/*', capture: 'environment', icon: '◼' },
  audio: { label: 'Audio', accept: 'audio/*', icon: '♪' },
};

export function openAttachments(ctx, entry, set, index, { warmup = false, onChange } = {}) {
  sheet(`${exerciseName(entry.exerciseId)} — ${warmup ? 'warm-up' : 'set'} ${index + 1}`, (body, close) => {
    set.media ||= [];

    body.append(el('div', { class: 'note' },
      el('b', {}, 'Timers keep running. '),
      'The round clock and the rest clock read from the system time, so they stay correct while this is open and while you record. Recording audio happens inside the app so the bells keep sounding; attaching a video hands off to the camera, which pauses the sound until you come back — the clock itself is unaffected.'));

    // ---- comment ----
    const note = el('textarea', {
      value: set.note || '',
      placeholder: 'What happened on this set. Depth, bar path, where it slowed, how it felt.',
    });
    note.addEventListener('change', () => {
      set.note = note.value;
      store.save();
      onChange?.();
    });
    body.append(el('h3', {}, 'Comment'), note);

    // ---- attached media ----
    const list = el('div', { class: 'list', style: { marginTop: '8px' } });
    const drawList = async () => {
      list.replaceChildren();
      if (!set.media.length) {
        list.append(el('p', { class: 'sub' }, 'Nothing attached yet.'));
        return;
      }
      for (const m of set.media) {
        const row = el('div', { class: 'list-item', style: { cursor: 'default' } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, `${KINDS[m.kind]?.icon || '•'} ${KINDS[m.kind]?.label || m.kind}`),
            el('div', { class: 'li-sub' },
              `${media.fmtBytes(m.size)}${m.seconds ? ` · ${fmtClock(m.seconds)}` : ''} · ${new Date(m.ts).toLocaleTimeString()}`)),
          el('div', { class: 'row', style: { gap: '6px' } },
            el('button', { class: 'btn-sm', onclick: () => openPlayer(m) }, 'Open'),
            el('button', { class: 'btn-sm btn-danger', 'aria-label': 'Delete', onclick: async () => {
              const ok = await confirmSheet('Delete attachment?',
                'This removes the file from the device. It cannot be undone.', 'Delete');
              if (!ok) return;
              await media.remove(m.id);
              media.releaseURL(m.id);
              set.media = set.media.filter((x) => x.id !== m.id);
              store.save();
              onChange?.();
              drawList();
            } }, '✕')));
        list.append(row);
      }
    };

    body.append(el('h3', { style: { marginTop: '16px' } }, 'Attachments'), list);
    drawList();

    if (!media.supported) {
      body.append(el('div', { class: 'note bad' },
        'This browser has no IndexedDB, so media cannot be stored. Comments still work.'));
      return;
    }

    // ---- capture ----
    const addFile = (kind) => {
      const cfg = KINDS[kind];
      const input = el('input', {
        type: 'file', accept: cfg.accept, style: { display: 'none' },
      });
      if (cfg.capture) input.setAttribute('capture', cfg.capture);
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const id = `m-${uid()}`;
          const meta = await media.put(id, file, { kind, name: file.name });
          set.media.push({ id, kind, size: meta.size, mime: meta.mime, ts: meta.ts });
          store.save();
          onChange?.();
          toast(`${cfg.label} attached — ${media.fmtBytes(meta.size)}`, 'good');
          drawList();
        } catch (err) {
          toast(`Could not save: ${err.message}`, 'bad');
        } finally {
          input.remove();
        }
      });
      document.body.append(input);
      input.click();
    };

    body.append(
      el('h3', { style: { marginTop: '16px' } }, 'Add'),
      el('div', { class: 'btn-row' },
        el('button', { onclick: () => addFile('video') }, '▶ Video'),
        el('button', { onclick: () => addFile('photo') }, '◼ Photo'))
    );

    // ---- in-app audio note ----
    if (media.AudioNote.supported) {
      let rec = null;
      let ticker = null;
      const timeOut = el('div', { class: 'li-sub', style: { textAlign: 'center', marginTop: '6px' } }, '');
      const recBtn = el('button', { class: 'btn-block', style: { marginTop: '8px' } }, '♪ Record a voice note');

      recBtn.addEventListener('click', async () => {
        if (rec) {
          clearInterval(ticker);
          const blob = await rec.stop().catch((e) => { toast(e.message, 'bad'); return null; });
          rec = null;
          recBtn.textContent = '♪ Record a voice note';
          recBtn.classList.remove('btn-danger');
          timeOut.textContent = '';
          if (!blob) return;
          const id = `m-${uid()}`;
          const meta = await media.put(id, blob, { kind: 'audio' });
          set.media.push({ id, kind: 'audio', size: meta.size, mime: meta.mime, ts: meta.ts });
          store.save();
          onChange?.();
          buzz(40);
          toast(`Voice note saved — ${media.fmtBytes(meta.size)}`, 'good');
          drawList();
          return;
        }
        try {
          rec = new media.AudioNote();
          await rec.start();
          recBtn.textContent = '■ Stop recording';
          recBtn.classList.add('btn-danger');
          ticker = setInterval(() => { timeOut.textContent = fmtClock(rec.seconds); }, 250);
        } catch (err) {
          rec = null;
          toast(err.name === 'NotAllowedError'
            ? 'Microphone access was declined.'
            : `Could not record: ${err.message}`, 'bad');
        }
      });

      body.append(recBtn, timeOut,
        el('div', { class: 'li-sub', style: { marginTop: '6px' } },
          'Recorded in the app, so the round bells keep sounding while you talk.'));
    } else {
      body.append(el('div', { class: 'note warn', style: { marginTop: '8px' } },
        'This browser cannot record audio in-page. Use the Audio button to attach a file recorded elsewhere.'),
        el('button', { class: 'btn-block', onclick: () => addFile('audio') }, '♪ Attach an audio file'));
    }

    body.append(el('div', { class: 'note warn', style: { marginTop: '14px' } },
      el('b', {}, 'Media stays on this device. '),
      'Video is far too large to put through the export file, so an export carries your comments and the list of what was attached, but not the files themselves. Save anything you want to keep with the Open button.'));
  }, { onClose: () => onChange?.() });
}

/** Play or view one attachment. */
function openPlayer(m) {
  sheet(KINDS[m.kind]?.label || 'Attachment', (body) => {
    const holder = el('div', { style: { textAlign: 'center' } }, el('p', { class: 'sub' }, 'Loading…'));
    body.append(holder);

    media.objectURL(m.id).then((url) => {
      if (!url) { holder.replaceChildren(el('p', { class: 'sub' }, 'The file is missing from this device.')); return; }
      let node;
      if (m.kind === 'video') {
        node = el('video', { src: url, controls: true, playsinline: true,
          style: { width: '100%', borderRadius: '10px', maxHeight: '60vh' } });
      } else if (m.kind === 'photo') {
        node = el('img', { src: url, style: { width: '100%', borderRadius: '10px' } });
      } else {
        node = el('audio', { src: url, controls: true, style: { width: '100%' } });
      }
      holder.replaceChildren(node,
        el('a', { href: url, download: `ironlog-${m.kind}-${m.id}`, class: 'btn btn-block',
          style: { marginTop: '12px', display: 'block', textAlign: 'center', textDecoration: 'none' } },
          'Save to device'));
    });
  }, { onClose: () => media.releaseURL(m.id) });
}
