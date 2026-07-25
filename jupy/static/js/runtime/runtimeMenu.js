/**
 * runtime/runtimeMenu.js
 * Jupyter-style "RUNTIME" dropdown menu. Hover/click/outside-click/Escape
 * behavior lives in the shared core/dropdownMenu.js controller — this module
 * just wires the RUNTIME-specific menu items to notebook actions.
 *
 * NOTE: "Environment" used to live at the bottom of this menu. It's now its
 * own top-level "ENVIRONMENT" dropdown next to RUNTIME — see
 * env/envTopbarMenu.js — so this menu only ever deals with kernel lifecycle.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initRuntimeMenu({ menu, trigger, dropdown, notebook }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('runtime-restart', () => notebook.restartKernel());
  bind('runtime-restart-run-all', () => notebook.restartAndRunAll());
  bind('runtime-restart-run-selected', () => notebook.restartAndRunToSelected());
}