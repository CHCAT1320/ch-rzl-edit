<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { dialogState, resolveDialog } from "../dialog";

const primaryButton = ref<HTMLButtonElement | null>(null);

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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="appDialogTitle"
      >
        <h2 id="appDialogTitle">{{ dialogState.title }}</h2>
        <p class="dialogMessage">{{ dialogState.message }}</p>
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
  padding: 24px;
  border: 1px solid #666;
  border-radius: 8px;
  background: #2b2b2b;
  color: #f2f2f2;
  box-sizing: border-box;
}

.dialogCard h2 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 500;
}

.dialogMessage {
  margin: 0 0 22px;
  color: #cfcfcf;
  line-height: 1.6;
  white-space: pre-line;
}

.dialogActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
