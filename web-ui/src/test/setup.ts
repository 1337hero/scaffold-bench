import { Window } from "happy-dom";

const windowInstance = new Window();

Object.assign(globalThis, {
  window: windowInstance,
  document: windowInstance.document,
  navigator: windowInstance.navigator,
  HTMLElement: windowInstance.HTMLElement,
  HTMLDialogElement: windowInstance.HTMLDialogElement,
  Event: windowInstance.Event,
  MouseEvent: windowInstance.MouseEvent,
  KeyboardEvent: windowInstance.KeyboardEvent,
  Node: windowInstance.Node,
  getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
});

(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "test";

HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.setAttribute("open", "");
};

HTMLDialogElement.prototype.close ??= function close() {
  this.removeAttribute("open");
};
