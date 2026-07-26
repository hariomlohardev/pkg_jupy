/**
 * app/init.js – Common initializations: dropdowns, etc.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initDropdowns() {
  createDropdown({
    menu: document.getElementById('run-menu'),
    trigger: document.getElementById('run-menu-trigger'),
    dropdown: document.getElementById('run-menu-dropdown')
  });
  createDropdown({
    menu: document.getElementById('edit-menu'),
    trigger: document.getElementById('edit-menu-trigger'),
    dropdown: document.getElementById('edit-menu-dropdown')
  });
  createDropdown({
    menu: document.getElementById('export-menu'),
    trigger: document.getElementById('export-menu-trigger'),
    dropdown: document.getElementById('export-menu-dropdown')
  });
}
