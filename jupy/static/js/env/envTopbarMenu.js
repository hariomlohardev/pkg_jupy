/**
 * env/envTopbarMenu.js
 * "ENVIRONMENT" topbar dropdown. Items:
 *   - Current Environment
 *   - Create Environment
 *   - Pip Manager
 *   - Outline
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initEnvTopbarMenu({ menu, trigger, dropdown, envManager }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('envmenu-current', () => envManager.openView('current'));
  bind('envmenu-create', () => envManager.openView('create'));
  bind('envmenu-pip', () => envManager.openView('pip'));
  bind('envmenu-outline', () => envManager.openView('outline'));
}