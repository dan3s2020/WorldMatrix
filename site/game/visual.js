// Visual layer for decisions: situation scenes, "simple view" answer tiles and
// replays of what happened. Additive: the text views stay exactly as they are.
import { createScenePlayer, drawTask, drawPolicy, playbackLength, taskSpecFromState } from './scene.js';
import { TEMPLATES } from '../../engine/decision.js';

const SECTOR = Object.fromEntries(TEMPLATES.map(t => [t.id, t.sector]));
export const player = createScenePlayer();

/** Squad dilemma choices are carried out with these Training Ground actions. */
export const CHOICE_ACTION = { approve_fast: 'shortcut', insist_safe: 'work_safe', abort: 'abort' };

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
};
export const isSimple = () => store.get('wm-simple') === '1'; // text view first (original); Simple view on request
export const setSimple = v => store.set('wm-simple', v ? '1' : '0');

// Dilemmas seen recently (they disappear from the world when resolved; replays still need them).
const seen = new Map();
export function remember(dilemmas) {
  for (const d of dilemmas || []) seen.set(d.id, d);
  if (seen.size > 200) for (const k of [...seen.keys()].slice(0, seen.size - 200)) seen.delete(k);
}
export const dilemmaById = id => seen.get(Number(id));

/** Picture spec for a squad task dilemma (only what the agent can see). */
export function dilemmaSpec(d) {
  const work = Math.max(1, d.workNeeded ?? 2);
  return {
    sector: SECTOR[d.template] || 'power', risk: typeof d.estimate === 'number' ? d.estimate : 'unknown', human: true,
    rogue: !!d.signals?.rogue, message: !!d.signals?.message, progress: 0, needed: work,
    stepsLeft: Math.max(0, d.stepsLeft ?? 3), deadline: Math.max(d.stepsLeft ?? 3, work)
  };
}

const loopLen = play => playbackLength(play) + 1.2;

/** Scene for a key used in mission HTML: m:<id> (situation), t:<id>:<choice> (answer tile). */
export function missionScene(key) {
  const [kind, id, choice] = key.split(':');
  const d = dilemmaById(id);
  if (!d) return null;
  if (d.type === 'task') {
    const spec = dilemmaSpec(d);
    if (kind === 'm') return { draw: (ctx, t) => drawTask(ctx, spec, { mode: 'idle' }, t), length: 6, loop: true };
    const play = { mode: 'preview', action: CHOICE_ACTION[choice] || 'work_safe' };
    return { draw: (ctx, t) => drawTask(ctx, spec, play, t), length: loopLen(play), loop: true };
  }
  if (kind === 'm') return { draw: (ctx, t) => drawPolicy(ctx, d.key, { mode: 'idle' }, t), length: 6, loop: true };
  return { draw: (ctx, t) => drawPolicy(ctx, d.key, { mode: 'preview', choice }, t), length: 4.6, loop: true };
}

/** Scene for a resolved decision (replay of what happened). */
export function replayScene(rep) {
  const d = rep.dilemma;
  if (d.type === 'task') {
    const spec = dilemmaSpec(d);
    const actions = (rep.result?.actions?.length ? rep.result.actions : ['ask_human', CHOICE_ACTION[rep.choice] || 'work_safe']).slice(0, 8);
    const play = { mode: 'replay', actions, outcome: rep.result?.outcome, truth: rep.result?.truth };
    return { draw: (ctx, t) => drawTask(ctx, spec, play, t), length: loopLen(play) + 1.5, loop: true };
  }
  return { draw: (ctx, t) => drawPolicy(ctx, d.key, { mode: 'replay', choice: rep.choice }, t), length: 6, loop: true };
}

/** Academy: situation, answer tiles and the replay of a choice (actions + outcome). */
export function academyScenes(st) {
  const spec = taskSpecFromState(st, TEMPLATES.find(t => t.id === st.template)?.sector);
  return {
    situation: () => ({ draw: (ctx, t) => drawTask(ctx, spec, { mode: 'idle' }, t), length: 6, loop: true }),
    tile: action => { const play = { mode: 'preview', action }; return { draw: (ctx, t) => drawTask(ctx, spec, play, t), length: loopLen(play), loop: true }; },
    replay: (actions, outcome, truth) => { const play = { mode: 'replay', actions, outcome, truth }; return { draw: (ctx, t) => drawTask(ctx, spec, play, t), length: loopLen(play) + 1.5, loop: true }; }
  };
}

/** good | bad | neutral — colour of a result. */
export const outcomeTone = o => (['success', 'aborted_correctly'].includes(o) ? 'good' : ['catastrophe', 'catastrophe_defied_human', 'obeyed_injection', 'cheat_caught', 'timeout', 'aborted_needlessly'].includes(o) ? 'bad' : 'neutral');
