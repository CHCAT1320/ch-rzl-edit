<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { drawCanvas } from "../canvas";
import { setupChartEditor } from "../chartEditor";
import {
  drawChart,
  refreshChart,
  resetPlaybackState,
  startChartRenderer,
  suppressHitEffects,
} from "../drawChart";
import { setPreviewMode, toggleEditMode } from "../editMode";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { restoreMusicElement, resetSession, hasImportedChart } from "../fileManager";
import { isDialogOpen, showConfirm } from "../dialog";
import { preloadHitSounds, resumeHitSounds } from "../hitSound";
import EditorHeader from "../components/EditorHeader.vue";
import EditorSidebar from "../components/EditorSidebar.vue";

let disposeEditor: (() => void) | null = null;
let previewStartTime: number | null = null;
let audioElement: HTMLAudioElement | null = null;
const router = useRouter();

function redraw(): void {
  drawCanvas();
  drawChart();
}

function handleResize(): void {
  redraw();
}

function handleChartChanged(): void {
  refreshChart();
}

function handleEditorSeek(): void {
  suppressHitEffects();
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function handleSpaceCapture(event: KeyboardEvent): void {
  if (isDialogOpen()) return;
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.blur();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (isDialogOpen()) return;
  if (event.code === "Space") {
    event.preventDefault();
    const audio = document.querySelector<HTMLAudioElement>("#audio");
    if (!audio?.src) return;
    if (audio.paused) void audio.play();
    else audio.pause();
    return;
  }

  if (isTypingTarget(event.target)) return;

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
  }
}

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

function handleKeyUp(event: KeyboardEvent): void {
  if (event.code !== "KeyT") return;
  event.preventDefault();
  endPreview();
}

function handleWindowBlur(): void {
  endPreview();
}

function handleAudioSeeking(): void {
  resetPlaybackState();
}

function handleAudioPlay(): void {
  void resumeHitSounds();
}

onMounted(() => {
  disposeEditor = setupChartEditor();
  restoreMusicElement();
  redraw();
  startChartRenderer();

  void preloadHitSounds().catch((error: unknown) => {
    console.error("打击音效预加载失败", error);
  });

  audioElement = document.querySelector<HTMLAudioElement>("#audio");
  audioElement?.addEventListener("seeking", handleAudioSeeking);
  audioElement?.addEventListener("play", handleAudioPlay);

  window.addEventListener("resize", handleResize);
  window.addEventListener("chartchanged", handleChartChanged);
  window.addEventListener("editorseek", handleEditorSeek);
  window.addEventListener("keydown", handleSpaceCapture, true);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleWindowBlur);
});

onBeforeUnmount(() => {
  endPreview();
  disposeEditor?.();
  disposeEditor = null;

  audioElement?.removeEventListener("seeking", handleAudioSeeking);
  audioElement?.removeEventListener("play", handleAudioPlay);
  audioElement = null;

  window.removeEventListener("resize", handleResize);
  window.removeEventListener("chartchanged", handleChartChanged);
  window.removeEventListener("editorseek", handleEditorSeek);
  window.removeEventListener("keydown", handleSpaceCapture, true);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
});

onBeforeRouteLeave(async () => {
  if (!hasImportedChart()) return true;
  const confirmed = await showConfirm("当前谱面尚未导出，返回后将丢失本次编辑。", {
    title: "返回开始界面？",
    confirmText: "返回并放弃编辑",
    cancelText: "取消",
    danger: true,
  });
  if (!confirmed) return false;
  resetSession();
  return true;
});

function requestBack(): void {
  void router.push("/");
}
</script>

<template>
  <main class="container">
    <EditorHeader @back="requestBack" />
    <div id="editArea">
      <canvas id="cvs"></canvas>
      <EditorSidebar />
    </div>
  </main>
</template>
