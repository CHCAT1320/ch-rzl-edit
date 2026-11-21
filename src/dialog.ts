import { reactive } from "vue";

type DialogKind = "alert" | "confirm";

export interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface DialogState {
  visible: boolean;
  kind: DialogKind;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: ((value: boolean) => void) | null;
}

export const dialogState = reactive<DialogState>({
  visible: false,
  kind: "alert",
  title: "提示",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  danger: false,
  resolve: null,
});

function openDialog(kind: DialogKind, message: string, options: DialogOptions): Promise<boolean> {
  if (dialogState.visible) dialogState.resolve?.(false);
  return new Promise((resolve) => {
    dialogState.visible = true;
    dialogState.kind = kind;
    dialogState.title = options.title ?? (kind === "confirm" ? "确认" : "提示");
    dialogState.message = message;
    dialogState.confirmText = options.confirmText ?? "确定";
    dialogState.cancelText = options.cancelText ?? "取消";
    dialogState.danger = options.danger ?? false;
    dialogState.resolve = resolve;
  });
}

export function showAlert(message: string, options: DialogOptions = {}): Promise<void> {
  return openDialog("alert", message, options).then(() => undefined);
}

export function showConfirm(message: string, options: DialogOptions = {}): Promise<boolean> {
  return openDialog("confirm", message, options);
}

export function resolveDialog(value: boolean): void {
  const resolve = dialogState.resolve;
  dialogState.visible = false;
  dialogState.resolve = null;
  resolve?.(value);
}

export function isDialogOpen(): boolean {
  return dialogState.visible;
}
