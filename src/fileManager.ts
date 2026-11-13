import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { setChart } from "./drawChart";
import { setBeatChart } from "./editMode";
import { applyMusicEndTicks, createEmptyCanvasMove, defaultEndTick, defaultKeyPoint, setEditorChart } from "./chartEditor";
import { resumeHitSounds } from "./hitSound";

let chartData: unknown = null;
let musicUrl: string | null = null;
let chartImported = false;

function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function selectFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      resolve(file);
      input.remove();
      window.removeEventListener("focus", onFocus);
    };
    const onFocus = () => {
      window.setTimeout(() => finish(input.files?.[0] ?? null), 300);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}

async function pickChartPath(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

async function pickMusicPath(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"] }],
  });
  if (typeof selected === "string") return selected;
  if (Array.isArray(selected) && typeof selected[0] === "string") return selected[0];
  return null;
}

export async function loadChart(): Promise<void> {
  if (chartImported) return;
  let text = "";
  if (isTauri()) {
    const path = await pickChartPath();
    if (!path) return;
    text = await readTextFile(path);
  } else {
    const file = await selectFile(".json,application/json");
    if (!file) return;
    text = await file.text();
  }

  try {
    chartData = JSON.parse(text);
    setChart(chartData);
    setBeatChart(chartData);
    setEditorChart(chartData);
    chartImported = true;
    setChartButtonsDisabled(true);
    window.dispatchEvent(new CustomEvent("chartloaded", { detail: chartData }));
    console.log(chartData);
  } catch {
    window.alert("谱面文件不是有效的 JSON 文件");
  }
}

function setChartButtonsDisabled(disabled: boolean): void {
  const loadButton = document.querySelector<HTMLButtonElement>("#loadChartButton");
  const newButton = document.querySelector<HTMLButtonElement>("#newChartButton");
  if (loadButton) loadButton.disabled = disabled;
  if (newButton) newButton.disabled = disabled;
}

function createBaseChart() {
  return {
    fileVersion: 1,
    songsName: "",
    bPM: 120,
    offset: 0,
    bpmShifts: [],
    themes: [{ colorsList: [
      { r: 20, g: 20, b: 20, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ] }],
    challengeTimes: [],
    lines: [],
    canvasMoves: [createEmptyCanvasMove(0)],
    cameraMove: {
      xPositionKeyPoints: [defaultKeyPoint(0, 0), defaultKeyPoint(defaultEndTick(), 0)],
      yPositionKeyPoints: [defaultKeyPoint(0, 0), defaultKeyPoint(defaultEndTick(), 0)],
      scaleKeyPoints: [defaultKeyPoint(0, 1), defaultKeyPoint(defaultEndTick(), 1)],
      rotationKeyPoints: [defaultKeyPoint(0, 0), defaultKeyPoint(defaultEndTick(), 0)],
    },
  };
}

function applyChart(data: unknown): void {
  chartData = data;
  setChart(chartData);
  setBeatChart(chartData);
  setEditorChart(chartData);
  chartImported = true;
  setChartButtonsDisabled(true);
  window.dispatchEvent(new CustomEvent("chartloaded", { detail: chartData }));
  console.log("已创建基础谱面", chartData);
}

export async function newChart(): Promise<void> {
  if (chartImported) return;
  if (isTauri()) {
    const musicPath = await pickMusicPath();
    if (!musicPath) return;
    applyChart(createBaseChart());
    await applyMusicPath(musicPath);
    return;
  }
  const musicFile = await selectFile("audio/*");
  if (!musicFile) return;
  applyChart(createBaseChart());
  await applyMusicFile(musicFile);
}

function bindAudioElement(src: string): void {
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  if (!audio) return;
  if (musicUrl) URL.revokeObjectURL(musicUrl);
  musicUrl = src.startsWith("blob:") ? src : null;
  audio.src = src;
  audio.classList.remove("audioDisabled");
  audio.removeAttribute("aria-disabled");
  audio.addEventListener("loadedmetadata", () => {
    applyMusicEndTicks();
  }, { once: true });
  audio.load();
}

function musicMimeType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "flac") return "audio/flac";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "aac") return "audio/aac";
  if (extension === "opus") return "audio/opus";
  return "application/octet-stream";
}

async function applyMusicPath(path: string): Promise<void> {
  await resumeHitSounds().catch((error: unknown) => {
    console.error("打击音效初始化失败", error);
  });
  try {
    const bytes = await readFile(path);
    const blob = new Blob([bytes], { type: musicMimeType(path) });
    bindAudioElement(URL.createObjectURL(blob));
  } catch (error) {
    console.error("音乐导入失败", error);
    window.alert("音乐导入失败，请重试或换一个音频文件");
  }
}

async function applyMusicFile(file: File): Promise<void> {
  await resumeHitSounds().catch((error: unknown) => {
    console.error("打击音效初始化失败", error);
  });
  bindAudioElement(URL.createObjectURL(file));
}

export async function loadMusic(): Promise<void> {
  if (isTauri()) {
    const path = await pickMusicPath();
    if (!path) return;
    await applyMusicPath(path);
    return;
  }
  const file = await selectFile("audio/*");
  if (!file) return;
  await applyMusicFile(file);
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (value === "" || value === null || value === undefined) return fallback;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function sanitizeColor(value: unknown, fallbackA = 255): { r: number; g: number; b: number; a: number } {
  const color = (value && typeof value === "object") ? value as Record<string, unknown> : {};
  return {
    r: Math.max(0, Math.min(255, Math.round(finiteNumber(color.r, 255)))),
    g: Math.max(0, Math.min(255, Math.round(finiteNumber(color.g, 255)))),
    b: Math.max(0, Math.min(255, Math.round(finiteNumber(color.b, 255)))),
    a: Math.max(0, Math.min(255, Math.round(finiteNumber(color.a, fallbackA)))),
  };
}

function keyPoint(source: unknown, fallbackValue: number): Record<string, unknown> {
  const point = (source && typeof source === "object") ? source as Record<string, unknown> : {};
  return {
    time: Math.max(0, finiteNumber(point.time, 0)),
    value: finiteNumber(point.value, fallbackValue),
    easeType: Math.trunc(finiteNumber(point.easeType, 0)),
    floorPosition: finiteNumber(point.floorPosition, 0),
  };
}

function ensureKeyPoints(points: unknown, fallbackValue: number, endTick: number): Record<string, unknown>[] {
  const list = Array.isArray(points) ? points.map((point) => keyPoint(point, fallbackValue)) : [];
  if (list.length === 0) {
    return [keyPoint({ time: 0, value: fallbackValue }, fallbackValue), keyPoint({ time: endTick, value: fallbackValue }, fallbackValue)];
  }
  if (list.length === 1) {
    const first = list[0];
    const firstTime = finiteNumber(first.time, 0);
    const extra = keyPoint({ ...first, time: firstTime < endTick ? endTick : firstTime + 1 }, fallbackValue);
    return firstTime <= finiteNumber(extra.time, endTick) ? [first, extra] : [extra, first];
  }
  list.sort((left, right) => finiteNumber(left.time) - finiteNumber(right.time));
  return list;
}

function sanitizeForExport(value: unknown): unknown {
  const chart = (value && typeof value === "object") ? { ...(value as Record<string, unknown>) } : {};
  const endTick = Math.max(1, finiteNumber(defaultEndTick(), 1_000_000));
  const canvasMoves = Array.isArray(chart.canvasMoves) && chart.canvasMoves.length > 0 ? chart.canvasMoves : [createEmptyCanvasMove(0)];
  const lastCanvas = Math.max(0, canvasMoves.length - 1);

  chart.fileVersion = Math.trunc(finiteNumber(chart.fileVersion, 1));
  chart.songsName = typeof chart.songsName === "string" ? chart.songsName : "";
  chart.bPM = Math.max(1, finiteNumber(chart.bPM ?? chart.bpm, 120));
  chart.offset = finiteNumber(chart.offset, 0);
  chart.bpmShifts = Array.isArray(chart.bpmShifts)
    ? chart.bpmShifts.map((point) => keyPoint(point, 1))
    : [];
  chart.themes = (Array.isArray(chart.themes) && chart.themes.length > 0 ? chart.themes : [{ colorsList: [] }]).map((item) => {
    const theme = (item && typeof item === "object") ? item as Record<string, unknown> : {};
    const colors = Array.isArray(theme.colorsList) ? theme.colorsList : [];
    return {
      colorsList: [
        sanitizeColor(colors[0], 255),
        sanitizeColor(colors[1], 255),
        sanitizeColor(colors[2], 255),
      ],
    };
  });
  chart.challengeTimes = Array.isArray(chart.challengeTimes)
    ? chart.challengeTimes.map((item) => {
        const challenge = (item && typeof item === "object") ? item as Record<string, unknown> : {};
        const start = Math.max(0, finiteNumber(challenge.start, 0));
        const end = Math.max(start, finiteNumber(challenge.end, start));
        return { checkPoint: finiteNumber(challenge.checkPoint, start), start, end, transTime: Math.max(0, finiteNumber(challenge.transTime, 0)) };
      })
    : [];
  chart.canvasMoves = canvasMoves.map((item, index) => {
    const move = (item && typeof item === "object") ? item as Record<string, unknown> : {};
    return {
      index,
      xPositionKeyPoints: ensureKeyPoints(move.xPositionKeyPoints, 0, endTick),
      yPositionKeyPoints: ensureKeyPoints(move.yPositionKeyPoints, 0, endTick),
      speedKeyPoints: ensureKeyPoints(move.speedKeyPoints, 1, endTick),
      rotationKeyPoints: ensureKeyPoints(move.rotationKeyPoints, 0, endTick),
    };
  });
  const camera = (chart.cameraMove && typeof chart.cameraMove === "object") ? chart.cameraMove as Record<string, unknown> : {};
  chart.cameraMove = {
    xPositionKeyPoints: ensureKeyPoints(camera.xPositionKeyPoints, 0, endTick),
    yPositionKeyPoints: ensureKeyPoints(camera.yPositionKeyPoints, 0, endTick),
    scaleKeyPoints: ensureKeyPoints(camera.scaleKeyPoints, 1, endTick),
    rotationKeyPoints: ensureKeyPoints(camera.rotationKeyPoints, 0, endTick),
  };
  chart.lines = Array.isArray(chart.lines)
    ? chart.lines
        .map((item) => {
          const line = (item && typeof item === "object") ? item as Record<string, unknown> : {};
          const linePoints = Array.isArray(line.linePoints) ? line.linePoints : [];
          const notes = Array.isArray(line.notes) ? line.notes : [];
          return {
            linePoints: linePoints.map((point) => {
              const node = (point && typeof point === "object") ? point as Record<string, unknown> : {};
              return {
                ...node,
                time: Math.max(0, finiteNumber(node.time, 0)),
                xPosition: finiteNumber(node.xPosition, 0),
                canvasIndex: Math.max(0, Math.min(lastCanvas, Math.trunc(finiteNumber(node.canvasIndex, 0)))),
                easeType: Math.trunc(finiteNumber(node.easeType, 0)),
                floorPosition: finiteNumber(node.floorPosition, 0),
                color: sanitizeColor(node.color),
              };
            }),
            notes: notes.map((note) => {
              const itemNote = (note && typeof note === "object") ? note as Record<string, unknown> : {};
              const infos = Array.isArray(itemNote.otherInformations) ? itemNote.otherInformations.map((info) => finiteNumber(info, 0)) : [];
              if (Math.trunc(finiteNumber(itemNote.type, 0)) === 2) {
                infos[0] = Math.max(finiteNumber(itemNote.time, 0), finiteNumber(infos[0], finiteNumber(itemNote.time, 0)));
                infos[1] = Math.max(0, Math.min(lastCanvas, Math.trunc(finiteNumber(infos[1], 0))));
                infos[2] = finiteNumber(infos[2], 0);
              }
              return {
                ...itemNote,
                type: Math.trunc(finiteNumber(itemNote.type, 0)),
                time: Math.max(0, finiteNumber(itemNote.time, 0)),
                floorPosition: finiteNumber(itemNote.floorPosition, 0),
                otherInformations: infos,
                isHited: false,
              };
            }),
            lineColor: (Array.isArray(line.lineColor) ? line.lineColor : []).map((source) => {
              const colorPoint = (source && typeof source === "object") ? source as Record<string, unknown> : {};
              return {
                time: Math.max(0, finiteNumber(colorPoint.time, 0)),
                startColor: sanitizeColor(colorPoint.startColor),
                endColor: sanitizeColor(colorPoint.endColor ?? colorPoint.startColor),
              };
            }),
            judgeRingColor: (Array.isArray(line.judgeRingColor) ? line.judgeRingColor : []).map((source) => {
              const colorPoint = (source && typeof source === "object") ? source as Record<string, unknown> : {};
              return {
                time: Math.max(0, finiteNumber(colorPoint.time, 0)),
                startColor: sanitizeColor(colorPoint.startColor),
                endColor: sanitizeColor(colorPoint.endColor ?? colorPoint.startColor),
              };
            }),
          };
        })
        .filter((line) => line.linePoints.length > 0)
    : [];
  return chart;
}

export async function exportChart(): Promise<void> {
  if (chartData === null) {
    window.alert("请先导入或新建谱面");
    return;
  }

  const text = `${JSON.stringify(sanitizeForExport(chartData), null, 2)}\n`;
  if (isTauri()) {
    const path = await save({
      defaultPath: "chart.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, text);
    return;
  }
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  try {
    if (typeof picker === "function") {
      const handle = await picker({
        suggestedName: "chart.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chart.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
