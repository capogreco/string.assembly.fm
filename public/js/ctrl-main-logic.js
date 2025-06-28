import { ArrangementManager } from './modules/controller/ArrangementManager.js';

// Legacy compatibility functions for inline code
            function note_to_frequency(noteName) {
                if (window.modular && window.modular.AudioUtilities) {
                    return window.modular.AudioUtilities.noteNameToFrequency(
                        noteName,
                    );
                }
                // Fallback if modular system not available
                const noteRegex = /^([A-G]#?)(\d+)$/;
                const match = noteName.match(noteRegex);
                if (!match) return 440; // Fallback to A4

                const [, note, octaveStr] = match;
                const octave = parseInt(octaveStr);

                const noteMap = {
                    C: 0,
                    "C#": 1,
                    D: 2,
                    "D#": 3,
                    E: 4,
                    F: 5,
                    "F#": 6,
                    G: 7,
                    "G#": 8,
                    A: 9,
                    "A#": 10,
                    B: 11,
                };

                const midiNote = (octave + 1) * 12 + noteMap[note];
                return 440 * Math.pow(2, (midiNote - 69) / 12);
            }

            // currentChord is already declared and initialized to [].
            // svgExpression is already declared as null.

            // Helper function to convert frequency to note data
            function frequencyToNote(freq) {
                const A4 = 440;
                const C0 = A4 * Math.pow(2, -4.75);

                const h = 12 * (Math.log(freq / C0) / Math.log(2));
                const octave = Math.floor(h / 12);
                const noteIndex = Math.round(h % 12);

                const noteNames = [
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
                return {
                    note: noteNames[noteIndex],
                    octave: octave,
                };
            }

            // Bridge functions to connect legacy calls to modular system
            function mark_parameter_changed(param_id) {
                console.log(`mark_parameter_changed called with: ${param_id}`);
                if (window.modular && window.modular.ParameterControls) {
                    window.modular.ParameterControls.markParameterChanged(
                        param_id,
                    );
                } else if (window.modular && window.modular.AppState) {
                    window.modular.AppState.markParameterChanged(param_id);
                }
            }

            function check_overall_status() {
                console.log("check_overall_status called");
                if (window.modular && window.modular.UIManager) {
                    window.modular.UIManager.updateConnectionStatus();
                }
            }

            // SVGInteractiveExpression initialization disabled
            // The modular PianoKeyboard now handles expressions internally
            // via PianoExpressionHandler

            // Keep the expression change handler for backward compatibility
            // but it won't be called anymore

            function handleExpressionChange(note, expression) {
                console.log("Expression changed:", note, expression);

                // Update current chord if needed
                if (window.svgExpression) {
                    const chordNotes = window.svgExpression.getChordNotes();
                    window.currentChord = chordNotes.sort((a, b) => {
                        const freqA = note_to_frequency(a);
                        const freqB = note_to_frequency(b);
                        return freqA - freqB;
                    });

                    console.log(
                        "Updated chord from expression system:",
                        window.currentChord,
                    );

                    // Sync to modular system
                    if (window.modular && window.modular.AppState) {
                        // Convert note names to frequencies
                        const frequencies = window.currentChord.map(
                            (noteName) => note_to_frequency(noteName),
                        );
                        window.modular.AppState.set(
                            "currentChord",
                            frequencies,
                        );

                        // Emit chord change event through modular system
                        if (window.modular.EventBus) {
                            window.modular.EventBus.emit("piano:chordChanged", {
                                chord: frequencies,
                                noteNames: window.currentChord,
                                timestamp: Date.now(),
                            });
                        }
                    }

                    // Update chord display immediately
                    const chordDisplay =
                        document.getElementById("chord-display");
                    if (chordDisplay) {
                        if (window.currentChord.length > 0) {
                            const expressions =
                                window.svgExpression.getAllExpressions();
                            const chordParts = [];

                            // Filter out notes that are only trill targets
                            const actualChordNotes = window.currentChord.filter(
                                (note) => {
                                    const expr = expressions[note];
                                    if (!expr || expr.type === "none") {
                                        // Check if this note is a trill target
                                        for (const [
                                            otherNote,
                                            otherExpr,
                                        ] of Object.entries(expressions)) {
                                            if (
                                                otherExpr.type === "trill" &&
                                                otherExpr.targetNote === note
                                            ) {
                                                return false;
                                            }
                                        }
                                    }
                                    return true;
                                },
                            );

                            actualChordNotes.forEach((note) => {
                                const expr = expressions[note];
                                if (
                                    expr &&
                                    expr.type === "trill" &&
                                    expr.targetNote
                                ) {
                                    // Show trill with target in brackets
                                    chordParts.push(
                                        `${note} (→${expr.targetNote})`,
                                    );
                                } else {
                                    chordParts.push(note);
                                }
                            });

                            chordDisplay.textContent = chordParts.join(", ");
                        } else {
                            chordDisplay.textContent = "None";
                        }
                    }
                }

                updateExpressionDisplay();
                updateExpressionGroups();

                // Mark chord as changed
                mark_parameter_changed("chord");
                check_overall_status();
            }

            function updateExpressionDisplay() {
                const content = document.getElementById("expression-content");
                const chordDisplay = document.getElementById("chord-display");
                if (!content) return;

                // Update chord display with trill targets in brackets
                if (chordDisplay) {
                    if (window.currentChord && window.currentChord.length > 0) {
                        const expressions = window.svgExpression
                            ? window.svgExpression.getAllExpressions()
                            : {};
                        const chordParts = [];

                        // Filter out notes that are only trill targets
                        const actualChordNotes = window.currentChord.filter(
                            (note) => {
                                const expr = expressions[note];
                                if (!expr || expr.type === "none") {
                                    // Check if this note is a trill target
                                    for (const [
                                        otherNote,
                                        otherExpr,
                                    ] of Object.entries(expressions)) {
                                        if (
                                            otherExpr.type === "trill" &&
                                            otherExpr.targetNote === note
                                        ) {
                                            return false;
                                        }
                                    }
                                }
                                return true;
                            },
                        );

                        actualChordNotes.forEach((note) => {
                            const expr = expressions[note];
                            if (
                                expr &&
                                expr.type === "trill" &&
                                expr.targetNote
                            ) {
                                // Show trill with target in brackets
                                chordParts.push(
                                    `${note} (→${expr.targetNote})`,
                                );
                            } else {
                                chordParts.push(note);
                            }
                        });

                        chordDisplay.textContent = chordParts.join(" ");
                    } else {
                        chordDisplay.textContent = "None";
                    }
                }

                if (!window.svgExpression) {
                    content.innerHTML =
                        '<div style="color: #666; font-style: italic;">Loading expression system...</div>';
                    return;
                }

                const expressions = window.svgExpression.getAllExpressions();
                const activeExpressions = Object.entries(expressions);

                if (activeExpressions.length === 0) {
                    content.innerHTML =
                        '<div style="color: #666; font-style: italic;">Click piano keys to add notes to chord</div>';
                    return;
                }

                // Group notes by trill relationships
                const processedNotes = new Set();
                const displayItems = [];

                activeExpressions.forEach(([note, expression]) => {
                    if (processedNotes.has(note)) return;

                    let exprText = "";
                    let className = "note-expression";

                    switch (expression.type) {
                        case "vibrato":
                            exprText = `${note}: Vibrato (depth: ${(expression.depth * 100).toFixed(0)}%)`;
                            className += " vibrato";
                            break;
                        case "tremolo":
                            exprText = `${note}: Tremolo (depth: ${(expression.depth * 100).toFixed(0)}%)`;
                            className += " tremolo";
                            break;
                        case "trill":
                            exprText = `${note}: Trill`;
                            className += " trill";
                            // Add trill target in brackets with styled arrow
                            if (expression.targetNote) {
                                exprText += ` <span style="opacity: 0.7; font-size: 0.9em;">(→ ${expression.targetNote})</span>`;
                                processedNotes.add(expression.targetNote);
                            }
                            break;
                        default:
                            // Check if this note is a trill target for another note
                            let isTrillTarget = false;
                            for (const [
                                otherNote,
                                otherExpr,
                            ] of activeExpressions) {
                                if (
                                    otherExpr.type === "trill" &&
                                    otherExpr.targetNote === note
                                ) {
                                    isTrillTarget = true;
                                    break;
                                }
                            }
                            break;
                    }
                });
            }