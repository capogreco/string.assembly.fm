# Logging Refactor Plan for String Assembly FM

## Current State
- **Conditional logging system exists** but is underutilized
- Only "debug" messages are filtered by `window.DEBUG_LOGGING`
- 40+ direct `console.log()` calls bypass the system
- Verbose messages with emojis clutter the console

## Proposed Logging Categories

```javascript
window.DEBUG_CONFIG = {
  connections: false,    // WebSocket, WebRTC connections
  messages: false,       // Message passing between peers
  parameters: false,     // Parameter changes
  expressions: false,    // Chord and expression changes
  performance: false,    // Latency, pings
  lifecycle: true,       // Important state changes (default on)
  errors: true          // Always on
};
```

## Refactoring Strategy

### 1. Enhance the Log Function
```javascript
function log(message, category = "lifecycle") {
  // Always show errors
  if (category === "error") {
    console.error(`[${new Date().toLocaleTimeString()}] [ERROR] ${message}`);
    return;
  }
  
  // Check if category is enabled
  if (!window.DEBUG_CONFIG[category]) {
    return;
  }
  
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}] [${category.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}
```

### 2. Console.log Replacements

#### Connection Logs
```javascript
// OLD:
console.log("WebSocket connected");
console.log(`🔗 Param channel open to ${synth_id}`);

// NEW:
log("WebSocket connected", "connections");
log(`Param channel open to ${synth_id}`, "connections");
```

#### Message Logs
```javascript
// OLD:
console.log(`📤 Auto-sending program to newly connected ${synth_id}...`);
console.log(`📞 Received program request from ${synth_id}`);

// NEW:
log(`Auto-sending program to newly connected ${synth_id}`, "messages");
log(`Received program request from ${synth_id}`, "messages");
```

#### Performance Logs
```javascript
// OLD:
console.log(`Received pong from ${synth_id} with state:`, data.state);

// NEW:
log(`Received pong from ${synth_id} with state: ${JSON.stringify(data.state)}`, "performance");
```

#### Parameter Logs
```javascript
// OLD:
console.log("Combined input event fired for", id, "new value:", value);

// NEW:
log(`Parameter ${id} changed to ${value}`, "parameters");
```

## Implementation Steps

### Step 1: Update Log Function (5 minutes)
Replace the current log function with the enhanced version that uses categories.

### Step 2: Automated Replacement Script
```bash
# Create a sed script to replace common patterns
# Note: This is a starting point - manual review required

# Replace connection logs
sed -i 's/console\.log(\(.*[Cc]onnected.*\))/log(\1, "connections")/g' ctrl-main-logic.js
sed -i 's/console\.log(\(.*[Cc]hannel.*\))/log(\1, "connections")/g' ctrl-main-logic.js

# Replace message logs
sed -i 's/console\.log(\(.*[Ss]ent.*\))/log(\1, "messages")/g' ctrl-main-logic.js
sed -i 's/console\.log(\(.*[Rr]eceived.*\))/log(\1, "messages")/g' ctrl-main-logic.js

# Replace error logs
sed -i 's/console\.error(/log(/g' ctrl-main-logic.js
sed -i 's/log(\(.*\))/log(\1, "error")/g' ctrl-main-logic.js

# Remove emoji prefixes (optional)
sed -i 's/log(`[🔗📤📞🎵📦⚙️🚫⚠️✓] */log(`/g' ctrl-main-logic.js
```

### Step 3: Manual Review Categories
After automated replacement, manually review and categorize:

| Pattern | Category |
|---------|----------|
| ICE servers, STUN | connections |
| Pong, ping, latency | performance |
| Program request/send | messages |
| Parameter changes | parameters |
| Chord/expression | expressions |
| Bank save/load | lifecycle |
| Warnings, errors | error |

### Step 4: Add Debug Toggle UI (Optional)
```html
<div id="debug-panel" style="position: fixed; bottom: 10px; right: 10px; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px;">
  <h4>Debug Logging</h4>
  <label><input type="checkbox" data-debug="connections"> Connections</label><br>
  <label><input type="checkbox" data-debug="messages"> Messages</label><br>
  <label><input type="checkbox" data-debug="parameters"> Parameters</label><br>
  <label><input type="checkbox" data-debug="expressions"> Expressions</label><br>
  <label><input type="checkbox" data-debug="performance"> Performance</label>
</div>
```

```javascript
// Add to initialization
document.querySelectorAll('[data-debug]').forEach(checkbox => {
  const category = checkbox.dataset.debug;
  checkbox.checked = window.DEBUG_CONFIG[category];
  checkbox.addEventListener('change', (e) => {
    window.DEBUG_CONFIG[category] = e.target.checked;
    localStorage.setItem('debug-config', JSON.stringify(window.DEBUG_CONFIG));
  });
});

// Load saved debug config
const savedConfig = localStorage.getItem('debug-config');
if (savedConfig) {
  window.DEBUG_CONFIG = { ...window.DEBUG_CONFIG, ...JSON.parse(savedConfig) };
}
```

## Expected Results

### Before (40+ always-on logs):
```
[14:23:45] [CTRL] WebSocket connected
🔗 Param channel open to synth-123
📤 Auto-sending program to newly connected synth-123...
Received pong from synth-123 with state: Object
📞 Received program request from synth-123
🎵 Sent chord-based program to requesting synth-123: C4 (261.6Hz, vibrato)
Combined input event fired for bowSpeed new value: 0.5
```

### After (selective logging):
```
[14:23:45] [LIFECYCLE] Controller initialized
[14:23:46] [LIFECYCLE] Bank 1 loaded successfully
```

With debug enabled:
```
[14:23:45] [CONNECTIONS] WebSocket connected
[14:23:45] [CONNECTIONS] Param channel open to synth-123
[14:23:45] [MESSAGES] Auto-sending program to newly connected synth-123
[14:23:46] [PERFORMANCE] Received pong from synth-123 (latency: 23ms)
```

## Benefits
1. **Production-ready**: Clean console in production
2. **Debugging-friendly**: Easy to enable categories when needed
3. **Performance**: Reduced string concatenation when logs disabled
4. **Maintainable**: Consistent logging patterns
5. **File size**: ~15% reduction in ctrl-main-logic.js

## Time Estimate
- Automated replacement: 30 minutes
- Manual review and categorization: 1 hour
- Testing: 30 minutes
- **Total: 2 hours**