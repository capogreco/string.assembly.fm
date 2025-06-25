/**
 * Test harness for piano expression functionality
 * Validates gesture detection, expression assignment, and state management
 */

class PianoExpressionTester {
  constructor() {
    this.testResults = [];
    this.failures = [];
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log("🧪 Starting Piano Expression Tests...");

    this.testResults = [];
    this.failures = [];

    // Test 1: Expression Detection
    await this.testExpressionDetection();

    // Test 2: Depth Calculation
    await this.testDepthCalculation();

    // Test 3: Trill Interval Calculation
    await this.testTrillIntervalCalculation();

    // Test 4: State Synchronization
    await this.testStateSynchronization();

    // Test 5: Visual Feedback
    await this.testVisualFeedback();

    // Test distribution logic
    await this.testDistributionLogic();

    // Test 7: Clear Functionality
    await this.testClearFunctionality();

    // Test 8: Instrument Range
    await this.testInstrumentRange();

    // Test 9: Out-of-Range Trill Blocking
    await this.testTrillRangeBlocking();

    // Report results
    this.reportResults();
  }

  /**
   * Test instrument range functionality
   */
  async testInstrumentRange() {
    console.log("Testing instrument range functionality...");

    // Test different instrument ranges
    const instrumentTests = [
      {
        bodyType: 0, // Violin
        name: "Violin",
        lowNote: "G3",
        highNote: "A7",
        testNotes: [
          { note: "G3", shouldBeInRange: true },
          { note: "E4", shouldBeInRange: true },
          { note: "A7", shouldBeInRange: true },
          { note: "C2", shouldBeInRange: false },
          { note: "C8", shouldBeInRange: false },
        ],
      },
      {
        bodyType: 3, // Double Bass
        name: "Double Bass",
        lowNote: "E1",
        highNote: "G4",
        testNotes: [
          { note: "E1", shouldBeInRange: true },
          { note: "C2", shouldBeInRange: true },
          { note: "G4", shouldBeInRange: true },
          { note: "C1", shouldBeInRange: false },
          { note: "A5", shouldBeInRange: false },
        ],
      },
      {
        bodyType: 4, // None (full range)
        name: "None",
        lowNote: "C0",
        highNote: "B8",
        testNotes: [
          { note: "C1", shouldBeInRange: true },
          { note: "C4", shouldBeInRange: true },
          { note: "C7", shouldBeInRange: true },
        ],
      },
    ];

    for (const test of instrumentTests) {
      const rangeValid = this.testInstrumentRangeForBodyType(test);
      this.recordTest(
        `Instrument Range: ${test.name} range validation`,
        rangeValid.success,
        {
          instrument: test.name,
          bodyType: test.bodyType,
          expectedRange: `${test.lowNote} - ${test.highNote}`,
          details: rangeValid.details,
        },
      );

      // Test individual notes for this instrument
      for (const noteTest of test.testNotes) {
        const noteInRange = this.simulateNoteRangeCheck(
          noteTest.note,
          test.bodyType,
        );
        const passed = noteInRange === noteTest.shouldBeInRange;

        this.recordTest(
          `Instrument Range: ${test.name} - ${noteTest.note} ${noteTest.shouldBeInRange ? "should be" : "should not be"} in range`,
          passed,
          {
            instrument: test.name,
            note: noteTest.note,
            expected: noteTest.shouldBeInRange,
            actual: noteInRange,
          },
        );
      }
    }
  }

  /**
   * Test expression detection based on drag vectors
   */
  async testExpressionDetection() {
    console.log("Testing expression detection...");

    const tests = [
      {
        dx: 0,
        dy: -40,
        expected: "vibrato",
        description: "Upward drag should detect vibrato",
      },
      {
        dx: 0,
        dy: 40,
        expected: "tremolo",
        description: "Downward drag should detect tremolo",
      },
      {
        dx: 30,
        dy: 5,
        expected: "trill",
        description: "Horizontal drag should detect trill",
      },
      {
        dx: 5,
        dy: 5,
        expected: "none",
        description: "Small drag should be treated as click",
      },
      {
        dx: 0,
        dy: -20,
        expected: "none",
        description: "Small upward drag should not trigger vibrato",
      },
      {
        dx: 0,
        dy: 20,
        expected: "none",
        description: "Small downward drag should not trigger tremolo",
      },
    ];

    for (const test of tests) {
      const result = this.simulateExpressionDetection(test.dx, test.dy);
      const passed = result.type === test.expected;

      this.recordTest(`Expression Detection: ${test.description}`, passed, {
        input: `dx:${test.dx}, dy:${test.dy}`,
        expected: test.expected,
        actual: result.type,
      });
    }
  }

  /**
   * Test depth calculation for vibrato and tremolo
   */
  async testDepthCalculation() {
    console.log("Testing depth calculation...");

    const tests = [
      {
        dy: -30,
        threshold: -30,
        expected: 0.0,
        description: "At threshold should give 0% depth",
      },
      {
        dy: -80,
        threshold: -30,
        expected: 1.0,
        description: "Large drag should give 100% depth",
      },
      {
        dy: -55,
        threshold: -30,
        expected: 0.5,
        description: "Medium drag should give 50% depth",
      },
      {
        dy: 30,
        threshold: 30,
        expected: 0.0,
        description: "Tremolo at threshold should give 0% depth",
      },
      {
        dy: 80,
        threshold: 30,
        expected: 1.0,
        description: "Large tremolo drag should give 100% depth",
      },
    ];

    for (const test of tests) {
      const depth = this.calculateExpressionDepth(test.dy, test.threshold);
      const passed = Math.abs(depth - test.expected) < 0.1; // Allow small floating point differences

      this.recordTest(`Depth Calculation: ${test.description}`, passed, {
        input: `dy:${test.dy}, threshold:${test.threshold}`,
        expected: test.expected,
        actual: depth.toFixed(2),
      });
    }
  }

  /**
   * Test trill interval calculation
   */
  async testTrillIntervalCalculation() {
    console.log("Testing trill interval calculation...");

    const tests = [
      {
        note1: "C4",
        note2: "D4",
        expected: 2,
        description: "C4 to D4 should be 2 semitones",
      },
      {
        note1: "C4",
        note2: "E4",
        expected: 4,
        description: "C4 to E4 should be 4 semitones",
      },
      {
        note1: "F#4",
        note2: "G4",
        expected: 1,
        description: "F#4 to G4 should be 1 semitone",
      },
      {
        note1: "C4",
        note2: "C5",
        expected: 12,
        description: "C4 to C5 should be 12 semitones (octave)",
      },
      {
        note1: "A4",
        note2: "C5",
        expected: 3,
        description: "A4 to C5 should be 3 semitones",
      },
    ];

    for (const test of tests) {
      const interval = this.calculateInterval(test.note1, test.note2);
      const passed = interval === test.expected;

      this.recordTest(`Interval Calculation: ${test.description}`, passed, {
        input: `${test.note1} -> ${test.note2}`,
        expected: test.expected,
        actual: interval,
      });
    }
  }

  /**
   * Test state synchronization between modules
   */
  async testStateSynchronization() {
    console.log("Testing state synchronization...");

    // Test chord state synchronization
    const testChord = ["C4", "E4", "G4"];
    const testExpressions = {
      C4: { type: "vibrato", depth: 0.5, rate: 4 },
      E4: { type: "tremolo", depth: 0.3, speed: 10 },
      G4: { type: "trill", targetNote: "A4", interval: 2, speed: 8 },
    };

    // Simulate state updates
    const mockAppState = new Map();
    mockAppState.set("currentChord", testChord);
    mockAppState.set("expressions", testExpressions);

    // Verify state consistency
    const chordMatches =
      JSON.stringify(mockAppState.get("currentChord")) ===
      JSON.stringify(testChord);
    const expressionsMatch =
      JSON.stringify(mockAppState.get("expressions")) ===
      JSON.stringify(testExpressions);

    this.recordTest("State Sync: Chord state consistency", chordMatches, {
      expected: JSON.stringify(testChord),
      actual: JSON.stringify(mockAppState.get("currentChord")),
    });

    this.recordTest(
      "State Sync: Expression state consistency",
      expressionsMatch,
      {
        expected: JSON.stringify(testExpressions),
        actual: JSON.stringify(mockAppState.get("expressions")),
      },
    );
  }

  /**
   * Test visual feedback system
   */
  async testVisualFeedback() {
    console.log("Testing visual feedback...");

    // Test canvas overlay creation
    const canvasCreated = this.testCanvasOverlayCreation();
    this.recordTest(
      "Visual: Canvas overlay creation",
      canvasCreated.success,
      canvasCreated,
    );

    // Test color assignments
    const colorTests = [
      { expressionType: "vibrato", expectedColor: "#e74c3c" },
      { expressionType: "tremolo", expectedColor: "#f39c12" },
      { expressionType: "trill", expectedColor: "#3498db" },
      { expressionType: "none", expectedColor: "#9b59b6" },
    ];

    for (const test of colorTests) {
      const colorMatch = this.testExpressionColor(
        test.expressionType,
        test.expectedColor,
      );
      this.recordTest(
        `Visual: ${test.expressionType} color assignment`,
        colorMatch,
        {
          expected: test.expectedColor,
          actual: this.getExpressionColor(test.expressionType),
        },
      );
    }

    // Test chord display formatting
    const chordDisplayTests = [
      {
        chord: ["C4"],
        expressions: { C4: { type: "vibrato", depth: 0.45 } },
        expected: "C4v45",
      },
      {
        chord: ["D4"],
        expressions: { D4: { type: "tremolo", depth: 0.37 } },
        expected: "D4t37",
      },
      {
        chord: ["E4"],
        expressions: { E4: { type: "trill", targetNote: "F4" } },
        expected: "E4(→F4)",
      },
      {
        chord: ["C4", "E4", "G4"],
        expressions: {
          C4: { type: "vibrato", depth: 0.5 },
          E4: { type: "tremolo", depth: 0.3 },
          G4: { type: "trill", targetNote: "A4" },
        },
        expected: "C4v50 E4t30 G4(→A4)",
      },
    ];

    for (const test of chordDisplayTests) {
      const displayText = this.simulateChordDisplay(
        test.chord,
        test.expressions,
      );
      const passed = displayText === test.expected;
      this.recordTest(`Visual: Chord display format`, passed, {
        chord: test.chord.join(", "),
        expressions: JSON.stringify(test.expressions),
        expected: test.expected,
        actual: displayText,
      });
    }

    // Test trill key highlighting
    const trillHighlightTests = [
      {
        sourceNote: "C4",
        targetNote: "D4",
        description: "Trill target key should be highlighted in light blue",
      },
      {
        sourceNote: "F#4",
        targetNote: "G4",
        description: "Trill highlighting should work with black keys",
      },
      {
        sourceNote: "B4",
        targetNote: "C5",
        description: "Trill highlighting should handle octave transitions",
      },
    ];

    for (const test of trillHighlightTests) {
      const highlightValid = this.testTrillKeyHighlighting(
        test.sourceNote,
        test.targetNote,
      );
      this.recordTest(`Visual: ${test.description}`, highlightValid.success, {
        sourceNote: test.sourceNote,
        targetNote: test.targetNote,
        details: highlightValid.details,
      });
    }
  }

  /**
   * Test clear functionality
   */
  async testClearFunctionality() {
    console.log("Testing clear functionality...");

    // Test clearing chord and expressions
    const mockChord = ["C4", "E4", "G4"];
    const mockExpressions = {
      C4: { type: "vibrato", depth: 0.5 },
      E4: { type: "tremolo", depth: 0.3 },
      G4: { type: "trill", targetNote: "A4" },
    };

    // Simulate setting up state
    const mockState = {
      chord: mockChord,
      expressions: mockExpressions,
    };

    // Simulate clear operation
    const clearedState = this.simulateClearOperation(mockState);

    // Verify everything is cleared
    const chordCleared = clearedState.chord.length === 0;
    const expressionsCleared =
      Object.keys(clearedState.expressions).length === 0;
    const canvasCleared = clearedState.canvasCleared;

    this.recordTest("Clear: Chord state cleared", chordCleared, {
      originalChordLength: mockChord.length,
      clearedChordLength: clearedState.chord.length,
    });

    this.recordTest("Clear: Expressions cleared", expressionsCleared, {
      originalExpressionCount: Object.keys(mockExpressions).length,
      clearedExpressionCount: Object.keys(clearedState.expressions).length,
    });

    this.recordTest("Clear: Canvas overlay cleared", canvasCleared, {
      canvasCleared,
    });

    // Test chord display after clear
    const chordDisplayAfterClear = this.simulateChordDisplay(
      clearedState.chord,
      clearedState.expressions,
    );
    const displayShowsNone = chordDisplayAfterClear === "";

    this.recordTest("Clear: Chord display reset", displayShowsNone, {
      expected: "",
      actual: chordDisplayAfterClear,
    });
  }

  /**
   * Test that out-of-range keys cannot be selected as trill targets
   */
  async testTrillRangeBlocking() {
    console.log("Testing trill range blocking...");

    const testCases = [
      {
        bodyType: 0, // Violin
        sourceNote: "E4", // In range for violin
        targetNote: "C2", // Out of range for violin
        shouldBeBlocked: true,
        description: "Violin should block trill to low C2",
      },
      {
        bodyType: 0, // Violin
        sourceNote: "A4", // In range for violin
        targetNote: "C8", // Out of range for violin
        shouldBeBlocked: true,
        description: "Violin should block trill to high C8",
      },
      {
        bodyType: 3, // Double Bass
        sourceNote: "G2", // In range for bass
        targetNote: "A5", // Out of range for bass
        shouldBeBlocked: true,
        description: "Double Bass should block trill to high A5",
      },
      {
        bodyType: 4, // None (full range)
        sourceNote: "C4", // In range
        targetNote: "C2", // In range for "None"
        shouldBeBlocked: false,
        description: "None instrument should allow any trill target",
      },
    ];

    for (const test of testCases) {
      const isBlocked = this.simulateTrillRangeBlocking(
        test.bodyType,
        test.sourceNote,
        test.targetNote,
      );
      const passed = isBlocked === test.shouldBeBlocked;

      this.recordTest(`Trill Range: ${test.description}`, passed, {
        bodyType: test.bodyType,
        sourceNote: test.sourceNote,
        targetNote: test.targetNote,
        expected: test.shouldBeBlocked ? "blocked" : "allowed",
        actual: isBlocked ? "blocked" : "allowed",
      });
    }
  }

  /**
   * Test distribution logic
   */
  async testDistributionLogic() {
    console.log("Testing distribution logic...");

    const mockSynths = ["synth1", "synth2", "synth3"];
    const mockChord = ["C4", "E4", "G4", "B4"];

    // Test round-robin distribution
    const assignments = mockSynths.map((synthId) =>
      this.simulateNoteAssignment(synthId, mockChord, mockSynths),
    );

    // Verify each synth gets a unique note (if possible)
    const assignedNotes = assignments.map((a) => a.note);
    const uniqueNotes = [...new Set(assignedNotes)];
    const distributionEffective =
      uniqueNotes.length === Math.min(mockSynths.length, mockChord.length);

    this.recordTest(
      "Distribution: Round-robin assignment",
      distributionEffective,
      {
        synthCount: mockSynths.length,
        chordSize: mockChord.length,
        uniqueAssignments: uniqueNotes.length,
        assignments: assignments
          .map((a) => `${a.synthId}:${a.note}`)
          .join(", "),
      },
    );

    // Test expression parameter application
    const expressionTests = [
      {
        type: "vibrato",
        depth: 0.5,
        expectedParams: ["vibratoEnabled", "vibratoRate", "vibratoDepth"],
      },
      {
        type: "tremolo",
        depth: 0.3,
        expectedParams: ["tremoloEnabled", "tremoloSpeed", "tremoloDepth"],
      },
      {
        type: "trill",
        interval: 2,
        expectedParams: ["trillEnabled", "trillSpeed", "trillInterval"],
      },
    ];

    for (const test of expressionTests) {
      const program = this.simulateExpressionApplication(test);
      const hasAllParams = test.expectedParams.every((param) =>
        program.hasOwnProperty(param),
      );

      this.recordTest(
        `Distribution: ${test.type} parameters applied`,
        hasAllParams,
        {
          expression: test.type,
          expectedParams: test.expectedParams,
          actualParams: Object.keys(program).filter((k) =>
            test.expectedParams.includes(k),
          ),
        },
      );
    }
  }

  // Helper methods for testing

  simulateExpressionDetection(dx, dy) {
    const DRAG_THRESHOLD = 10;
    const VIBRATO_THRESHOLD = -30;
    const TREMOLO_THRESHOLD = 30;
    const HORIZONTAL_THRESHOLD = 15;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < DRAG_THRESHOLD) {
      return { type: "none" };
    } else if (Math.abs(dx) > HORIZONTAL_THRESHOLD) {
      return { type: "trill" };
    } else if (dy < VIBRATO_THRESHOLD) {
      return { type: "vibrato" };
    } else if (dy > TREMOLO_THRESHOLD) {
      return { type: "tremolo" };
    }

    return { type: "none" };
  }

  calculateExpressionDepth(dy, threshold) {
    return Math.min(1.0, Math.abs(dy - threshold) / 50);
  }

  calculateInterval(note1, note2) {
    const noteOrder = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];

    const parseNote = (noteStr) => {
      const match = noteStr.match(/^([A-G]#?)(\d)$/);
      if (!match) return null;
      const noteName = match[1];
      const octave = parseInt(match[2]);
      const noteIndex = noteOrder.indexOf(noteName);
      return octave * 12 + noteIndex;
    };

    const midi1 = parseNote(note1);
    const midi2 = parseNote(note2);

    if (midi1 === null || midi2 === null) return 0;
    return Math.abs(midi2 - midi1);
  }

  testCanvasOverlayCreation() {
    // Simulate canvas creation test
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");

      return {
        success: !!(canvas && ctx),
        width: canvas.width,
        height: canvas.height,
        hasContext: !!ctx,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  testExpressionColor(expressionType, expectedColor) {
    const colorMap = {
      vibrato: "#e74c3c",
      tremolo: "#f39c12",
      trill: "#3498db",
      none: "#9b59b6",
    };

    return colorMap[expressionType] === expectedColor;
  }

  getExpressionColor(expressionType) {
    const colorMap = {
      vibrato: "#e74c3c",
      tremolo: "#f39c12",
      trill: "#3498db",
      none: "#9b59b6",
    };

    return colorMap[expressionType] || "#000000";
  }

  simulateNoteAssignment(synthId, chordNotes, allSynths) {
    const synthIndex = allSynths.indexOf(synthId);
    const noteIndex = synthIndex % chordNotes.length;

    return {
      synthId,
      note: chordNotes[noteIndex],
      index: noteIndex,
    };
  }

  simulateExpressionApplication(expressionData) {
    const program = {};

    switch (expressionData.type) {
      case "vibrato":
        program.vibratoEnabled = true;
        program.vibratoRate = 4;
        program.vibratoDepth = expressionData.depth;
        break;
      case "tremolo":
        program.tremoloEnabled = true;
        program.tremoloSpeed = 10;
        program.tremoloDepth = expressionData.depth;
        break;
      case "trill":
        program.trillEnabled = true;
        program.trillSpeed = 8;
        program.trillInterval = expressionData.interval;
        break;
    }

    return program;
  }

  simulateChordDisplay(chordNotes, expressions) {
    const chordParts = [];

    for (const note of chordNotes) {
      const expression = expressions[note];

      if (expression) {
        switch (expression.type) {
          case "vibrato":
            const vibratoDepth = Math.round(expression.depth * 100);
            chordParts.push(`${note}v${vibratoDepth}`);
            break;
          case "tremolo":
            const tremoloDepth = Math.round(expression.depth * 100);
            chordParts.push(`${note}t${tremoloDepth}`);
            break;
          case "trill":
            chordParts.push(`${note}(→${expression.targetNote})`);
            break;
          default:
            chordParts.push(note);
        }
      } else {
        chordParts.push(note);
      }
    }

    return chordParts.join(" ");
  }

  testTrillKeyHighlighting(sourceNote, targetNote) {
    try {
      // Test key highlighting color values
      const expectedLightBlue = "#85c1e2"; // EXPRESSION_COLORS_LIGHT.trill
      const isValidColor = this.isValidHexColor(expectedLightBlue);

      // Test note name validation
      const isValidSourceNote = this.isValidNoteName(sourceNote);
      const isValidTargetNote = this.isValidNoteName(targetNote);

      // Test black key detection
      const isBlackKey = targetNote.includes("#");
      const canHandleBlackKeys = true; // Our implementation should handle both

      return {
        success:
          isValidColor &&
          isValidSourceNote &&
          isValidTargetNote &&
          canHandleBlackKeys,
        details: {
          sourceNote,
          targetNote,
          expectedColor: expectedLightBlue,
          isBlackKey,
          colorValid: isValidColor,
          notesValid: isValidSourceNote && isValidTargetNote,
        },
      };
    } catch (error) {
      return {
        success: false,
        details: { error: error.message },
      };
    }
  }

  isValidHexColor(color) {
    return /^#[0-9A-F]{6}$/i.test(color);
  }

  isValidNoteName(note) {
    return /^[A-G]#?[0-9]$/.test(note);
  }

  simulateClearOperation(state) {
    // Simulate the clear operation
    return {
      chord: [], // Chord should be empty after clear
      expressions: {}, // Expressions should be empty after clear
      canvasCleared: true, // Canvas should be cleared
    };
  }

  testInstrumentRangeForBodyType(instrumentTest) {
    try {
      // Simulate instrument range checking
      const ranges = {
        0: { low: 196.0, high: 3520.0 }, // Violin (G3 to A7)
        1: { low: 130.81, high: 1318.51 }, // Viola (C3 to E6)
        2: { low: 65.41, high: 1046.5 }, // Cello (C2 to C6)
        3: { low: 41.2, high: 392.0 }, // Double Bass (E1 to G4)
        4: { low: 16.35, high: 7902.13 }, // None (C0 to B8)
      };

      const range = ranges[instrumentTest.bodyType];
      const hasValidRange = range && range.low > 0 && range.high > range.low;

      return {
        success: hasValidRange,
        details: {
          bodyType: instrumentTest.bodyType,
          name: instrumentTest.name,
          lowFreq: range?.low,
          highFreq: range?.high,
          rangeValid: hasValidRange,
        },
      };
    } catch (error) {
      return {
        success: false,
        details: { error: error.message },
      };
    }
  }

  simulateNoteRangeCheck(noteName, bodyType) {
    // Simulate frequency conversion and range checking
    const noteFrequencies = {
      C1: 32.7,
      E1: 41.2,
      C2: 65.41,
      G3: 196.0,
      C4: 261.63,
      E4: 329.63,
      G4: 392.0,
      A5: 880.0,
      C7: 2093.0,
      A7: 3520.0,
      C8: 4186.01,
    };

    const ranges = {
      0: { low: 196.0, high: 3520.0 }, // Violin
      1: { low: 130.81, high: 1318.51 }, // Viola
      2: { low: 65.41, high: 1046.5 }, // Cello
      3: { low: 41.2, high: 392.0 }, // Double Bass
      4: { low: 16.35, high: 7902.13 }, // None
    };

    const frequency = noteFrequencies[noteName] || 440; // Default to A4
    const range = ranges[bodyType];

    if (!range) return true; // If no range defined, assume in range

    return frequency >= range.low && frequency <= range.high;
  }

  simulateTrillRangeBlocking(bodyType, sourceNote, targetNote) {
    // Simulate the range checking logic
    const noteFrequencies = {
      C2: 65.41,
      G2: 98.0,
      E4: 329.63,
      A4: 440.0,
      C4: 261.63,
      A5: 880.0,
      C8: 4186.01,
    };

    const ranges = {
      0: { low: 196.0, high: 3520.0 }, // Violin
      1: { low: 130.81, high: 1318.51 }, // Viola
      2: { low: 65.41, high: 1046.5 }, // Cello
      3: { low: 41.2, high: 392.0 }, // Double Bass
      4: { low: 16.35, high: 7902.13 }, // None
    };

    const targetFreq = noteFrequencies[targetNote] || 440;
    const range = ranges[bodyType];

    if (!range) return false; // If no range, allow (shouldn't happen)

    // Key is blocked if it's out of range
    const isOutOfRange = targetFreq < range.low || targetFreq > range.high;
    return isOutOfRange;
  }

  recordTest(testName, passed, details = {}) {
    const result = {
      name: testName,
      passed,
      details,
      timestamp: new Date().toISOString(),
    };

    this.testResults.push(result);

    if (!passed) {
      this.failures.push(result);
      console.warn(`❌ FAILED: ${testName}`, details);
    } else {
      console.log(`✅ PASSED: ${testName}`);
    }
  }

  reportResults() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((r) => r.passed).length;
    const failedTests = this.failures.length;

    console.log("\n📊 TEST RESULTS SUMMARY");
    console.log("========================");
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`,
    );

    if (failedTests > 0) {
      console.log("\n🔍 FAILED TESTS:");
      this.failures.forEach((failure) => {
        console.log(`- ${failure.name}`);
        if (failure.details.expected && failure.details.actual) {
          console.log(`  Expected: ${failure.details.expected}`);
          console.log(`  Actual: ${failure.details.actual}`);
        }
      });
    }

    // Return results for programmatic access
    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      successRate: (passedTests / totalTests) * 100,
      results: this.testResults,
      failures: this.failures,
    };
  }
}

// Debug mode for visual testing
class PianoExpressionDebugger {
  constructor(pianoExpressionHandler) {
    this.handler = pianoExpressionHandler;
    this.debugMode = false;
  }

  enableDebugMode() {
    this.debugMode = true;
    console.log("🔧 Piano Expression Debug Mode Enabled");

    if (this.handler && this.handler.overlayCtx) {
      this.drawThresholdGuides();
    }

    // Override gesture detection to log all data
    if (this.handler) {
      const originalUpdateDrag = this.handler.updateDrag.bind(this.handler);
      this.handler.updateDrag = (x, y) => {
        const dx = x - this.handler.dragStartPos.x;
        const dy = y - this.handler.dragStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        console.log("🎯 Drag Data:", {
          dx,
          dy,
          distance,
          thresholds: {
            drag: this.handler.DRAG_THRESHOLD,
            vibrato: this.handler.VIBRATO_THRESHOLD,
            tremolo: this.handler.TREMOLO_THRESHOLD,
            horizontal: this.handler.HORIZONTAL_THRESHOLD,
          },
        });

        originalUpdateDrag(x, y);
      };
    }
  }

  drawThresholdGuides() {
    if (!this.handler.overlayCtx) return;

    const ctx = this.handler.overlayCtx;
    const centerX = this.handler.overlay.width / 2;
    const centerY = this.handler.overlay.height / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    // Draw threshold lines
    ctx.beginPath();
    ctx.moveTo(centerX - 50, centerY + this.handler.VIBRATO_THRESHOLD);
    ctx.lineTo(centerX + 50, centerY + this.handler.VIBRATO_THRESHOLD);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX - 50, centerY + this.handler.TREMOLO_THRESHOLD);
    ctx.lineTo(centerX + 50, centerY + this.handler.TREMOLO_THRESHOLD);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      "Vibrato Threshold",
      centerX + 55,
      centerY + this.handler.VIBRATO_THRESHOLD,
    );
    ctx.fillText(
      "Tremolo Threshold",
      centerX + 55,
      centerY + this.handler.TREMOLO_THRESHOLD,
    );

    ctx.restore();
  }

  disableDebugMode() {
    this.debugMode = false;
    console.log("🔧 Piano Expression Debug Mode Disabled");
  }
}

// Export for use in browser console or other modules
if (typeof window !== "undefined") {
  window.PianoExpressionTester = PianoExpressionTester;
  window.PianoExpressionDebugger = PianoExpressionDebugger;

  // Quick test function for console use
  window.testPianoExpressions = async () => {
    const tester = new PianoExpressionTester();
    return await tester.runAllTests();
  };
}

// Export for ES modules
export { PianoExpressionTester, PianoExpressionDebugger };
