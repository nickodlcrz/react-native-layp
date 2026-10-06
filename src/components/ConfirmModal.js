import { showAppDialog } from "./AppDialog";

// Confirmations now share the same queued, animated dialog as other notices.
export function confirmAction({ title, message, confirmLabel = "Confirm", destructive = false, onConfirm }) {
  showAppDialog(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
export function confirmDelete(title, message, onConfirm) {
  confirmAction({ title, message, confirmLabel: "Delete", destructive: true, onConfirm });
}
