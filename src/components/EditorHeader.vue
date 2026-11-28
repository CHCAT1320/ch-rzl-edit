<script setup lang="ts">
import { exportChart } from "../fileManager";

const emit = defineEmits<{
  (event: "back"): void;
  (event: "clone"): void;
}>();
</script>

<template>
  <header>
    <button class="simpleButton headerLink" type="button" @click="emit('back')">返回</button>
    <label class="headerCanvasControl" for="editingCanvasIndex">
      <span>当前 Canvas</span>
      <input id="editingCanvasIndex" type="number" min="0" max="99" step="1" value="0" />
      <button id="addCanvasButton" class="miniButton" type="button">新建 Canvas</button>
      <button id="deleteCanvasButton" class="miniButton" type="button">删除当前 Canvas</button>
    </label>
    <label class="headerCanvasControl" for="editObjectMode">
      <span>编辑对象</span>
      <select id="editObjectMode">
        <option value="lineNote">line&amp;note</option>
        <option value="canvasX">cvsMX</option>
        <option value="canvasY">cvsMY</option>
        <option value="canvasSpeed">cvsSpeed</option>
        <option value="canvasRotation">cvsRot</option>
        <option value="cameraX">cameraX</option>
        <option value="cameraY">cameraY</option>
        <option value="cameraScale">cameraScale</option>
        <option value="cameraRotation">cameraRot</option>
      </select>
    </label>
    <button class="simpleButton" type="button" @click="emit('clone')">多元素克隆</button>
    <button class="simpleButton" type="button" @click="exportChart">导出谱面</button>
  </header>
</template>
