// Script to fix transition timing in ctrl.html

const fs = require('fs');

// Read the file
let content = fs.readFileSync('ctrl.html', 'utf8');

// Fix 1: Add transition to first assignNoteToSynth call (line ~1508)
content = content.replace(
    /channel\.send\(\s*JSON\.stringify\(\{\s*type:\s*"program",\s*program:\s*assignment\.program,\s*\}\),\s*\);/g,
    `channel.send(
                                    JSON.stringify({
                                        type: "program",
                                        program: assignment.program,
                                        transition: calculateTransitionTiming(assignment.program, 0),
                                    }),
                                );`
);

// Fix 2: Add transition to second assignNoteToSynth call (line ~1621)
content = content.replace(
    /channel\.send\(\s*JSON\.stringify\(\{\s*type:\s*"program",\s*program:\s*assignment\.program,\s*\}\),\s*\);\s*\/\/\s*Send transition configuration/g,
    `channel.send(
                                        JSON.stringify({
                                            type: "program",
                                            program: assignment.program,
                                            transition: calculateTransitionTiming(assignment.program, 0),
                                        }),
                                    );

                                    // Send transition configuration`
);

// Fix 3: Add transition to default program send (line ~1566)
content = content.replace(
    /channel\.send\(\s*JSON\.stringify\(\{\s*type:\s*"program",\s*program:\s*default_program,\s*\}\),\s*\);/g,
    `channel.send(
                                        JSON.stringify({
                                            type: "program",
                                            program: default_program,
                                            transition: calculateTransitionTiming(default_program, 0),
                                        }),
                                    );`
);

// Fix 4: Update the test ensemble to handle expression transitions correctly
let testContent = fs.readFileSync('test-ensemble.html', 'utf8');

// Add expression transition handling to applyProgram
testContent = testContent.replace(
    /\/\/ Send expression state to worklet[\s\S]*?this\.bowedString\.port\.postMessage\(\{[\s\S]*?\}\);[\s\S]*?\}/,
    `// Send expression state to worklet
                    if (this.bowedString) {
                        let targetExpression = "NONE";
                        if (program.vibratoEnabled)
                            targetExpression = "VIBRATO";
                        else if (program.tremoloEnabled)
                            targetExpression = "TREMOLO";
                        else if (program.trillEnabled)
                            targetExpression = "TRILL";

                        // If transition info is provided, delay the expression change
                        // to sync with parameter transitions
                        const expressionDelay = transition?.lag?.min || 0;

                        if (expressionDelay > 0) {
                            setTimeout(() => {
                                this.bowedString.port.postMessage({
                                    type: "setExpression",
                                    expression: targetExpression,
                                });
                            }, expressionDelay * 1000); // Convert to milliseconds
                        } else {
                            this.bowedString.port.postMessage({
                                type: "setExpression",
                                expression: targetExpression,
                            });
                        }
                    }`
);

// Write the files back
fs.writeFileSync('ctrl.html', content);
fs.writeFileSync('test-ensemble.html', testContent);

console.log('Fixed transition timing in both files!');
console.log('Changes made:');
console.log('1. Added transition timing to all program sends in ctrl.html');
console.log('2. Fixed expression timing to sync with parameter transitions in test-ensemble.html');
