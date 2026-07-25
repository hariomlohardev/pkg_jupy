/**
 * env/envTopbarMenu.js
 * "ENVIRONMENT" topbar dropdown, next to RUNTIME. Each item opens a
 * different view inside the left env-manager-panel (see env/envManager.js).
 * Only one view is ever visible at a time — clicking an item while a
 * *different* view is open cancels/replaces it; clicking the item for the
 * view that's already open closes the panel.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initEnvTopbarMenu({ menu, trigger, dropdown, envManager }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('envmenu-current', () => envManager.openView('current'));
  bind('envmenu-create', () => envManager.openView('create'));
  bind('envmenu-pip', () => envManager.openView('pip'));
}