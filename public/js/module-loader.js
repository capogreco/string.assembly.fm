/**
 * Module Loader for String Assembly FM
 * Loads the modular ES6 system
 */

(function () {
  "use strict";

  // Check for ES6 module support
  function supportsES6Modules() {
    try {
      new Function('import("")');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Check if browser supports ES6 features we need
  function supportsRequiredFeatures() {
    try {
      // Check for Map, Set, async/await, classes, etc.
      return (
        typeof Map !== "undefined" &&
        typeof Set !== "undefined" &&
        typeof Promise !== "undefined" &&
        "noModule" in HTMLScriptElement.prototype
      );
    } catch (e) {
      return false;
    }
  }

  // Load modular system
  function loadModularSystem() {
    console.log("[MODULE-LOADER] Loading modular system...");
    
    // Determine which app to load based on the page
    let appModule;
    const pathname = window.location.pathname;
    
    if (pathname.includes('/ctrl') || pathname.endsWith('/ctrl.html')) {
      appModule = './js/apps/controller-app.js';
      console.log("[MODULE-LOADER] Detected controller page");
    } else if (pathname.includes('/ensemble') || pathname.endsWith('/ensemble.html')) {
      appModule = './js/apps/ensemble-app.js';
      console.log("[MODULE-LOADER] Detected ensemble page");
    } else {
      // Default to synth for index.html
      appModule = './js/apps/synth-app.js';
      console.log("[MODULE-LOADER] Detected synth page");
    }

    // Create module script
    const script = document.createElement("script");
    script.type = "module";
    script.src = appModule;

    script.onload = function () {
      console.log("[MODULE-LOADER] Modular system loaded successfully");
      document.body.classList.add("modular-loaded");
      hideLoadingIndicator();
    };

    script.onerror = function (error) {
      console.error("[MODULE-LOADER] Failed to load modular system", error);
      hideLoadingIndicator();
      showErrorMessage();
    };

    document.head.appendChild(script);
  }

  // Show error message if module loading fails
  function showErrorMessage() {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 20px;
      border-radius: 8px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;

    errorDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Module Loading Error</h3>
      <p style="margin: 0;">Unable to load String Assembly FM. Your browser may not support ES6 modules.</p>
      <ul style="margin: 10px 0 0 20px;">
        <li>Please use a modern browser (Chrome, Firefox, Safari, Edge)</li>
        <li>Check browser console for specific errors</li>
        <li>Verify network connectivity</li>
      </ul>
    `;

    document.body.appendChild(errorDiv);
  }

  // Show loading indicator
  function showLoadingIndicator() {
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "loading-indicator";
    loadingDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(102, 126, 234, 0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 6px;
      z-index: 9999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: opacity 0.3s ease;
    `;

    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 10px;
        "></div>
        Loading Controller...
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(loadingDiv);
  }

  // Hide loading indicator
  function hideLoadingIndicator() {
    const loadingDiv = document.getElementById("loading-indicator");
    if (loadingDiv) {
      loadingDiv.style.opacity = "0";
      setTimeout(() => {
        if (loadingDiv.parentNode) {
          loadingDiv.parentNode.removeChild(loadingDiv);
        }
      }, 300);
    }
  }

  // Main initialization
  function initialize() {
    console.log("[MODULE-LOADER] Initializing...");

    // Show loading indicator
    showLoadingIndicator();

    // Check browser capabilities
    if (supportsES6Modules() && supportsRequiredFeatures()) {
      console.log("[MODULE-LOADER] Browser supports ES6 modules");
      loadModularSystem();
    } else {
      console.error("[MODULE-LOADER] Browser does not support required features");
      hideLoadingIndicator();
      showErrorMessage();
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  // Expose module loader for debugging
  window.moduleLoader = {
    supportsES6Modules,
    supportsRequiredFeatures,
    loadModularSystem
  };
})();