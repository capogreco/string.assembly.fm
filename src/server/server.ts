// minimal deno server with websocket signaling and kv message queuing

// Type definitions
// These interfaces provide compile-time type safety for all messages and data structures.
// Using discriminated unions (type field) allows TypeScript to narrow message types automatically.
interface ConnectionInfo {
  socket: WebSocket;
  actual_id: string | null;
}

interface KVControllerEntry {
  timestamp: number;
  ws_id: string;
}

interface BaseMessage {
  type: string;
  source?: string;
  target?: string;
  sender_id?: string;
  timestamp?: number;
}

interface RegisterMessage extends BaseMessage {
  type: "register";
  client_id: string;
}

interface HeartbeatMessage extends BaseMessage {
  type: "heartbeat";
}

interface RequestControllersMessage extends BaseMessage {
  type: "request-controllers";
}

interface ControllersListMessage extends BaseMessage {
  type: "controllers-list";
  controllers: string[];
}

interface ControllerJoinedMessage extends BaseMessage {
  type: "controller-joined";
  controller_id: string;
}

interface ControllerLeftMessage extends BaseMessage {
  type: "controller-left";
  controller_id: string;
}

interface SignalingMessage extends BaseMessage {
  type: "offer" | "answer" | "ice";
  data: any;
}

interface KickOtherControllersMessage extends BaseMessage {
  type: "kick-other-controllers";
}

interface KickedMessage extends BaseMessage {
  type: "kicked";
  kicked_by: string;
}

type Message =
  | RegisterMessage
  | HeartbeatMessage
  | RequestControllersMessage
  | ControllersListMessage
  | ControllerJoinedMessage
  | ControllerLeftMessage
  | SignalingMessage
  | KickOtherControllersMessage
  | KickedMessage
  | BaseMessage;

interface SynthState {
  audio_enabled: boolean;
  volume: number;
  powered_on: boolean;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface IceServersResponse {
  ice_servers: IceServer[];
}

const kv = await Deno.openKv();
const connections = new Map<string, ConnectionInfo>();

// load env variables
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

// get TURN credentials from Twilio
async function get_turn_credentials(requestSource = "unknown"): Promise<IceServer[] | null> {
  // Log environment variable status with request source
  console.log(`[TURN] ${requestSource} - Environment check - TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING'}`);
  console.log(`[TURN] ${requestSource} - Environment check - TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING'}`);
  
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error(`[TURN] ${requestSource} - Missing Twilio credentials - SID: ${!!TWILIO_ACCOUNT_SID}, Token: ${!!TWILIO_AUTH_TOKEN}`);
    return null;
  }

  try {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Tokens.json`;

    // Log auth header with partial masking for security
    const authMasked = auth.length > 10 ? `${auth.substring(0, 4)}...${auth.substring(auth.length - 4)}` : auth;
    console.log(`[TURN] ${requestSource} - Making request to Twilio API: ${url}`);
    console.log(`[TURN] ${requestSource} - Using auth header (masked): ${authMasked}`);
    console.log(`[TURN] ${requestSource} - SID used in URL: ${TWILIO_ACCOUNT_SID}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(`[TURN] ${requestSource} - Twilio API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TURN] ${requestSource} - Twilio API error - Status: ${response.status}, Response: ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[TURN] ${requestSource} - Successfully fetched ${data.ice_servers?.length || 0} ICE servers from Twilio`);
    return data.ice_servers;
  } catch (error) {
    console.error(`[TURN] ${requestSource} - Error fetching TURN credentials:`, error);
    console.error(`[TURN] ${requestSource} - Error details - Name: ${error.name}, Message: ${error.message}`);
    if (error.stack) {
      console.error(`[TURN] ${requestSource} - Stack trace: ${error.stack}`);
    }
    return null;
  }
}

// serve static files and handle websocket upgrade
async function handle_request(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  // Log every incoming request
  console.log(`[REQUEST] ${request.method} ${url.pathname} - User-Agent: ${request.headers.get("user-agent") || "unknown"}`);
  console.log(`[REQUEST] Full URL: ${url.toString()}`);
  console.log(`[REQUEST] Referer: ${request.headers.get("referer") || "none"}`);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    console.log(`[REQUEST] Handling OPTIONS preflight for ${url.pathname}`);
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400",
      },
    });
  }

  // websocket upgrade
  if (request.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(request);
    const temp_id = crypto.randomUUID();
    let client_id = temp_id;

    socket.addEventListener("open", () => {
      connections.set(temp_id, { socket, actual_id: null } as ConnectionInfo);
    });

    socket.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data);
      console.log(`[WEBSOCKET] Received message from temp_id ${temp_id}:`, data);

      // handle client registration
      if (data.type === "register") {
        const old_id = client_id;
        client_id = data.synth_id || data.client_id || data.id; // Handle synth_id, client_id, and id
        
        console.log(`[WEBSOCKET] Registration attempt - old_id: ${old_id}, new client_id: ${client_id}`);
        console.log(`[WEBSOCKET] Registration message details:`, data);
        
        // Ensure client_id is not undefined
        if (!client_id) {
          console.error(`[WEBSOCKET] Registration failed: missing client_id in message:`, data);
          return;
        }
        
        connections.delete(old_id);
        connections.set(client_id, {
          socket,
          actual_id: client_id,
        } as ConnectionInfo);

        // if this is a controller, add to KV registry
        if (client_id.startsWith("ctrl-")) {
          const key = ["controllers", client_id];
          const value: KVControllerEntry = {
            timestamp: Date.now(),
            ws_id: temp_id,
          };
          await kv.set(key, value, { expireIn: 60 * 1000 }); // 60 second TTL

          // notify all connected synths about the new controller
          const notification: Message = {
            type: "controller-joined",
            controller_id: client_id,
            timestamp: Date.now(),
          };

          for (const [conn_id, conn_info] of connections) {
            if (
              conn_id.startsWith("synth-") &&
              conn_info.socket.readyState === WebSocket.OPEN
            ) {
              conn_info.socket.send(JSON.stringify(notification));
            }
          }
        }

        start_polling_for_client(client_id, socket);
        return;
      }

      // Only handle non-registration messages if client has registered
      if (client_id && client_id !== temp_id) {
        await handle_websocket_message(client_id, event.data);
      } else {
        console.log(`[WEBSOCKET] Ignoring message from unregistered client ${temp_id}:`, data.type);
      }
    });

    socket.addEventListener("close", async () => {
      connections.delete(client_id);

      // Clean up any remaining messages for this client in KV
      if (client_id && client_id !== temp_id) {
        console.log(`[WEBSOCKET] Cleaning up KV messages for disconnected client: ${client_id}`);
        try {
          const entries = kv.list({ prefix: ["messages", client_id] });
          for await (const entry of entries) {
            await kv.delete(entry.key);
          }
        } catch (error) {
          console.error(`[WEBSOCKET] Error cleaning up KV messages for ${client_id}:`, error);
        }
      }

      // if this was a controller, remove from KV registry
      if (client_id && client_id.startsWith("ctrl-")) {
        await kv.delete(["controllers", client_id]);

        // notify all connected synths about the controller leaving
        const notification: Message = {
          type: "controller-left",
          controller_id: client_id,
          timestamp: Date.now(),
        };

        for (const [conn_id, conn_info] of connections) {
          if (
            conn_id.startsWith("synth-") &&
            conn_info.socket.readyState === WebSocket.OPEN
          ) {
            conn_info.socket.send(JSON.stringify(notification));
          }
        }
      }
    });

    return response;
  }

  // handle ice servers request
  if (url.pathname === "/ice-servers") {
    console.log(`[ICE-SERVERS] Handler triggered for main application request`);
    console.log(`[ICE-SERVERS] Request received from ${request.headers.get("user-agent")}`);
    
    try {
      const ice_servers = await get_turn_credentials("main-app");

      if (ice_servers) {
        console.log(`[ICE-SERVERS] Returning ${ice_servers.length} ICE servers from Twilio`);
        const response: IceServersResponse = { ice_servers };
        return new Response(JSON.stringify(response), {
          headers: { 
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type"
          },
        });
      } else {
        console.log(`[ICE-SERVERS] Twilio credentials failed, returning fallback STUN servers`);
        const response: IceServersResponse = { 
          ice_servers: [{ urls: "stun:stun.l.google.com:19302" }] 
        };
        return new Response(JSON.stringify(response), {
          headers: { 
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type"
          },
        });
      }
    } catch (error) {
      console.error(`[ICE-SERVERS] Error processing request:`, error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { 
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        },
      });
    }
  }

  // handle test ice servers request (for debugging v2 test environment)
  if (url.pathname === "/test-ice-servers") {
    console.log(`[TEST-ICE-SERVERS] Handler triggered for test environment request`);
    console.log(`[TEST-ICE-SERVERS] Request received from ${request.headers.get("user-agent")}`);
    
    try {
      const ice_servers = await get_turn_credentials("v2-test");

      if (ice_servers) {
        console.log(`[TEST-ICE-SERVERS] Returning ${ice_servers.length} ICE servers from Twilio`);
        const response: IceServersResponse = { ice_servers };
        return new Response(JSON.stringify(response), {
          headers: { 
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type"
          },
        });
      } else {
        console.log(`[TEST-ICE-SERVERS] Twilio credentials failed, returning fallback STUN servers`);
        const response: IceServersResponse = { 
          ice_servers: [{ urls: "stun:stun.l.google.com:19302" }] 
        };
        return new Response(JSON.stringify(response), {
          headers: { 
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type"
          },
        });
      }
    } catch (error) {
      console.error(`[TEST-ICE-SERVERS] Error processing request:`, error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { 
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        },
      });
    }
  }

  // serve static files
  let fsPathRoot = "./public"; // Base directory for public-facing files
  let requestedPath = url.pathname;

  // Default document and aliases
  if (requestedPath === "/") {
    requestedPath = "/index.html";
  } else if (requestedPath === "/ctrl") {
    // Alias for /ctrl.html
    requestedPath = "/ctrl.html";
  } else if (requestedPath === "/ensemble") {
    // Alias for /ensemble.html
    requestedPath = "/ensemble.html";
  }

  let fullFsPath;

  // If the path starts with /src/, /archive/, or /docs/, serve from project root relative to CWD
  // (assuming CWD is project root)
  if (
    requestedPath.startsWith("/src/") ||
    requestedPath.startsWith("/archive/") ||
    requestedPath.startsWith("/docs/")
  ) {
    fullFsPath = `.${requestedPath}`; // e.g., ./src/worklets/file.js
  } else {
    // For all other assets (HTML, CSS, public JS, icons), serve from ./public
    // Handle favicon based on referer for /dish.ico vs /favicon.ico
    if (requestedPath === "/favicon.ico") {
      const referer = request.headers.get("referer") || "";
      if (
        referer.includes("ctrl.html") ||
        referer.includes("/ctrl") ||
        referer.includes("ensemble.html") ||
        referer.includes("/ensemble")
      ) {
        requestedPath = "/dish.ico"; // dish.ico is also in public/
      }
    }
    fullFsPath = `${fsPathRoot}${requestedPath}`; // e.g., ./public/index.html
  }

  try {
    // console.log(`Attempting to serve: ${fullFsPath} for URL ${url.pathname}`);
    const file = await Deno.readFile(fullFsPath);
    const contentType = requestedPath.endsWith(".html")
      ? "text/html"
      : requestedPath.endsWith(".js")
        ? "application/javascript"
        : requestedPath.endsWith(".ts")
          ? "application/typescript"
          : requestedPath.endsWith(".css")
            ? "text/css"
            : requestedPath.endsWith(".ico")
              ? "image/x-icon"
              : "application/octet-stream"; // Default binary type

    return new Response(file, {
      headers: { "content-type": contentType },
    });
  } catch (e) {
    // console.error(`Failed to read file ${fullFsPath} for ${url.pathname}: ${e.message}`);
    return new Response("not found", { status: 404 });
  }
}

// handle incoming websocket messages and queue them in kv
async function handle_websocket_message(
  sender_id: string,
  data: string,
): Promise<void> {
  try {
    const message: Message = JSON.parse(data);
    message.sender_id = sender_id;
    message.timestamp = Date.now();

    // Ensure sender_id is valid
    if (!sender_id || typeof sender_id !== 'string') {
      console.error(`[WEBSOCKET] Invalid sender_id: ${sender_id}`);
      return;
    }

    // handle heartbeat from controller
    if (message.type === "heartbeat" && sender_id.startsWith("ctrl-")) {
      const key = ["controllers", sender_id];
      const value: KVControllerEntry = {
        timestamp: Date.now(),
        ws_id: connections.get(sender_id)?.actual_id || sender_id,
      };
      await kv.set(key, value, { expireIn: 60 * 1000 }); // refresh 60 second TTL
      return;
    }

    // handle synth requesting controller list
    if (message.type === "request-controllers") {
      const controllers_list = [];
      const entries = kv.list({ prefix: ["controllers"] });

      for await (const entry of entries) {
        const controller_id = entry.key[1] as string;
        const controller_data = entry.value as KVControllerEntry;

        // Check if this controller is still connected
        const is_connected =
          connections.has(controller_id) &&
          connections.get(controller_id)?.socket.readyState === WebSocket.OPEN;

        if (is_connected) {
          controllers_list.push(controller_id);
        } else {
          // Clean up stale KV entry
          await kv.delete(["controllers", controller_id]);
        }
      }

      const response: Message = {
        type: "controllers-list",
        controllers: controllers_list,
        timestamp: Date.now(),
      };

      const client_connection = connections.get(sender_id);
      if (
        client_connection &&
        client_connection.socket.readyState === WebSocket.OPEN
      ) {
        client_connection.socket.send(JSON.stringify(response));
      }
      return;
    }

    // handle controller-to-controller announcements (for multi-controller warning)
    if (message.type === "announce" && message.target === "ctrl-*") {
      // broadcast to all other controllers
      for (const [client_id, client_info] of connections) {
        if (
          client_id.startsWith("ctrl-") &&
          client_id !== sender_id &&
          client_info.socket.readyState === WebSocket.OPEN
        ) {
          client_info.socket.send(JSON.stringify(message));
        }
      }

      // handle kick other controllers
    } else if (
      message.type === "kick-other-controllers" &&
      sender_id.startsWith("ctrl-")
    ) {
      // find and close all other controller connections
      const kicked_controllers = [];
      for (const [client_id, client_info] of connections) {
        if (
          client_id.startsWith("ctrl-") &&
          client_id !== sender_id &&
          client_info.socket.readyState === WebSocket.OPEN
        ) {
          // send kick notification before closing
          const kick_notification = {
            type: "kicked",
            kicked_by: sender_id,
            timestamp: Date.now(),
          };
          client_info.socket.send(JSON.stringify(kick_notification));

          // close the connection
          client_info.socket.close(1000, "Kicked by another controller");
          kicked_controllers.push(client_id);

          // remove from KV registry
          await kv.delete(["controllers", client_id]);
        }
      }

      return;
    } else if (message.target) {
      // queue message in kv with ttl of 30 seconds
      const key = ["messages", message.target, crypto.randomUUID()];
      console.log(`[KV-QUEUE] Queueing ${message.type} from ${sender_id} to ${message.target}`);
      await kv.set(key, message, { expireIn: 30 * 1000 });
    } else {
      console.error(`message missing target: ${JSON.stringify(message)}`);
    }
  } catch (error) {
    console.error(`error handling message: ${error}`);
  }
}

// poll kv for messages destined to this client
async function start_polling_for_client(
  client_id: string,
  socket: WebSocket,
): Promise<void> {
  console.log(`[POLLING] Starting polling for client: ${client_id}`);
  
  while (socket.readyState === WebSocket.OPEN) {
    try {
      // check for messages targeted specifically to this client
      const entries = kv.list({ prefix: ["messages", client_id] });

      for await (const entry of entries) {
        const message = entry.value as Message;

        // Debug logging for message delivery
        console.log(`[POLLING] Delivering message from ${message.sender_id} to ${client_id}: ${message.type}`);

        // send message to client
        socket.send(JSON.stringify(message));

        // delete message after sending
        await kv.delete(entry.key);
      }
    } catch (error) {
      console.error(`[POLLING] Error for client ${client_id}: ${error}`);
    }

    // poll every 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  console.log(`[POLLING] Stopped polling for client: ${client_id} (socket closed)`);
}

// Clean up stale KV entries on startup
async function cleanupKVOnStartup() {
  console.log('[STARTUP] Cleaning up stale KV entries...');
  
  try {
    // Clean up old messages
    const messageEntries = kv.list({ prefix: ["messages"] });
    let messageCount = 0;
    for await (const entry of messageEntries) {
      await kv.delete(entry.key);
      messageCount++;
    }
    console.log(`[STARTUP] Cleaned up ${messageCount} stale message entries`);
    
    // Clean up old controller entries
    const controllerEntries = kv.list({ prefix: ["controllers"] });
    let controllerCount = 0;
    for await (const entry of controllerEntries) {
      await kv.delete(entry.key);
      controllerCount++;
    }
    console.log(`[STARTUP] Cleaned up ${controllerCount} stale controller entries`);
    
  } catch (error) {
    console.error('[STARTUP] Error cleaning up KV entries:', error);
  }
}

// start server
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`server starting on port ${port}`);

// Log startup environment info
console.log(`[STARTUP] Twilio credentials check - SID: ${TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING'}, Token: ${TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING'}`);
console.log(`[STARTUP] Server will serve ICE servers from: ${TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? 'Twilio + fallback STUN' : 'fallback STUN only'}`);

// Clean up stale KV entries before starting
await cleanupKVOnStartup();

Deno.serve({ port }, handle_request);
