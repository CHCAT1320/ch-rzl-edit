import { drawCanvas } from "./canvas";
import { setupChartEditor } from "./chartEditor";
import { drawChart, refreshChart, resetPlaybackState, startChartRenderer, suppressHitEffects } from "./drawChart";
import { setPreviewMode, toggleEditMode } from "./editMode";
import { exportChart, loadChart, loadMusic, newChart } from "./fileManager";
import { preloadHitSounds, resumeHitSounds } from "./hitSound";

export {};

let previewStartTime: number | null = null;

declare global {
  interface Window {
    loadChart: typeof loadChart;
    newChart: typeof newChart;
    loadMusic: typeof loadMusic;
    exportChart: typeof exportChart;
  }
}

window.loadChart = loadChart;
window.newChart = newChart;
window.loadMusic = loadMusic;
window.exportChart = exportChart;

function redraw(): void {
  drawCanvas();
  drawChart();
}

window.addEventListener("resize", redraw);
window.addEventListener("chartchanged", refreshChart);
window.addEventListener("editorseek", suppressHitEffects);
window.addEventListener("load", () => {
  setupChartEditor();
  redraw();
  startChartRenderer();
  void preloadHitSounds().catch((error: unknown) => {
    console.error("打击音效预加载失败", error);
  });
});

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.blur();
}, true);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    const audio = document.querySelector<HTMLAudioElement>("#audio");
    if (!audio?.src) return;
    if (audio.paused) void audio.play();
    else audio.pause();
    return;
  }

  const target = event.target;
  if (isTypingTarget(target)) return;

  if (event.code === "F12") {
    event.preventDefault();
    const invoke = (window as Window & { __TAURI__?: { core?: { invoke?: (command: string) => Promise<unknown> } } }).__TAURI__?.core?.invoke;
    void invoke?.("toggle_devtools");
    return;
  }

  if (event.code === "KeyU") {
    event.preventDefault();
    toggleEditMode();
    drawChart();
    return;
  }

  if (event.code === "KeyT") {
    event.preventDefault();
    if (event.repeat || previewStartTime !== null) return;
    const audio = document.querySelector<HTMLAudioElement>("#audio");
    previewStartTime = audio?.src ? audio.currentTime : 0;
    setPreviewMode(true);
    if (audio?.src) void audio.play();
    drawChart();
    return;
  }

});

function endPreview(): void {
  if (previewStartTime === null) return;
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  if (audio?.src) {
    audio.pause();
    audio.currentTime = previewStartTime;
    resetPlaybackState();
  }
  previewStartTime = null;
  setPreviewMode(false);
  drawChart();
}

window.addEventListener("keyup", (event) => {
  if (event.code !== "KeyT") return;
  event.preventDefault();
  endPreview();
});

window.addEventListener("blur", endPreview);

window.addEventListener("load", () => {
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  audio?.addEventListener("seeking", resetPlaybackState);
  audio?.addEventListener("play", () => {
    void resumeHitSounds();
  });
});
