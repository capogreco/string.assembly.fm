/**
 * Debug script for testing instrument range functionality
 * Run in browser console to check range settings and visual feedback
 */

function debugRangeFunctionality() {
  console.log("🔍 Debugging Piano Range Functionality");
  console.log("====================================");

  // Check if piano keyboard is available
  const pianoKeyboard = window.pianoKeyboard || window.modular?.pianoKeyboard;
  if (!pianoKeyboard) {
    console.error("❌ PianoKeyboard not found in global scope");
    return;
  }

  // Check current body type
  const currentBodyType = pianoKeyboard.appState.get("bodyType");
  console.log(`📊 Current Body Type: ${currentBodyType}`);

  // Get instrument ranges
  const instrumentRanges = pianoKeyboard.getInstrumentRanges();
  console.log("🎻 Available Instrument Ranges:");
  Object.entries(instrumentRanges).forEach(([index, range]) => {
    const marker = index == currentBodyType ? "👉" : "  ";
    console.log(
      `${marker} ${index}: ${range.name} (${range.low.toFixed(1)}Hz - ${range.high.toFixed(1)}Hz)`,
    );
  });

  // Get current range
  const currentRange = pianoKeyboard.getCurrentInstrumentRange();
  if (currentRange) {
    console.log(
      `🎯 Current Range: ${currentRange.name} (${currentRange.low.toFixed(1)}Hz - ${currentRange.high.toFixed(1)}Hz)`,
    );
  } else {
    console.log("❌ No current range found");
  }

  // Check piano keys status
  console.log("\n🎹 Piano Keys Status:");
  const keys = pianoKeyboard.keys;
  let inRangeCount = 0;
  let outOfRangeCount = 0;

  keys.forEach((keyData, frequency) => {
    const element = keyData.element;
    const note = element.getAttribute("data-note-name");
    const isOutOfRange = element.classList.contains("out-of-range");
    const currentFill = element.getAttribute("fill");

    if (isOutOfRange) {
      outOfRangeCount++;
      if (outOfRangeCount <= 5) {
        // Show first 5 out-of-range keys
        console.log(
          `  ❌ ${note} (${frequency.toFixed(1)}Hz) - OUT OF RANGE - fill: ${currentFill}`,
        );
      }
    } else {
      inRangeCount++;
      if (inRangeCount <= 5) {
        // Show first 5 in-range keys
        console.log(
          `  ✅ ${note} (${frequency.toFixed(1)}Hz) - IN RANGE - fill: ${currentFill}`,
        );
      }
    }
  });

  console.log(
    `\n📈 Summary: ${inRangeCount} in range, ${outOfRangeCount} out of range`,
  );

  // Test changing body type
  console.log("\n🔧 Testing Body Type Changes:");
  const testBodyTypes = [0, 3, 4]; // Violin, Double Bass, None

  testBodyTypes.forEach((bodyType) => {
    const range = instrumentRanges[bodyType];
    console.log(`\n⚡ Testing ${range.name} (bodyType: ${bodyType})`);

    // Set body type
    pianoKeyboard.appState.set("bodyType", bodyType);

    // Force range update
    pianoKeyboard.updateKeyRangeStylesVisual();

    // Check results
    let newOutOfRangeCount = 0;
    keys.forEach((keyData, frequency) => {
      if (keyData.element.classList.contains("out-of-range")) {
        newOutOfRangeCount++;
      }
    });

    console.log(`  📊 ${newOutOfRangeCount} keys now out of range`);
  });

  // Restore original body type
  pianoKeyboard.appState.set("bodyType", currentBodyType);
  pianoKeyboard.updateKeyRangeStylesVisual();

  console.log(`\n🔄 Restored original bodyType: ${currentBodyType}`);
  console.log("✅ Range debugging complete");
}

function debugSpecificKey(noteName) {
  const pianoKeyboard = window.pianoKeyboard || window.modular?.pianoKeyboard;
  if (!pianoKeyboard) {
    console.error("❌ PianoKeyboard not found");
    return;
  }

  const keys = pianoKeyboard.keys;
  let foundKey = null;

  keys.forEach((keyData, frequency) => {
    const note = keyData.element.getAttribute("data-note-name");
    if (note === noteName) {
      foundKey = { keyData, frequency };
    }
  });

  if (!foundKey) {
    console.error(`❌ Key ${noteName} not found`);
    return;
  }

  const { keyData, frequency } = foundKey;
  const element = keyData.element;
  const currentRange = pianoKeyboard.getCurrentInstrumentRange();

  console.log(`🔍 Key Debug: ${noteName}`);
  console.log(`  Frequency: ${frequency.toFixed(1)}Hz`);
  console.log(`  Current fill: ${element.getAttribute("fill")}`);
  console.log(
    `  Data-original-fill: ${element.getAttribute("data-original-fill")}`,
  );
  console.log(`  Classes: ${element.className.baseVal || element.className}`);
  console.log(`  Pointer events: ${element.style.pointerEvents}`);
  console.log(`  KeyData inRange: ${keyData.inRange}`);

  if (currentRange) {
    const inRange =
      frequency >= currentRange.low && frequency <= currentRange.high;
    console.log(
      `  Should be in range: ${inRange} (range: ${currentRange.low.toFixed(1)}Hz - ${currentRange.high.toFixed(1)}Hz)`,
    );
  }
}

function forceRangeUpdate() {
  console.log("🔄 Forcing range update...");

  const pianoKeyboard = window.pianoKeyboard || window.modular?.pianoKeyboard;
  if (!pianoKeyboard) {
    console.error("❌ PianoKeyboard not found");
    return;
  }

  pianoKeyboard.updateKeyRangeStylesVisual();
  console.log("✅ Range update complete");
}

function setBodyType(bodyType) {
  console.log(`🎻 Setting body type to: ${bodyType}`);

  const pianoKeyboard = window.pianoKeyboard || window.modular?.pianoKeyboard;
  if (!pianoKeyboard) {
    console.error("❌ PianoKeyboard not found");
    return;
  }

  pianoKeyboard.appState.set("bodyType", bodyType);
  console.log("✅ Body type set, range should update automatically");
}

// Export functions to global scope for console use
if (typeof window !== "undefined") {
  window.debugRangeFunctionality = debugRangeFunctionality;
  window.debugSpecificKey = debugSpecificKey;
  window.forceRangeUpdate = forceRangeUpdate;
  window.setBodyType = setBodyType;

  console.log("🛠️ Range debug functions loaded:");
  console.log("  debugRangeFunctionality() - Full range debugging");
  console.log("  debugSpecificKey('C4') - Debug specific key");
  console.log("  forceRangeUpdate() - Force range visual update");
  console.log(
    "  setBodyType(0) - Set body type (0=Violin, 1=Viola, 2=Cello, 3=Bass, 4=None)",
  );
}
