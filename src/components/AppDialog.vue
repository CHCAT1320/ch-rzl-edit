<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { dialogState, resolveDialog, type DialogItemTone } from "../dialog";

const primaryButton = ref<HTMLButtonElement | null>(null);

const toneLabels: Record<DialogItemTone, string> = {
  error: "错误",
  warn: "警告",
  info: "提示",
};

watch(
  () => dialogState.visible,
  (visible) => {
    if (visible) void nextTick(() => primaryButton.value?.focus());
  },
);

function handleEscape(): void {
  if (dialogState.visible) resolveDialog(false);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogState.visible" class="dialogOverlay" @keydown.esc.stop.prevent="handleEscape">
      <section
        class="dialogCard"
        :class="{ dialogCardWide: dialogState.items.length > 0 }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="appDialogTitle"
      >
        <h2 id="appDialogTitle">{{ dialogState.title }}</h2>
        <p v-if="dialogState.message" class="dialogMessage">{{ dialogState.message }}</p>
        <ul v-if="dialogState.items.length > 0" class="dialogIssues">
          <li
            v-for="(item, index) in dialogState.items"
            :key="index"
            class="dialogIssue"
            :class="`dialogIssue--${item.tone}`"
          >
            <span class="dialogIssueBadge">{{ toneLabels[item.tone] }}</span>
            <div class="dialogIssueBody">
              <div v-if="item.path" class="dialogIssuePath">{{ item.path }}</div>
              <div class="dialogIssueText">{{ item.message }}</div>
            </div>
          </li>
        </ul>
        <div class="dialogActions">
          <button
            v-if="dialogState.kind === 'confirm'"
            class="simpleButton dialogButton"
            type="button"
            @click="resolveDialog(false)"
          >
            {{ dialogState.cancelText }}
          </button>
          <button
            ref="primaryButton"
            class="simpleButton dialogButton"
            :class="{ dialogDanger: dialogState.danger }"
            type="button"
            @click="resolveDialog(true)"
          >
            {{ dialogState.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialogOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
  box-sizing: border-box;
}

.dialogCard {
  width: min(420px, 100%);
  max-height: min(85vh, 720px);
  display: flex;
  flex-direction: column;
  padding: 24px;
  border: 1px solid #666;
  border-radius: 8px;
  background: #2b2b2b;
  color: #f2f2f2;
  box-sizing: border-box;
}

.dialogCardWide {
  width: min(640px, 100%);
}

.dialogCard h2 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 500;
}

.dialogMessage {
  margin: 0 0 20px;
  color: #cfcfcf;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
  max-height: min(50vh, 360px);
  overflow-y: auto;
}

.dialogIssues {
  list-style: none;
  margin: 0 0 20px;
  padding: 0 6px 0 0;
  display: grid;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
}

.dialogIssue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid #444;
  border-left: 3px solid #777;
  border-radius: 6px;
  background: #232323;
}

.dialogIssue--error {
  border-left-color: #e05a5a;
  background: rgba(224, 90, 90, 0.09);
}

.dialogIssue--warn {
  border-left-color: #e0a33a;
  background: rgba(224, 163, 58, 0.09);
}

.dialogIssue--info {
  border-left-color: #4aa3e0;
  background: rgba(74, 163, 224, 0.09);
}

.dialogIssueBadge {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #666;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}

.dialogIssue--error .dialogIssueBadge {
  border-color: rgba(224, 90, 90, 0.7);
  background: rgba(224, 90, 90, 0.18);
  color: #ffb3b3;
}

.dialogIssue--warn .dialogIssueBadge {
  border-color: rgba(224, 163, 58, 0.7);
  background: rgba(224, 163, 58, 0.18);
  color: #ffd899;
}

.dialogIssue--info .dialogIssueBadge {
  border-color: rgba(74, 163, 224, 0.7);
  background: rgba(74, 163, 224, 0.18);
  color: #b8dcff;
}

.dialogIssueBody {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.dialogIssuePath {
  color: #9fb7cc;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dialogIssueText {
  color: #ececec;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.dialogActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.dialogButton {
  min-width: 88px;
  box-sizing: border-box;
}

.dialogDanger {
  border-color: #b55;
  background: #5a2a2a;
}

.dialogDanger:hover {
  border-color: #d77;
  background: #6d3333;
}
</style>
