/**
 * Anti-Inspection & Source Code Protection
 * Blocks DevTools and Inspect shortcuts while allowing Copy & Paste on inputs
 */
(function() {
  'use strict';

  // 1. Allow Context Menu / Long Press on input fields for Copy/Paste, block elsewhere
  document.addEventListener('contextmenu', function(e) {
    // If the user right-clicks or long-presses inside an input or textarea, ALLOW it so they can Copy/Paste
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) {
      return true;
    }
    // Block inspect context menu on general page elements
    e.preventDefault();
    return false;
  }, false);

  // 2. Disable DevTools and View Source keyboard shortcuts only
  document.addEventListener('keydown', function(e) {
    // Allow standard Copy (Ctrl+C), Paste (Ctrl+V), Cut (Ctrl+X), Select All (Ctrl+A)
    const isControl = e.ctrlKey || e.metaKey;
    const key = (e.key || '').toLowerCase();
    const keyCode = e.keyCode;

    // F12 key (DevTools)
    if (keyCode === 123 || key === 'f12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I / Cmd+Opt+I (Inspect)
    if (isControl && e.shiftKey && (keyCode === 73 || key === 'i')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+J / Cmd+Opt+J (Console)
    if (isControl && e.shiftKey && (keyCode === 74 || key === 'j')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+C / Cmd+Opt+C (Element Inspector)
    if (isControl && e.shiftKey && (keyCode === 67 || key === 'c')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U / Cmd+Opt+U (View Page Source)
    if (isControl && !e.shiftKey && (keyCode === 85 || key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S / Cmd+S (Save Page HTML)
    if (isControl && !e.shiftKey && (keyCode === 83 || key === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, false);

  // 3. Clear console outputs periodically
  if (typeof console !== 'undefined') {
    setInterval(function() {
      try {
        console.clear();
      } catch (e) {}
    }, 2500);
  }
})();
