type Color = { r?: number; g?: number; b?: number; a?: number };
import { beatTickToSeconds, getEditTimeY, getEditorXOffset, getVerticalDensity, isEditMode } from "./editMode";
type Point = { time: number; xPosition: number; color: Color; easeType?: number; canvasIndex: number; floorPosition?: number };
type Note = { type: number; time: number; floorPosition?: number; otherInformations?: number[] };
type ColorPoint = { time: number; startColor: Color; endColor: Color };
type Line = { linePoints: Point[]; notes: Note[]; judgeRingColor: ColorPoint[]; lineColor: ColorPoint[] };
type KeyPoint = { time: number; value: number; easeType?: number; floorPosition?: number };
type Theme = { colorsList: Color[] };
type Challenge = { start: number; end: number; transTime: number };
type CanvasMove = { index: number; xPositionKeyPoints: KeyPoint[]; speedKeyPoints: KeyPoint[] };
type EditorChart = { bPM?: number; bpm?: number; bpmShifts?: KeyPoint[]; themes?: Theme[]; challengeTimes?: Challenge[]; lines: Line[]; canvasMoves: CanvasMove[]; cameraMove: { xPositionKeyPoints: KeyPoint[]; scaleKeyPoints: KeyPoint[] } };

export function defaultEndTick(): number {
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  const duration = audio?.duration;
  if (duration && Number.isFinite(duration) && duration > 0 && chart) return secondsToTick(duration);
  return Number.POSITIVE_INFINITY;
}

export function defaultKeyPoint(time: number, value: number): KeyPoint {
  return { time, value, easeType: 0, floorPosition: 0 };
}

export function defaultColorPoint(time: number): ColorPoint {
  return {
    time,
    startColor: { r: 255, g: 255, b: 255, a: 255 },
    endColor: { r: 255, g: 255, b: 255, a: 255 },
  };
}

export function createEmptyCanvasMove(index: number): CanvasMove {
  return {
    index,
    xPositionKeyPoints: [defaultKeyPoint(0, 0), defaultKeyPoint(defaultEndTick(), 0)],
    speedKeyPoints: [defaultKeyPoint(0, 1), defaultKeyPoint(defaultEndTick(), 1)],
  };
}

type Selection = { kind: "line" | "point" | "note" | "canvasX" | "canvasSpeed" | "cameraX" | "cameraScale"; line?: Line; point?: Point; note?: Note; item?: KeyPoint };

export interface EditorVisualState {
  chart: EditorChart | null;
  selected: Selection | null;
  selectedItems: Selection[];
  mode: string;
  canvasIndex: number;
  marquee: { x0: number; time0: number; x1: number; time1: number } | null;
  pastePreview: {
    x: number;
    time: number;
    kind: string;
    lines: Array<{ points: Point[]; notes: Array<Note & { previewX: number }> }>;
    keys: KeyPoint[];
  } | null;
}

let chart: EditorChart | null = null;
let selected: Selection | null = null;
const undoStack: string[] = [];
let mouseX = 0;
let mouseY = 0;
let editorCanvas: HTMLCanvasElement | null = null;
let dragging = false;
let dragReady = false;
let dragStartX = 0;
let dragStartY = 0;
let dragSelection: Selection | null = null;
let dragSnapshot = "";
let selectedItems: Selection[] = [];
let marquee: { x0: number; time0: number; x1: number; time1: number } | null = null;
let pasteMode = false;
let boxSelectMode = false;
let clipboard: { originX: number; originTime: number; lines: Array<{ points: Point[]; notes: Note[] }>; keys: KeyPoint[]; kind: string } | null = null;
let pasteMirror = false;
let pointerMoved = false;
let speedEaseType = 0;

function editingCanvasIndex(): number {
  const input = document.querySelector<HTMLInputElement>("#editingCanvasIndex");
  return Math.max(0, Math.trunc(Number(input?.value) || 0));
}

function selectedValue(): Point | Note | Line | KeyPoint | null {
  if (!selected) return null;
  return selected.point ?? selected.note ?? selected.item ?? selected.line ?? null;
}

function notifyChange(): void {
  if (!chart) return;
  window.dispatchEvent(new CustomEvent("chartchanged", { detail: chart }));
}

export function setEditorChart(value: unknown): void {
  chart = value as EditorChart;
  selected = null;
  selectedItems = [];
  pasteMode = false;
  boxSelectMode = false;
  refreshProperties();
  refreshSettings();
}

export function applyMusicEndTicks(): void {
  if (!chart) return;
  const end = defaultEndTick();
  if (!Number.isFinite(end)) return;
  const patch = (points?: Array<{ time: number }>) => {
    if (!points?.length) return;
    const last = points[points.length - 1];
    if (!Number.isFinite(last.time)) last.time = end;
  };
  patch(chart.bpmShifts);
  patch(chart.cameraMove.xPositionKeyPoints);
  patch(chart.cameraMove.scaleKeyPoints);
  for (const move of chart.canvasMoves) {
    patch(move.xPositionKeyPoints);
    patch(move.speedKeyPoints);
  }
  for (const line of chart.lines) {
    patch(line.lineColor);
    patch(line.judgeRingColor);
  }
  notifyChange();
  refreshSettings();
  refreshProperties();
}

function colorHex(value: Color | undefined): string {
  const channel = (channelValue: number | undefined) => Math.max(0, Math.min(255, Math.round(channelValue ?? 255))).toString(16).padStart(2, "0");
  return `#${channel(value?.r)}${channel(value?.g)}${channel(value?.b)}`;
}

function hexColor(value: string, alpha = 255): Color {
  const clean = value.replace("#", "");
  const parse = (part: string) => {
    const parsed = Number.parseInt(part, 16);
    return Number.isFinite(parsed) ? parsed : 255;
  };
  return { r: parse(clean.slice(0, 2)), g: parse(clean.slice(2, 4)), b: parse(clean.slice(4, 6)), a: channel(alpha) };
}

function channel(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 255;
}

function clampNumber(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readClamped(input: HTMLInputElement, min: number, max: number, fallback: number): number {
  const next = clampNumber(Number(input.value), min, max, fallback);
  if (String(next) !== input.value) input.value = String(next);
  return next;
}

function mixDisplayed(base: Color | undefined, overlay: Color | undefined): Color {
  if (!overlay) return base ?? { r: 255, g: 255, b: 255, a: 255 };
  if (channel(overlay.a) >= 255) return overlay;
  const ratio = channel(overlay.a) / 255;
  return {
    r: channel(base?.r) + (channel(overlay.r) - channel(base?.r)) * ratio,
    g: channel(base?.g) + (channel(overlay.g) - channel(base?.g)) * ratio,
    b: channel(base?.b) + (channel(overlay.b) - channel(base?.b)) * ratio,
    a: channel(overlay.a),
  };
}

function overlayFromDisplayed(displayed: Color): Color {
  return { r: channel(displayed.r), g: channel(displayed.g), b: channel(displayed.b), a: channel(displayed.a) };
}

function lineBaseColor(line: Line): Color {
  return line.linePoints[0]?.color ?? { r: 255, g: 255, b: 255, a: 255 };
}

function colorField(label: string, colorValue: Color | undefined, field: string): string {
  return `<label class="fieldRow"><span>${label}</span><span class="colorField"><input data-field="${field}" type="color" value="${colorHex(colorValue)}"><input data-alpha="${field}" type="number" min="0" max="255" step="1" value="${channel(colorValue?.a)}" title="A"></span></label>`;
}

function applyColorInput(target: Color, input: HTMLInputElement): Color {
  if (input.dataset.field) return hexColor(input.value, target.a);
  if (input.dataset.alpha) return { ...target, a: clampNumber(Number(input.value), 0, 255, channel(target.a)) };
  return target;
}

function lineStartTick(line?: Line): number {
  if (!line?.linePoints.length) return 0;
  return Math.min(...line.linePoints.map((point) => point.time));
}

function nextColorKeyframeTime(line: Line, points: ColorPoint[]): number {
  const start = lineStartTick(line);
  if (points.length === 0) return start;
  return Math.max(start, ...points.map((point) => point.time));
}

function renderColorKeyframes(container: HTMLElement, points: ColorPoint[], mixed: boolean, base: Color, minTime = 0): void {
  container.replaceChildren();
  points.forEach((point, index) => {
    if (point.time < minTime) point.time = minTime;
    const card = document.createElement("div");
    card.className = "editorCard";
    const start = mixed ? mixDisplayed(base, point.startColor) : point.startColor;
    const end = mixed ? mixDisplayed(base, point.endColor) : point.endColor;
    card.innerHTML = `<label class="fieldRow"><span>时间 tick</span><input data-field="time" type="number" step="0.01" min="${minTime}" value="${point.time}"></label>${colorField("起始色", start, "startColor")}${colorField("结束色", end, "endColor")}<button type="button">删除关键帧</button>`;
    card.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      snapshot();
      const field = (input as HTMLInputElement).dataset.field ?? (input as HTMLInputElement).dataset.alpha;
      if (field === "time") point.time = readClamped(input as HTMLInputElement, minTime, 1_000_000, minTime);
      if (field === "startColor") {
        const next = applyColorInput(start, input as HTMLInputElement);
        point.startColor = mixed ? overlayFromDisplayed(next) : next;
      }
      if (field === "endColor") {
        const next = applyColorInput(end, input as HTMLInputElement);
        point.endColor = mixed ? overlayFromDisplayed(next) : next;
      }
      notifyChange();
      refreshProperties();
    }));
    card.querySelector("button")?.addEventListener("click", () => {
      snapshot();
      points.splice(index, 1);
      notifyChange();
      refreshProperties();
    });
    container.append(card);
  });
}

function refreshSettings(): void {
  if (!chart) return;
  const bpmInput = document.querySelector<HTMLInputElement>("#baseBpm");
  if (bpmInput) bpmInput.value = String(chart.bPM ?? chart.bpm ?? 120);
  const bpmList = document.querySelector<HTMLDivElement>("#bpmShiftList");
  if (bpmList) {
    bpmList.replaceChildren();
    const baseBpm = chart.bPM ?? chart.bpm ?? 120;
    (chart.bpmShifts ??= []).forEach((shift, index) => {
      const row = document.createElement("div"); row.className = "editorCard";
      const bpm = baseBpm * (shift.value ?? 1);
      row.innerHTML = `<label class="fieldRow"><span>时间 tick</span><input data-field="time" type="number" step="0.01" value="${shift.time}"></label><label class="fieldRow"><span>实际 BPM</span><input data-field="bpm" type="number" min="0.01" step="0.01" value="${bpm}"></label><button type="button">删除变化</button>`;
      row.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
        snapshot();
        const field = (input as HTMLInputElement).dataset.field;
        if (field === "bpm") shift.value = readClamped(input as HTMLInputElement, 1, 999, baseBpm) / baseBpm;
        else shift.time = readClamped(input as HTMLInputElement, 0, 1_000_000, 0);
        notifyChange();
      }));
      row.querySelector("button")?.addEventListener("click", () => { snapshot(); chart?.bpmShifts?.splice(index, 1); notifyChange(); refreshSettings(); });
      bpmList.append(row);
    });
  }
  const themeList = document.querySelector<HTMLDivElement>("#themeList");
  if (themeList) {
    themeList.replaceChildren();
    (chart.themes ??= []).forEach((theme, index) => {
      const row = document.createElement("div"); row.className = "editorCard";
      const labels = ["背景色", "Note色", "特效色"];
      const colors = [0, 1, 2].map((colorIndex) => colorField(labels[colorIndex], theme.colorsList[colorIndex], String(colorIndex))).join("");
      row.innerHTML = `<div class="propertyEditorTitle">${index === 0 ? "基础主题" : `Riztime 主题 ${index}`}</div>${colors}<button type="button">删除主题</button>`;
      row.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
        snapshot();
        const colorIndex = Number((input as HTMLInputElement).dataset.field ?? (input as HTMLInputElement).dataset.alpha);
        const current = theme.colorsList[colorIndex] ?? { r: 255, g: 255, b: 255, a: 255 };
        theme.colorsList[colorIndex] = applyColorInput(current, input as HTMLInputElement);
        notifyChange();
        refreshSettings();
      }));
      row.querySelector("button")?.addEventListener("click", () => { if (index === 0) return; snapshot(); chart?.themes?.splice(index, 1); chart?.challengeTimes?.splice(index - 1, 1); notifyChange(); refreshSettings(); });
      themeList.append(row);
    });
  }
  const challengeList = document.querySelector<HTMLDivElement>("#challengeList");
  if (challengeList) {
    challengeList.replaceChildren();
    (chart.challengeTimes ??= []).forEach((challenge, index) => {
      const row = document.createElement("div"); row.className = "editorCard";
      row.innerHTML = `<label class="fieldRow"><span>开始 tick</span><input data-field="start" type="number" step="0.01" value="${challenge.start}"></label><label class="fieldRow"><span>结束 tick</span><input data-field="end" type="number" step="0.01" value="${challenge.end}"></label><label class="fieldRow"><span>过渡秒</span><input data-field="transTime" type="number" step="0.01" value="${challenge.transTime}"></label><button type="button">删除 Riztime</button>`;
      row.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
        snapshot();
        const field = (input as HTMLInputElement).dataset.field as "start" | "end" | "transTime";
        if (field === "transTime") challenge.transTime = readClamped(input as HTMLInputElement, 0, 60, 0);
        else if (field === "start") challenge.start = readClamped(input as HTMLInputElement, 0, 1_000_000, 0);
        else challenge.end = Math.max(challenge.start, readClamped(input as HTMLInputElement, 0, 1_000_000, challenge.start));
        notifyChange();
      }));
      row.querySelector("button")?.addEventListener("click", () => { snapshot(); chart?.challengeTimes?.splice(index, 1); chart?.themes?.splice(index + 1, 1); notifyChange(); refreshSettings(); });
      challengeList.append(row);
    });
  }
}

function setupSettings(): void {
  document.querySelector<HTMLInputElement>("#baseBpm")?.addEventListener("change", (event) => {
    if (!chart) return;
    snapshot();
    chart.bPM = readClamped(event.target as HTMLInputElement, 1, 999, 120);
    notifyChange();
  });
  document.querySelector("#addBpmShift")?.addEventListener("click", () => { if (!chart) return; snapshot(); (chart.bpmShifts ??= []).push({ time: 0, value: 1 }); refreshSettings(); notifyChange(); });
  document.querySelector("#addTheme")?.addEventListener("click", () => { if (!chart) return; snapshot(); (chart.themes ??= []).push({ colorsList: [{ r: 20, g: 20, b: 20, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] }); (chart.challengeTimes ??= []).push({ start: 0, end: 0, transTime: 0 }); refreshSettings(); notifyChange(); });
  document.querySelector("#addChallenge")?.addEventListener("click", () => { if (!chart) return; snapshot(); (chart.challengeTimes ??= []).push({ start: 0, end: 0, transTime: 0 }); (chart.themes ??= []).push({ colorsList: [{ r: 20, g: 20, b: 20, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] }); refreshSettings(); notifyChange(); });
  document.querySelector("#addLineColor")?.addEventListener("click", () => {
    if (!selected?.line) return;
    snapshot();
    selected.line.lineColor.push({ time: nextColorKeyframeTime(selected.line, selected.line.lineColor), startColor: { r: 255, g: 255, b: 255, a: 255 }, endColor: { r: 255, g: 255, b: 255, a: 255 } });
    notifyChange();
    refreshProperties();
  });
  document.querySelector("#addJudgeColor")?.addEventListener("click", () => {
    if (!selected?.line) return;
    snapshot();
    selected.line.judgeRingColor.push({ time: nextColorKeyframeTime(selected.line, selected.line.judgeRingColor), startColor: { r: 255, g: 255, b: 255, a: 255 }, endColor: { r: 255, g: 255, b: 255, a: 255 } });
    notifyChange();
    refreshProperties();
  });
}

function snapshot(): void {
  if (!chart) return;
  const value = JSON.stringify(chart);
  if (undoStack[undoStack.length - 1] !== value) undoStack.push(value);
  if (undoStack.length > 50) undoStack.shift();
}

export function undo(): void {
  if (!chart || undoStack.length === 0) return;
  const previous = undoStack.pop();
  if (!previous) return;
  const restored = JSON.parse(previous) as EditorChart;
  Object.keys(chart).forEach((key) => delete (chart as unknown as Record<string, unknown>)[key]);
  Object.assign(chart, restored);
  setSingleSelection(null);
  window.dispatchEvent(new Event("chartchanged"));
  refreshProperties();
}

function mode(): string {
  return document.querySelector<HTMLSelectElement>("#editObjectMode")?.value ?? "lineNote";
}

export function getEditorVisualState(): EditorVisualState {
  return {
    chart,
    selected,
    selectedItems,
    mode: mode(),
    canvasIndex: editingCanvasIndex(),
    marquee,
    pastePreview: pastePreviewAtCursor(),
  };
}

function clonePoint(point: Point): Point {
  return { ...point, color: { ...point.color } };
}

function cloneNote(note: Note): Note {
  return { ...note, otherInformations: note.otherInformations ? [...note.otherInformations] : [] };
}

function cloneKey(item: KeyPoint): KeyPoint {
  return { ...item };
}

function setSelection(next: Selection | null, extras: Selection[] = []): void {
  selected = next;
  selectedItems = next ? [next, ...extras.filter((item) => item !== next)] : extras;
}

function setSingleSelection(next: Selection | null): void {
  selected = next;
  selectedItems = next ? [next] : [];
}

function pastePreviewAtCursor(): EditorVisualState["pastePreview"] {
  if (!pasteMode || !clipboard) return null;
  const cursor = toChartPoint(mouseX, mouseY);
  const dx = cursor.x - clipboard.originX;
  const dt = cursor.time - clipboard.originTime;
  const mapX = (x: number) => snapX(pasteMirror ? clipboard!.originX - (x - clipboard!.originX) + dx : x + dx);
  const mapTime = (time: number) => Math.max(0, time + dt);
  const mapKeyValue = (value: number) => {
    if (clipboard!.kind === "canvasSpeed" || clipboard!.kind === "cameraScale") return mapX(value / 20) * 20;
    if (clipboard!.kind === "canvasX" || clipboard!.kind === "cameraX") return mapX(value);
    return value;
  };
  return {
    x: cursor.x,
    time: cursor.time,
    kind: clipboard.kind,
    lines: clipboard.lines.map((line) => {
      const points = line.points.map((point) => ({ ...clonePoint(point), xPosition: mapX(point.xPosition), time: mapTime(point.time), canvasIndex: editingCanvasIndex() }));
      const notes = line.notes.map((note) => {
        const copied = cloneNote(note) as Note & { previewX: number };
        copied.time = mapTime(note.time);
        if (copied.otherInformations?.length) copied.otherInformations[0] = mapTime(copied.otherInformations[0]);
        copied.previewX = lineXAtTime({ linePoints: points } as Line, copied.time)
          ?? mapX(lineXAtTime({ linePoints: line.points } as Line, note.time) ?? clipboard!.originX);
        return copied;
      });
      return { points, notes };
    }),
    keys: clipboard.keys.map((item) => {
      const copied = cloneKey(item);
      copied.time = mapTime(item.time);
      copied.value = mapKeyValue(item.value);
      return copied;
    }),
  };
}

function copySelection(cut: boolean): void {
  if (!chart) return;
  const items = selectedItems.length ? selectedItems : selected ? [selected] : [];
  if (items.length === 0) return;
  const lines = new Map<Line, { points: Point[]; notes: Note[] }>();
  const keys: KeyPoint[] = [];
  let kind = mode();
  for (const item of items) {
    if (item.line && item.point) {
      const group = lines.get(item.line) ?? { points: [], notes: [] };
      group.points.push(clonePoint(item.point));
      lines.set(item.line, group);
    } else if (item.line && item.note) {
      const group = lines.get(item.line) ?? { points: [], notes: [] };
      group.notes.push(cloneNote(item.note));
      const noteX = lineXAtTime(item.line, item.note.time);
      if (noteX !== null && !group.points.some((point) => Math.abs(point.time - item.note!.time) < 1e-6)) {
        group.points.push({
          time: item.note.time,
          xPosition: noteX,
          color: { r: 255, g: 255, b: 255, a: 255 },
          easeType: 0,
          canvasIndex: editingCanvasIndex(),
        });
      }
      lines.set(item.line, group);
    } else if (item.kind === "line" && item.line) {
      lines.set(item.line, { points: item.line.linePoints.map(clonePoint), notes: item.line.notes.map(cloneNote) });
    } else if (item.item) {
      keys.push(cloneKey(item.item));
      kind = item.kind;
    }
  }
  const allPoints = [...lines.values()].flatMap((line) => line.points);
  const allNotes = [...lines.values()].flatMap((line) => line.notes);
  const originCandidates = [
    ...allPoints.map((point) => ({ x: point.xPosition, time: point.time })),
    ...allNotes.map((note) => ({ x: lineXAtTime({ linePoints: allPoints } as Line, note.time) ?? 0, time: note.time })),
    ...keys.map((item) => ({ x: chartXOfItem(kind as Selection["kind"], item.value), time: item.time })),
  ];
  if (originCandidates.length === 0) return;
  clipboard = {
    originX: originCandidates[0].x,
    originTime: Math.min(...originCandidates.map((item) => item.time)),
    lines: [...lines.values()],
    keys,
    kind,
  };
  pasteMirror = false;
  if (cut) {
    snapshot();
    deleteCurrentSelections();
  }
}

function applyPaste(): void {
  if (!chart || !clipboard) return;
  const preview = pastePreviewAtCursor();
  if (!preview) return;
  snapshot();
  const pasted: Selection[] = [];
  for (const group of preview.lines) {
    if (!group.points.length && !group.notes.length) continue;
    const line: Line = {
      linePoints: group.points.map(clonePoint),
      notes: group.notes.map((note) => cloneNote(note)),
      judgeRingColor: [],
      lineColor: [],
    };
    line.linePoints.sort((left, right) => left.time - right.time);
    chart.lines.push(line);
    pasted.push({ kind: "line", line });
  }
  if (pasted.length) setSelection(pasted[0], pasted.slice(1));
  if (preview.keys.length) {
    const canvasMove = chart.canvasMoves[editingCanvasIndex()];
    const target = preview.kind === "canvasX" ? canvasMove?.xPositionKeyPoints
      : preview.kind === "canvasSpeed" ? canvasMove?.speedKeyPoints
      : preview.kind === "cameraX" ? chart.cameraMove.xPositionKeyPoints
      : chart.cameraMove.scaleKeyPoints;
    if (target) {
      for (const item of preview.keys) {
        if (!target.some((existing) => Math.abs(existing.time - item.time) < 0.000001)) target.push(cloneKey(item));
      }
      target.sort((left, right) => left.time - right.time);
      setSelection({ kind: preview.kind as Selection["kind"], item: target[target.length - 1] });
    }
  }
  notifyChange();
  refreshProperties();
}

function deleteCurrentSelections(): void {
  if (!chart) return;
  const items = selectedItems.length ? selectedItems : selected ? [selected] : [];
  for (const item of items) {
    if (item.kind === "note" && item.line && item.note) item.line.notes = item.line.notes.filter((note) => note !== item.note);
    if (item.kind === "point" && item.line && item.point) item.line.linePoints = item.line.linePoints.filter((point) => point !== item.point);
    if (item.kind === "line" && item.line) chart.lines = chart.lines.filter((line) => line !== item.line);
    if (item.item) {
      const canvasMove = chart.canvasMoves[editingCanvasIndex()];
      if (item.kind === "canvasX" && canvasMove) canvasMove.xPositionKeyPoints = canvasMove.xPositionKeyPoints.filter((key) => key !== item.item);
      if (item.kind === "canvasSpeed" && canvasMove) canvasMove.speedKeyPoints = canvasMove.speedKeyPoints.filter((key) => key !== item.item);
      if (item.kind === "cameraX") chart.cameraMove.xPositionKeyPoints = chart.cameraMove.xPositionKeyPoints.filter((key) => key !== item.item);
      if (item.kind === "cameraScale") chart.cameraMove.scaleKeyPoints = chart.cameraMove.scaleKeyPoints.filter((key) => key !== item.item);
    }
  }
  selected = null;
  selectedItems = [];
  notifyChange();
  refreshProperties();
}

function chartXOfItem(kind: Selection["kind"], value: number): number {
  return (kind === "canvasSpeed" || kind === "cameraScale") ? value / 20 : value;
}

function selectMarquee(): void {
  if (!chart || !marquee) return;
  const left = Math.min(marquee.x0, marquee.x1);
  const right = Math.max(marquee.x0, marquee.x1);
  const start = Math.min(marquee.time0, marquee.time1);
  const end = Math.max(marquee.time0, marquee.time1);
  if (Math.abs(right - left) < 0.01 && Math.abs(end - start) < 0.01) return;
  const hits: Selection[] = [];
  if (mode() === "lineNote") {
    const canvasIndex = editingCanvasIndex();
    for (const line of chart.lines) {
      for (const point of line.linePoints) {
        if (point.canvasIndex !== canvasIndex) continue;
        if (point.xPosition >= left && point.xPosition <= right && point.time >= start && point.time <= end) hits.push({ kind: "point", line, point });
      }
      for (const note of line.notes) {
        const noteCanvas = noteCanvasIndex(line, note.time);
        const holdCanvas = note.type === 2 ? Math.trunc(note.otherInformations?.[1] ?? noteCanvas ?? -1) : noteCanvas;
        if (noteCanvas !== canvasIndex && holdCanvas !== canvasIndex) continue;
        const x = lineXAtTime(line, note.time);
        if (x === null) continue;
        if (x >= left && x <= right && note.time >= start && note.time <= end) hits.push({ kind: "note", line, note });
      }
    }
  } else {
    const canvasMove = chart.canvasMoves[editingCanvasIndex()];
    let items: KeyPoint[] = [];
    let kind: Selection["kind"] = "canvasX";
    if (mode() === "canvasX") items = canvasMove?.xPositionKeyPoints ?? [];
    if (mode() === "canvasSpeed") { items = canvasMove?.speedKeyPoints ?? []; kind = "canvasSpeed"; }
    if (mode() === "cameraX") { items = chart.cameraMove.xPositionKeyPoints; kind = "cameraX"; }
    if (mode() === "cameraScale") { items = chart.cameraMove.scaleKeyPoints; kind = "cameraScale"; }
    for (const item of items) {
      const x = chartXOfItem(kind, item.value);
      if (x >= left && x <= right && item.time >= start && item.time <= end) hits.push({ kind, item });
    }
  }
  selected = hits[0] ?? null;
  selectedItems = hits;
  refreshProperties();
}

function snapX(value: number): number {
  const density = getVerticalDensity();
  return Math.round(value * density) / density;
}

function currentTime(): number {
  return document.querySelector<HTMLAudioElement>("#audio")?.currentTime ?? 0;
}

function secondsToTick(seconds: number): number {
  const bpm = chart?.bPM ?? chart?.bpm ?? 120;
  const shifts = chart?.bpmShifts ?? [];
  if (shifts.length === 0) return seconds * bpm / 60;
  const first = shifts[0];
  if (seconds <= (first.floorPosition ?? 0)) return seconds / (60 / (bpm * (first.value || 1)));
  for (let index = 1; index < shifts.length; index += 1) {
    const previous = shifts[index - 1];
    const current = shifts[index];
    if (seconds <= (current.floorPosition ?? 0)) {
      const ratio = (seconds - (previous.floorPosition ?? 0)) / ((current.floorPosition ?? 0) - (previous.floorPosition ?? 0) || 1);
      return previous.time + ratio * (current.time - previous.time);
    }
  }
  const last = shifts[shifts.length - 1];
  return last.time + (seconds - (last.floorPosition ?? 0)) / (60 / (bpm * (last.value || 1)));
}

function snapTime(value: number): number {
  const density = Math.max(1, Number(document.querySelector<HTMLInputElement>("#beatDensity")?.value) || 1);
  return Math.max(0, Math.round(secondsToTick(value) * density) / density);
}

function toChartPoint(clientX: number, clientY: number): { x: number; time: number } {
  const canvas = editorCanvas;
  if (!canvas) return { x: 0, time: currentTime() };
  const rect = canvas.getBoundingClientRect();
  const playfield = calculateCenterSize(rect.width, rect.height);
  const x = (clientX - rect.left - rect.width / 2) / playfield.width - getEditorXOffset();
  const y = (clientY - rect.top - playfield.y) / playfield.height;
  const speed = Number(document.querySelector<HTMLInputElement>("#chartSpeed")?.value) || 7;
  const seconds = currentTime() + (0.74 - y) * 1280 / ((215 / 32 + speed) * 10 / 129 * 1280);
  return { x: snapX(x), time: snapTime(seconds) };
}

function updateDraggedObject(clientX: number, clientY: number): void {
  if (!chart || !dragSelection) return;
  const cursor = toChartPoint(clientX, clientY);
  const selection = dragSelection;

  if (selection.point) {
    selection.point.time = cursor.time;
    selection.point.xPosition = cursor.x;
    selection.line?.linePoints.sort((left, right) => left.time - right.time);
  } else if (selection.note && selection.line) {
    const first = selection.line.linePoints[0];
    const last = selection.line.linePoints[selection.line.linePoints.length - 1];
    if (!first || !last) return;
    selection.note.time = Math.max(first.time, Math.min(last.time, cursor.time));
    const end = selection.note.otherInformations;
    if (selection.note.type === 2 && end?.length && end[0] < selection.note.time) end[0] = selection.note.time;
  } else if (selection.item) {
    selection.item.time = cursor.time;
    if (selection.kind === "canvasX" || selection.kind === "cameraX") selection.item.value = cursor.x;
    if (selection.kind === "canvasSpeed" || selection.kind === "cameraScale") selection.item.value = cursor.x * 20;
  }
  notifyChange();
  refreshProperties();
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function noteCanvasIndex(line: Line, time: number): number | null {
  let canvasIndex: number | null = null;
  for (const point of line.linePoints) {
    if (point.time <= time) canvasIndex = point.canvasIndex;
    else break;
  }
  return canvasIndex;
}

function segmentTouchesCanvas(start: Point, end: Point, canvasIndex: number): boolean {
  return start.canvasIndex === canvasIndex || end.canvasIndex === canvasIndex;
}

function nearestLine(clientX: number, clientY: number, threshold = 14): Line | null {
  if (!chart || !editorCanvas) return null;
  const canvasIndex = editingCanvasIndex();
  const rect = editorCanvas.getBoundingClientRect();
  const playfield = calculateCenterSize(rect.width, rect.height);
  const current = currentTime();
  const designHeight = 1280 * Math.min(playfield.width / 720, playfield.height / 1280);
  const screen = (x: number, tick: number): { x: number; y: number } => ({
    x: rect.left + rect.width / 2 + (x + getEditorXOffset()) * playfield.width,
    y: rect.top + playfield.y + getEditTimeY(beatTickToSeconds(tick), current, designHeight),
  });
  let best: Line | null = null;
  let distance = Infinity;
  for (const line of chart.lines) {
    for (let index = 1; index < line.linePoints.length; index += 1) {
      const start = line.linePoints[index - 1];
      const end = line.linePoints[index];
      if (!segmentTouchesCanvas(start, end, canvasIndex)) continue;
      let previous = screen(start.xPosition, start.time);
      for (let part = 1; part <= 16; part += 1) {
        const ratio = part / 16;
        const eased = speedEase(start.easeType, ratio);
        const x = start.xPosition + (end.xPosition - start.xPosition) * eased;
        const time = start.time + (end.time - start.time) * ratio;
        const currentPos = screen(x, time);
        const d = distanceToSegment(clientX, clientY, previous.x, previous.y, currentPos.x, currentPos.y);
        if (d < distance) { distance = d; best = line; }
        previous = currentPos;
      }
    }
  }
  return best && distance <= threshold ? best : null;
}

function lineXAtTime(line: Line, time: number): number | null {
  if (line.linePoints.length === 0 || time < line.linePoints[0].time || time > line.linePoints[line.linePoints.length - 1].time) return null;
  for (let index = 1; index < line.linePoints.length; index += 1) {
    const start = line.linePoints[index - 1];
    const end = line.linePoints[index];
    if (time <= end.time) {
      const ratio = (time - start.time) / (end.time - start.time || 1);
      return start.xPosition + (end.xPosition - start.xPosition) * speedEase(start.easeType, ratio);
    }
  }
  return line.linePoints[line.linePoints.length - 1].xPosition;
}

function editorScreenPosition(x: number, time: number): { x: number; y: number } | null {
  if (!editorCanvas) return null;
  const rect = editorCanvas.getBoundingClientRect();
  const playfield = calculateCenterSize(rect.width, rect.height);
  const current = currentTime();
  return {
    x: rect.left + rect.width / 2 + (x + getEditorXOffset()) * playfield.width,
    y: rect.top + playfield.y + getEditTimeY(beatTickToSeconds(time), current, 1280 * Math.min(playfield.width / 720, playfield.height / 1280)),
  };
}

function selectAtCursor(): void {
  if (!chart) return;
  if (mode() !== "lineNote") {
    const canvasMove = chart.canvasMoves[editingCanvasIndex()];
    let items: KeyPoint[] = [];
    let kind: Selection["kind"] = "canvasX";
    if (mode() === "canvasX") items = canvasMove?.xPositionKeyPoints ?? [];
    if (mode() === "canvasSpeed") { items = canvasMove?.speedKeyPoints ?? []; kind = "canvasSpeed"; }
    if (mode() === "cameraX") { items = chart.cameraMove.xPositionKeyPoints; kind = "cameraX"; }
    if (mode() === "cameraScale") { items = chart.cameraMove.scaleKeyPoints; kind = "cameraScale"; }
    const rect = editorCanvas?.getBoundingClientRect();
    const playfield = rect ? calculateCenterSize(rect.width, rect.height) : null;
    const current = currentTime();
    const item = items.reduce<{ value: KeyPoint; distance: number } | null>((best, value) => {
      if (!playfield || !rect) return best;
      const xValue = (kind === "canvasSpeed" || kind === "cameraScale") ? value.value / 20 : value.value;
      const x = rect.left + rect.width / 2 + (xValue + getEditorXOffset()) * playfield.width;
      const y = rect.top + playfield.y + getEditTimeY(beatTickToSeconds(value.time), current, 1280 * Math.min(playfield.width / 720, playfield.height / 1280));
      const distance = Math.hypot(mouseX - x, mouseY - y);
      return !best || distance < best.distance ? { value, distance } : best;
    }, null);
    setSingleSelection(item && item.distance <= 24 ? { kind, item: item.value } : null);
    refreshProperties();
    return;
  }

  const noteHitRadius = 28;
  const nodeHitRadius = 20;
  let closestPoint: { line: Line; point: Point; distance: number } | null = null;
  let closestNote: { line: Line; note: Note; distance: number } | null = null;
  let holdBodyHit: { line: Line; note: Note } | null = null;
  const canvasRect = editorCanvas?.getBoundingClientRect();
  const playfield = canvasRect ? calculateCenterSize(canvasRect.width, canvasRect.height) : null;
  const canvasIndex = editingCanvasIndex();
  for (const line of chart.lines) {
    for (const point of line.linePoints) {
      if (point.canvasIndex !== canvasIndex) continue;
      const position = editorScreenPosition(point.xPosition, point.time);
      if (!position) continue;
      const distance = Math.hypot(mouseX - position.x, mouseY - position.y);
      if (!closestPoint || distance < closestPoint.distance) closestPoint = { line, point, distance };
    }
    for (const note of line.notes) {
      const noteCanvas = noteCanvasIndex(line, note.time);
      const holdCanvas = note.type === 2 ? Math.trunc(note.otherInformations?.[1] ?? noteCanvas ?? -1) : noteCanvas;
      if (noteCanvas !== canvasIndex && holdCanvas !== canvasIndex) continue;
      const x = lineXAtTime(line, note.time);
      if (x === null) continue;
      const position = editorScreenPosition(x, note.time);
      if (!position) continue;
      if (note.type === 2 && note.otherInformations && note.otherInformations.length >= 1 && canvasRect && playfield) {
        const tailPosition = editorScreenPosition(x, note.otherInformations[0]);
        if (tailPosition) {
          const bodyLeft = position.x - 20 * playfield.height / 1280;
          const bodyRight = position.x + 20 * playfield.height / 1280;
          const bodyTop = Math.min(position.y, tailPosition.y);
          const bodyBottom = Math.max(position.y, tailPosition.y);
          if (mouseX >= bodyLeft && mouseX <= bodyRight && mouseY >= bodyTop && mouseY <= bodyBottom) {
            holdBodyHit = { line, note };
          }
        }
      }
      const distance = Math.hypot(mouseX - position.x, mouseY - position.y);
      if (!closestNote || distance < closestNote.distance) closestNote = { line, note, distance };
    }
  }
  if (holdBodyHit) {
    setSingleSelection({ kind: "note", line: holdBodyHit.line, note: holdBodyHit.note });
    refreshProperties();
    return;
  }
  if (closestNote && closestNote.distance <= noteHitRadius) {
    setSingleSelection({ kind: "note", line: closestNote.line, note: closestNote.note });
    refreshProperties();
    return;
  }
  if (closestPoint && closestPoint.distance <= nodeHitRadius) {
    setSingleSelection({ kind: "point", line: closestPoint.line, point: closestPoint.point });
    refreshProperties();
    return;
  }

  const line = nearestLine(mouseX, mouseY);
  setSingleSelection(line ? { kind: "line", line } : null);
  refreshProperties();
}

function createPoint(): void {
  if (!chart) return;
  const point = toChartPoint(mouseX, mouseY);
  const existing = selected?.line ?? null;
  const line = existing ?? {
    linePoints: [],
    notes: [],
    judgeRingColor: [],
    lineColor: [],
  };
  snapshot();
  const previous = [...line.linePoints].reverse().find((item) => item.time <= point.time) ?? line.linePoints[line.linePoints.length - 1];
  const node: Point = {
    time: point.time,
    xPosition: point.x,
    color: previous?.color ? { ...previous.color } : { r: 255, g: 255, b: 255, a: 255 },
    easeType: previous?.easeType ?? 0,
    canvasIndex: editingCanvasIndex(),
  };
  line.linePoints.push(node);
  line.linePoints.sort((a, b) => a.time - b.time);
  if (!existing) chart.lines.push(line);
  setSingleSelection({ kind: "point", line, point: node });
  notifyChange();
  refreshProperties();
}

function createNote(type: number): void {
  if (!chart || !selected?.line || selected.line.linePoints.length < 2) return;
  const cursor = toChartPoint(mouseX, mouseY);
  const first = selected.line.linePoints[0].time;
  const last = selected.line.linePoints[selected.line.linePoints.length - 1].time;
  if (cursor.time < first || cursor.time > last) return;
  snapshot();
  const note: Note = { type, time: cursor.time, floorPosition: 0, otherInformations: type === 2 ? [Math.min(last, cursor.time + 1), editingCanvasIndex(), 0] : [] };
  selected.line.notes.push(note);
  setSingleSelection({ kind: "note", line: selected.line, note });
  notifyChange();
  refreshProperties();
}

function createKeyPoint(): void {
  if (!chart) return;
  const cursor = toChartPoint(mouseX, mouseY);
  const canvasMove = chart.canvasMoves[editingCanvasIndex()];
  let target: KeyPoint[] | null = null;
  let kind: Selection["kind"] = "canvasX";
  let value = cursor.x;
  if (mode() === "canvasX" && canvasMove) target = canvasMove.xPositionKeyPoints;
  if (mode() === "canvasSpeed" && canvasMove) { target = canvasMove.speedKeyPoints; kind = "canvasSpeed"; value = 1; }
  if (mode() === "cameraX") { target = chart.cameraMove.xPositionKeyPoints; kind = "cameraX"; }
  if (mode() === "cameraScale") { target = chart.cameraMove.scaleKeyPoints; kind = "cameraScale"; value = 1; }
  if (!target) return;
  const existing = target.find((item) => Math.abs(item.time - cursor.time) < 0.000001);
  if (existing) {
    setSingleSelection({ kind, item: existing });
    refreshProperties();
    return;
  }
  snapshot();
  const item: KeyPoint = { time: cursor.time, value, easeType: 0, floorPosition: 0 };
  target.push(item);
  target.sort((a, b) => a.time - b.time);
  setSingleSelection({ kind, item });
  notifyChange();
  refreshProperties();
}

function refreshProperties(): void {
  const linePanel = document.querySelector<HTMLElement>("#linePanel");
  const title = document.querySelector("#lineColorEditor .propertyEditorTitle");
  const lineList = document.querySelector<HTMLDivElement>("#lineColorList");
  const judgeList = document.querySelector<HTMLDivElement>("#judgeColorList");
  const selectedLine = selected?.line;
  if (linePanel) linePanel.classList.toggle("linePanelDisabled", !selectedLine);
  if (title) title.textContent = selectedLine ? "选中线颜色关键帧" : "请先选中一条线";
  if (selectedLine && lineList && judgeList) {
    selectedLine.lineColor ??= [];
    selectedLine.judgeRingColor ??= [];
    const minTime = lineStartTick(selectedLine);
    renderColorKeyframes(lineList, selectedLine.lineColor, true, lineBaseColor(selectedLine), minTime);
    renderColorKeyframes(judgeList, selectedLine.judgeRingColor, false, { r: 255, g: 255, b: 255, a: 255 }, minTime);
  } else {
    lineList?.replaceChildren();
    judgeList?.replaceChildren();
  }
  refreshObjectForm();
}

const speedEaseFunctions: Array<(value: number) => number> = [
  (x) => x,
  (x) => x * x,
  (x) => 1 - (1 - x) ** 2,
  (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  (x) => x ** 3,
  (x) => 1 - (1 - x) ** 3,
  (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  (x) => x ** 4,
  (x) => 1 - (1 - x) ** 4,
  (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  (x) => x ** 5,
  (x) => 1 - (1 - x) ** 5,
  (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  () => 0,
  () => 1,
  (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)),
  (x) => Math.sqrt(Math.max(0, 1 - (x - 1) ** 2)),
  (x) => Math.sin((x * Math.PI) / 2),
  (x) => 1 - Math.cos((x * Math.PI) / 2),
];

const easeTypeLabels = [
  "linear",
  "quadIn",
  "quadOut",
  "quadInOut",
  "cubicIn",
  "cubicOut",
  "cubicInOut",
  "quartIn",
  "quartOut",
  "quartInOut",
  "quintIn",
  "quintOut",
  "quintInOut",
  "constZero",
  "constOne",
  "circIn",
  "circOut",
  "sineOut",
  "sineIn",
];

function easeSelectHtml(id: string, value: number): string {
  const selected = clampNumber(value, 0, 18, 0);
  const options = easeTypeLabels.map((label, index) => `<option value="${index}"${index === selected ? " selected" : ""}>${label}</option>`).join("");
  return `<select id="${id}">${options}</select>`;
}

function speedEase(type: number | undefined, value: number): number {
  const fn = speedEaseFunctions[Math.max(0, Math.min(speedEaseFunctions.length - 1, Math.trunc(Number(type) || 0)))];
  return fn(Math.max(0, Math.min(1, value)));
}

function bakeSpeedEase(): void {
  if (!chart || mode() !== "canvasSpeed") return;
  const keys = selectedItems.map((item) => item.item).filter((item): item is KeyPoint => !!item);
  if (keys.length < 2) {
    window.alert("请先选中速度起始点和结束点");
    return;
  }
  const [start, end] = [...keys].sort((left, right) => left.time - right.time);
  if (end.time <= start.time) return;
  const canvasMove = chart.canvasMoves[editingCanvasIndex()];
  if (!canvasMove) return;
  const density = Math.max(1, Number(document.querySelector<HTMLInputElement>("#beatDensity")?.value) || 4);
  const easeInput = document.querySelector<HTMLSelectElement>("#speedEaseType");
  const easeType = clampNumber(Number(easeInput?.value ?? speedEaseType), 0, 18, 0);
  speedEaseType = easeType;
  const step = 1 / density;
  snapshot();
  canvasMove.speedKeyPoints = canvasMove.speedKeyPoints.filter((item) => item.time <= start.time || item.time >= end.time);
  const generated: KeyPoint[] = [];
  for (let time = start.time + step; time < end.time - 1e-9; time += step) {
    const ratio = (time - start.time) / (end.time - start.time);
    generated.push({
      time: Math.round(time * density) / density,
      value: start.value + (end.value - start.value) * speedEase(easeType, ratio),
      easeType: 0,
      floorPosition: 0,
    });
  }
  canvasMove.speedKeyPoints.push(...generated);
  canvasMove.speedKeyPoints.sort((left, right) => left.time - right.time);
  setSelection({ kind: "canvasSpeed", item: start }, generated.map((item) => ({ kind: "canvasSpeed" as const, item })));
  notifyChange();
  refreshProperties();
}

function selectedObjectLabel(): string {
  if (!selected) return "未选择";
  if (selected.kind === "line") return "线条";
  if (selected.kind === "point") return "线节点";
  if (selected.kind === "note") {
    if (selected.note?.type === 1) return "Drag";
    if (selected.note?.type === 2) return "Hold";
    return "Tap";
  }
  if (selected.kind === "canvasX") return "Canvas X 关键帧";
  if (selected.kind === "canvasSpeed") return "Canvas 速度关键帧";
  if (selected.kind === "cameraX") return "Camera X 关键帧";
  if (selected.kind === "cameraScale") return "Camera Scale 关键帧";
  return "对象";
}

function refreshObjectForm(): void {
  const form = document.querySelector<HTMLDivElement>("#selectedObjectForm");
  if (!form) return;
  form.replaceChildren();
  const title = document.createElement("div");
  title.className = "propertyEditorTitle";
  title.textContent = `当前选择：${selectedObjectLabel()}`;
  form.append(title);
  if (mode() === "canvasSpeed") {
    const easeRow = document.createElement("label");
    easeRow.className = "chartSpeedControl";
    easeRow.innerHTML = `<span>缓动类型</span>${easeSelectHtml("speedEaseType", speedEaseType)}`;
    easeRow.querySelector("select")?.addEventListener("change", (event) => {
      speedEaseType = clampNumber(Number((event.target as HTMLSelectElement).value), 0, 18, 0);
    });
    form.append(easeRow);
    const bake = document.createElement("button");
    bake.type = "button";
    bake.className = "miniButton";
    bake.textContent = "按横线生成缓动关键点";
    bake.addEventListener("click", bakeSpeedEase);
    form.append(bake);
  }
  if (!selected) {
    const empty = document.createElement("div");
    empty.textContent = "请先选择对象";
    form.append(empty);
    return;
  }

  const target = selectedValue();
  if (!target) return;
  const fields: Array<[string, string, number]> = [];
  if (selected.point) {
    fields.push(["时间 tick", "time", selected.point.time], ["X", "xPosition", selected.point.xPosition], ["Canvas", "canvasIndex", selected.point.canvasIndex], ["缓动", "easeType", selected.point.easeType ?? 0]);
  } else if (selected.note) {
    fields.push(["开始 tick", "time", selected.note.time], ["类型 0/1/2", "type", selected.note.type]);
    if (selected.note.type === 2) {
      const info = selected.note.otherInformations ?? [selected.note.time, 0, 0];
      selected.note.otherInformations = info;
      fields.push(["结束 tick", "holdEnd", info[0] ?? selected.note.time], ["结束 Canvas", "holdCanvas", info[1] ?? 0]);
    }
  } else if (selected.item) {
    fields.push(["时间 tick", "time", selected.item.time], ["值", "value", selected.item.value]);
    if (selected.kind !== "canvasSpeed") fields.push(["缓动", "easeType", selected.item.easeType ?? 0]);
  } else if (selected.line) {
    const summary = document.createElement("div");
    summary.textContent = `线节点 ${selected.line.linePoints.length}，Note ${selected.line.notes.length}`;
    form.append(summary);
    return;
  }

  for (const [label, key, value] of fields) {
    const row = document.createElement("label");
    row.className = "chartSpeedControl";
    if (key === "easeType") {
      row.innerHTML = `<span>${label}</span>${easeSelectHtml("", value)}`;
      row.querySelector("select")?.addEventListener("change", (event) => {
        snapshot();
        Object.assign(target, { easeType: clampNumber(Number((event.target as HTMLSelectElement).value), 0, 18, 0) });
        notifyChange();
        refreshProperties();
      });
      form.append(row);
      continue;
    }
    row.innerHTML = `<span>${label}</span><input type="number" step="0.01" value="${value}">`;
    row.querySelector("input")?.addEventListener("change", (event) => {
      snapshot();
      const input = event.target as HTMLInputElement;
      const lastCanvas = Math.max(0, (chart?.canvasMoves.length ?? 1) - 1);
      if (selected?.note && key === "holdEnd") {
        selected.note.otherInformations ??= [selected.note.time, 0, 0];
        selected.note.otherInformations[0] = Math.max(selected.note.time, readClamped(input, 0, 1_000_000, selected.note.time));
      } else if (selected?.note && key === "holdCanvas") {
        selected.note.otherInformations ??= [selected.note.time, 0, 0];
        selected.note.otherInformations[1] = readClamped(input, 0, lastCanvas, 0);
      } else if (key === "time") Object.assign(target, { time: readClamped(input, 0, 1_000_000, 0) });
      else if (key === "xPosition") Object.assign(target, { xPosition: readClamped(input, -4, 4, 0) });
      else if (key === "canvasIndex") Object.assign(target, { canvasIndex: readClamped(input, 0, lastCanvas, 0) });
      else if (key === "easeType") Object.assign(target, { easeType: readClamped(input, 0, 18, 0) });
      else if (key === "type") Object.assign(target, { type: readClamped(input, 0, 2, 0) });
      else if (key === "value") {
        const kind = selected?.kind;
        const range = kind === "canvasSpeed" || kind === "cameraScale" ? [-10, 10, 1] : [-4, 4, 0];
        Object.assign(target, { value: readClamped(input, range[0], range[1], range[2]) });
      }
      notifyChange();
      refreshProperties();
    });
    form.append(row);
  }

  if (selected.point) {
    const colorWrap = document.createElement("div");
    colorWrap.innerHTML = colorField("节点颜色", selected.point.color, "pointColor");
    colorWrap.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      if (!selected?.point) return;
      snapshot();
      selected.point.color = applyColorInput(selected.point.color ?? { r: 255, g: 255, b: 255, a: 255 }, input as HTMLInputElement);
      notifyChange();
      refreshProperties();
    }));
    form.append(colorWrap);
  }
}

function applyProperties(): void {
  if (!selected) return;
  const text = document.querySelector<HTMLTextAreaElement>("#propertyValue")?.value;
  if (!text) return;
  try {
    snapshot();
    const value = JSON.parse(text);
    const target = selectedValue();
    if (!target) return;
    Object.assign(target, value);
    notifyChange();
  } catch { window.alert("属性 JSON 格式错误"); }
}

function setEditingCanvasIndex(index: number): void {
  const input = document.querySelector<HTMLInputElement>("#editingCanvasIndex");
  if (!input) return;
  const last = Math.max(0, (chart?.canvasMoves.length ?? 1) - 1);
  input.value = String(clampNumber(index, 0, last, 0));
}

function addCanvas(): void {
  if (!chart) return;
  snapshot();
  chart.canvasMoves.push(createEmptyCanvasMove(chart.canvasMoves.length));
  setEditingCanvasIndex(chart.canvasMoves.length - 1);
  notifyChange();
}

function deleteCurrentCanvas(): void {
  if (!chart || chart.canvasMoves.length <= 1) {
    window.alert("至少保留一个 Canvas");
    return;
  }
  const index = editingCanvasIndex();
  if (index >= chart.canvasMoves.length) return;
  snapshot();
  chart.canvasMoves.splice(index, 1);
  chart.canvasMoves.forEach((move, moveIndex) => { move.index = moveIndex; });
  for (const line of chart.lines) {
    line.linePoints = line.linePoints.filter((point) => point.canvasIndex !== index);
    for (const point of line.linePoints) {
      if (point.canvasIndex > index) point.canvasIndex -= 1;
    }
    for (const note of line.notes) {
      if (note.otherInformations && note.otherInformations.length >= 2) {
        if (note.otherInformations[1] === index) note.otherInformations[1] = 0;
        else if (note.otherInformations[1] > index) note.otherInformations[1] -= 1;
      }
    }
  }
  chart.lines = chart.lines.filter((line) => line.linePoints.length > 0);
  setSingleSelection(null);
  setEditingCanvasIndex(Math.min(index, chart.canvasMoves.length - 1));
  notifyChange();
  refreshProperties();
}

function deleteSelection(): void {
  if (!chart || (!selected && selectedItems.length === 0)) return;
  snapshot();
  deleteCurrentSelections();
}

export function setupChartEditor(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#cvs");
  if (!canvas) return;
  editorCanvas = canvas;
  setupSettings();
  document.querySelector("#addCanvasButton")?.addEventListener("click", addCanvas);
  document.querySelector("#deleteCanvasButton")?.addEventListener("click", deleteCurrentCanvas);
  document.querySelector<HTMLInputElement>("#editingCanvasIndex")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    setEditingCanvasIndex(Number(input.value));
  });
  document.querySelectorAll<HTMLInputElement>("#chartSpeed, #beatDensity, #verticalDensity, #editorXOffset, #baseBpm").forEach((input) => {
    input.addEventListener("change", () => {
      const min = Number(input.min);
      const max = Number(input.max);
      if (Number.isFinite(min) && Number.isFinite(max)) readClamped(input, min, max, Number(input.value) || min);
    });
  });
  document.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement || target instanceof HTMLAudioElement) target.blur();
  }, true);
  document.querySelectorAll<HTMLButtonElement>(".propertyTab").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll(".propertyTab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".propertyPanel").forEach((panel) => panel.classList.toggle("active", panel.id === tab.dataset.panel));
  }));
  canvas.addEventListener("mousemove", (event) => { mouseX = event.clientX; mouseY = event.clientY; });
  canvas.addEventListener("click", (event) => {
    if (!isEditMode()) return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (boxSelectMode && marquee) {
      const cursor = toChartPoint(event.clientX, event.clientY);
      marquee.x1 = cursor.x;
      marquee.time1 = cursor.time;
      selectMarquee();
      marquee = null;
      boxSelectMode = false;
      return;
    }
    if (pointerMoved || pasteMode) return;
    selectAtCursor();
  });
  canvas.addEventListener("mousedown", (event) => {
    if (!isEditMode() || event.button !== 0) return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    pointerMoved = false;
    if (boxSelectMode || pasteMode) return;
    selectAtCursor();
    if (selected) {
      dragReady = true;
      dragging = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragSelection = selected;
      dragSnapshot = JSON.stringify(chart);
      event.preventDefault();
    }
  });
  window.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (marquee) {
      const cursor = toChartPoint(event.clientX, event.clientY);
      marquee.x1 = cursor.x;
      marquee.time1 = cursor.time;
      return;
    }
    if (!dragReady || !dragSelection) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) < 6) return;
      dragging = true;
      pointerMoved = true;
    }
    updateDraggedObject(event.clientX, event.clientY);
  });
  window.addEventListener("mouseup", () => {
    if (!dragReady) return;
    if (dragging && dragSnapshot && dragSnapshot !== JSON.stringify(chart)) {
      undoStack.push(dragSnapshot);
      if (undoStack.length > 50) undoStack.shift();
    }
    dragging = false;
    dragReady = false;
    dragSelection = null;
  });
  canvas.addEventListener("wheel", (event) => {
    const audio = document.querySelector<HTMLAudioElement>("#audio");
    if (!audio?.src) return;
    event.preventDefault();
    audio.pause();
    const step = 60 / ((Number((chart as EditorChart & { bPM?: number } | null)?.bPM) || 120) * Math.max(1, Number(document.querySelector<HTMLInputElement>("#beatDensity")?.value) || 1));
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime - Math.sign(event.deltaY) * step));
    window.dispatchEvent(new Event("editorseek"));
  }, { passive: false });
  document.querySelector("#applyProperty")?.addEventListener("click", applyProperties);
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (!isEditMode()) return;
    if (event.ctrlKey && event.code === "KeyZ") { event.preventDefault(); undo(); return; }
    if (event.ctrlKey && event.code === "KeyC") { event.preventDefault(); copySelection(false); pasteMode = true; return; }
    if (event.ctrlKey && event.code === "KeyX") { event.preventDefault(); copySelection(true); pasteMode = true; return; }
    if (event.ctrlKey && event.code === "KeyV") {
      event.preventDefault();
      if (!clipboard) return;
      if (pasteMode) applyPaste();
      else pasteMode = true;
      return;
    }
    if (event.ctrlKey && event.code === "KeyB") { event.preventDefault(); pasteMirror = !pasteMirror; pasteMode = true; return; }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      if (event.repeat) return;
      if (pasteMode) {
        pasteMode = false;
        pasteMirror = false;
        return;
      }
      boxSelectMode = !boxSelectMode;
      if (boxSelectMode) {
        const cursor = toChartPoint(mouseX, mouseY);
        marquee = { x0: cursor.x, time0: cursor.time, x1: cursor.x, time1: cursor.time };
      } else {
        marquee = null;
      }
      return;
    }
    if (event.code === "Delete") { deleteSelection(); return; }
    if (event.code === "KeyR") {
      if (mode() === "lineNote") createPoint();
      else createKeyPoint();
      return;
    }
    if (event.code === "KeyQ") { createNote(0); return; }
    if (event.code === "KeyW") { createNote(1); return; }
    if (event.code === "KeyE") { createNote(2); }
  });
}
import { calculateCenterSize } from "./canvas";
