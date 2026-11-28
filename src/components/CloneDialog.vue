<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  cloneSelectedPointsAndHolds,
  getPointHoldSelectionInfo,
  type PointHoldCloneRow,
} from "../chartEditor";
import { registerOverlay } from "../overlay";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (event: "update:visible", value: boolean): void }>();

type RowForm = PointHoldCloneRow & {
  selected: boolean;
  target: string;
};

const info = ref(getPointHoldSelectionInfo());
const rows = ref<RowForm[]>([]);
const keepSource = ref(false);
const error = ref("");
const pointDefault = ref("0");
const holdDefault = ref("0");
const batchTarget = ref("0");
let releaseOverlay: (() => void) | null = null;

const selectedRows = computed(() => rows.value.filter((row) => row.selected));
const allSelected = computed({
  get: () => rows.value.length > 0 && rows.value.every((row) => row.selected),
  set: (value: boolean) => {
    for (const row of rows.value) row.selected = value;
  },
});
const canApply = computed(() => selectedRows.value.length > 0);

function loadRows(): void {
  info.value = getPointHoldSelectionInfo();
  rows.value = info.value.rows.map((row) => ({
    ...row,
    selected: true,
    target: String(row.type === "hold" ? row.endCanvasIndex ?? row.canvasIndex : row.canvasIndex),
  }));
  const fallback = String(info.value.sourceCanvas);
  pointDefault.value = fallback;
  holdDefault.value = fallback;
  batchTarget.value = fallback;
  error.value = "";
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadRows();
      releaseOverlay = registerOverlay();
    } else {
      releaseOverlay?.();
      releaseOverlay = null;
    }
  },
);

onBeforeUnmount(() => {
  releaseOverlay?.();
  releaseOverlay = null;
});

function close(): void {
  error.value = "";
  emit("update:visible", false);
}

function reset(): void {
  loadRows();
}

function parseCanvas(text: string, label: string): number {
  const value = Number(text.trim());
  if (!Number.isInteger(value) || value < 0 || value >= info.value.canvasCount) {
    throw new Error(`${label} 必须是 0–${Math.max(0, info.value.canvasCount - 1)} 之间的整数`);
  }
  return value;
}

function applyDefault(type: "point" | "hold"): void {
  error.value = "";
  try {
    const value = parseCanvas(type === "point" ? pointDefault.value : holdDefault.value, type === "point" ? "点默认 Canvas" : "Hold 默认 Canvas");
    for (const row of rows.value) {
      if (row.type === type) row.target = String(value);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function applyBatch(): void {
  error.value = "";
  try {
    const value = parseCanvas(batchTarget.value, "批量 Canvas");
    for (const row of selectedRows.value) row.target = String(value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function formatTime(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatX(value: number): string {
  return value.toFixed(2);
}

function execute(): void {
  error.value = "";
  try {
    const chosen = selectedRows.value;
    if (!chosen.length) throw new Error("请至少勾选一个要克隆的元素");
    const assignments = chosen.map((row, index) => ({
      id: row.id,
      canvasIndex: parseCanvas(row.target, `第 ${index + 1} 行`),
    }));
    cloneSelectedPointsAndHolds(assignments, keepSource.value);
    close();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="cloneOverlay">
      <section class="cloneCard" role="dialog" aria-modal="true" aria-labelledby="cloneTitle">
        <header class="cloneHeader">
          <div>
            <h2 id="cloneTitle">多元素克隆</h2>
            <p class="cloneSummary">
              线节点 / Hold 跨 Canvas 克隆 · 源 Canvas {{ info.sourceCanvas }} · 共 {{ rows.length }} 项
            </p>
          </div>
          <button class="cloneClose" type="button" aria-label="关闭" @click="close">×</button>
        </header>

        <p v-if="!rows.length" class="cloneWarning">
          请先在 <strong>line&amp;note</strong> 模式中选择线节点或 Hold。
        </p>

        <div v-if="rows.length" class="cloneTableWrap">
          <div class="cloneTableHead">
            <label class="cloneCheck">
              <input v-model="allSelected" type="checkbox" />
              <span>全选</span>
            </label>
            <span>类型</span>
            <span>位置</span>
            <span>当前 cvs</span>
            <span>克隆到 cvs</span>
          </div>
          <div class="cloneTableBody">
            <div v-for="(row, index) in rows" :key="row.id" class="cloneRow">
              <label class="cloneCheck">
                <input v-model="row.selected" type="checkbox" />
                <span class="cloneRowIndex">{{ index + 1 }}</span>
              </label>
              <span class="cloneType">
                {{ row.type === "point" ? "点" : "Hold" }}
                <em v-if="row.type === 'hold' && row.canvasIndex !== row.endCanvasIndex">跨 cvs</em>
              </span>
              <span class="clonePosition">
                <template v-if="row.type === 'point'">
                  tick {{ formatTime(row.time) }} · X {{ formatX(row.x) }}
                </template>
                <template v-else>
                  {{ formatTime(row.time) }} → {{ formatTime(row.endTime) }} · X {{ formatX(row.x) }}
                </template>
              </span>
              <span class="cloneCurrent">
                <template v-if="row.type === 'point'">{{ row.canvasIndex }}</template>
                <template v-else>{{ row.canvasIndex }} → {{ row.endCanvasIndex }}</template>
              </span>
              <input
                v-model="row.target"
                class="cloneTarget"
                type="text"
                inputmode="numeric"
                :aria-label="`第 ${index + 1} 行克隆 Canvas`"
              />
            </div>
          </div>
        </div>

        <section v-if="rows.length" class="cloneQuick">
          <div class="cloneQuickRow">
            <label>点默认 cvs <input v-model="pointDefault" type="text" inputmode="numeric" /></label>
            <button class="simpleButton cloneMiniButton" type="button" @click="applyDefault('point')">应用</button>
            <label>Hold 默认 cvs <input v-model="holdDefault" type="text" inputmode="numeric" /></label>
            <button class="simpleButton cloneMiniButton" type="button" @click="applyDefault('hold')">应用</button>
          </div>
          <div class="cloneQuickRow">
            <label>批量设置选中项 cvs <input v-model="batchTarget" type="text" inputmode="numeric" /></label>
            <button class="simpleButton cloneMiniButton" type="button" @click="applyBatch">应用到选中项</button>
          </div>
        </section>

        <p v-if="error" class="cloneError">{{ error }}</p>

        <footer class="cloneActions">
          <button class="simpleButton cloneReset" type="button" :disabled="!rows.length" @click="reset">
            重置
          </button>
          <label class="cloneKeep">
            <input v-model="keepSource" type="checkbox" />
            <span>保留源</span>
          </label>
          <span class="cloneSpacer"></span>
          <button class="simpleButton" type="button" @click="close">取消</button>
          <button class="simpleButton cloneApply" type="button" :disabled="!canApply" @click="execute">
            执行
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cloneOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
  box-sizing: border-box;
}

.cloneCard {
  width: min(880px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 20px 22px;
  border: 1px solid #666;
  border-radius: 8px;
  background: #2b2b2b;
  color: #f2f2f2;
  box-sizing: border-box;
}

.cloneHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.cloneHeader h2 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 500;
}

.cloneSummary {
  margin: 0;
  color: #9fb7cc;
  font-size: 13px;
}

.cloneClose {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: #d8d8d8;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

.cloneClose:hover {
  color: #fff;
}

.cloneWarning,
.cloneError {
  margin: 8px 0 14px;
  padding: 10px 12px;
  border: 1px solid rgba(224, 163, 58, 0.55);
  border-radius: 6px;
  background: rgba(224, 163, 58, 0.1);
  color: #ffd899;
  line-height: 1.55;
}

.cloneError {
  border-color: rgba(224, 90, 90, 0.6);
  background: rgba(224, 90, 90, 0.1);
  color: #ffb3b3;
}

.cloneTableWrap {
  min-height: 0;
  border: 1px solid #444;
  border-radius: 6px;
  overflow: hidden;
}

.cloneTableHead,
.cloneRow {
  display: grid;
  grid-template-columns: 74px 90px minmax(180px, 1fr) 120px 130px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}

.cloneTableHead {
  background: #232323;
  color: #9fb7cc;
  font-size: 12px;
}

.cloneTableBody {
  max-height: min(40vh, 340px);
  overflow-y: auto;
}

.cloneRow {
  border-top: 1px solid #3a3a3a;
  font-size: 13px;
}

.cloneRow:nth-child(odd) {
  background: rgba(255, 255, 255, 0.025);
}

.cloneCheck {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.cloneCheck input {
  width: 16px;
  height: 16px;
  accent-color: #5a9f77;
}

.cloneRowIndex {
  color: #8e8e8e;
  font-size: 12px;
}

.cloneType {
  color: #e5e5e5;
  white-space: nowrap;
}

.cloneType em {
  margin-left: 4px;
  padding: 1px 6px;
  border: 1px solid rgba(224, 163, 58, 0.6);
  border-radius: 4px;
  color: #ffd899;
  font-size: 11px;
  font-style: normal;
}

.clonePosition {
  color: #bdbdbd;
  overflow-wrap: anywhere;
}

.cloneCurrent {
  color: #b8dcff;
  white-space: nowrap;
}

.cloneTarget {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #777;
  border-radius: 4px;
  background: #303030;
  color: #f2f2f2;
  font: inherit;
  box-sizing: border-box;
}

.cloneQuick {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #444;
  border-radius: 6px;
  background: #232323;
}

.cloneQuickRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.cloneQuickRow label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #cfcfcf;
  font-size: 13px;
}

.cloneQuickRow input {
  width: 64px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #666;
  border-radius: 4px;
  background: #303030;
  color: #f2f2f2;
  font: inherit;
  box-sizing: border-box;
}

.cloneMiniButton {
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
}

.cloneActions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.cloneKeep {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #dedede;
  white-space: nowrap;
}

.cloneKeep input {
  width: 16px;
  height: 16px;
  accent-color: #5a9f77;
}

.cloneSpacer {
  flex: 1;
}

.cloneReset {
  border-color: #b55;
  background: #5a2a2a;
}

.cloneReset:hover {
  border-color: #d77;
  background: #6d3333;
}

.cloneApply {
  border-color: #3f8f5f;
  background: #2f6b46;
}

.cloneApply:hover {
  border-color: #63b783;
  background: #3a8055;
}

@media (max-width: 760px) {
  .cloneTableHead {
    display: none;
  }

  .cloneRow {
    grid-template-columns: 60px 70px minmax(0, 1fr) 90px 100px;
  }
}
</style>
