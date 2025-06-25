/**
 * Module Loader for String Assembly FM
 * Detects ES6 module support and provides fallback to legacy system
 */

(function () {
  "use strict";

  // Track which system has been loaded to prevent double loading
  let systemLoaded = null; // 'modular', 'legacy', or null

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

  // Log loading status
  function log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [MODULE-LOADER]`;

    switch (type) {
      case "error":
        console.error(`${prefix} ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  // Load modular system
  function loadModularSystem() {
    // Prevent double loading
    if (systemLoaded) {
      log(`System already loaded: ${systemLoaded}. Skipping modular load.`);
      return;
    }

    log("Loading modular system...");
    systemLoaded = "modular";

    // Create module script
    const script = document.createElement("script");
    script.type = "module";
    script.src = "./js/app.js";

    script.onload = function () {
      log("Modular system loaded successfully");
      document.body.classList.add("modular-loaded");
      console.log(
        "[MODULE-LOADER] app.js loaded successfully - modular system active",
      );
    };

    script.onerror = function (error) {
      log("Failed to load modular system - NO FALLBACK", "error");
      console.error("[MODULE-LOADER] app.js failed to load:", error);
      console.error("Full error details:", error);
      showErrorMessage();
    };

    document.head.appendChild(script);
  }

  // Legacy system removed - modular only
  function loadLegacySystem() {
    log("Legacy system disabled - modular only", "error");
    showErrorMessage();
  }

  // Show error message if both systems fail
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
      <h3 style="margin: 0 0 10px 0;">Modular System Loading Error</h3>
      <p style="margin: 0;">Unable to load the modular String Assembly FM system. Check console for details.</p>
      <ul style="margin: 10px 0 0 20px;">
        <li>Check browser console for specific module errors</li>
        <li>Verify all module files exist and have correct MIME types</li>
        <li>Ensure you're using a modern browser with ES6 module support</li>
        <li>Check network connectivity</li>
      </ul>
      <p style="margin: 10px 0 0 0; font-weight: bold;">Legacy fallback has been disabled.</p>
    `;

    document.body.appendChild(errorDiv);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 10000);
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

    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (loadingDiv.parentNode) {
        loadingDiv.parentNode.removeChild(loadingDiv);
      }
    }, 30000);
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
    log("Initializing module loader...");

    // Show loading indicator
    showLoadingIndicator();

    // Hide loading indicator when either system loads
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const classList = mutation.target.classList;
          if (
            classList.contains("modular-loaded") ||
            classList.contains("legacy-loaded")
          ) {
            hideLoadingIndicator();
            observer.disconnect();
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Check browser capabilities
    if (supportsES6Modules() && supportsRequiredFeatures()) {
      log("Browser supports ES6 modules, loading modular system");
      console.log(
        "[MODULE-LOADER] ES6 modules supported, calling loadModularSystem()",
      );
      loadModularSystem();
    } else {
      log("Browser does not support ES6 modules, loading legacy system");
      console.log(
        "[MODULE-LOADER] ES6 modules NOT supported, calling loadLegacySystem()",
      );
      loadLegacySystem();
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
    loadModularSystem,
    loadLegacySystem,
    showErrorMessage,
    getLoadedSystem: () => systemLoaded,
  };
})();
