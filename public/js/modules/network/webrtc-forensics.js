/**
 * WebRTC Forensics Module
 *
 * This module provides detailed logging for WebRTC connections to help identify
 * differences between working (cicada) and failing (string) implementations.
 *
 * Usage:
 * - Include this script in both ctrl.html files
 * - It will automatically instrument WebRTC connections with detailed logging
 * - Compare logs side-by-side to find divergence points
 */

(function() {
  const FORENSICS_VERSION = '1.0.0';
  const IMPLEMENTATION = window.location.hostname.includes('cicada') ? 'CICADA' : 'STRING';

  // Timing tracking
  const timings = new Map();
  const eventSequence = [];
  let sequenceCounter = 0;

  // Helper to format timestamps
  function timestamp() {
    const now = new Date();
    return `${now.toISOString().split('T')[1].slice(0, -1)}`;
  }

  // Helper to log with consistent format
  function forensicLog(event, details = {}) {
    sequenceCounter++;
    const logEntry = {
      seq: sequenceCounter,
      time: timestamp(),
      impl: IMPLEMENTATION,
      event: event,
      ...details
    };

    eventSequence.push(logEntry);

    // Color-coded console output
    const color = IMPLEMENTATION === 'CICADA' ? '#00aa00' : '#0088ff';
    console.log(
      `%c[${IMPLEMENTATION}:${sequenceCounter}] ${timestamp()} - ${event}`,
      `color: ${color}; font-weight: bold;`,
      details
    );
  }

  // Export forensics data
  window.exportForensics = function() {
    return {
      implementation: IMPLEMENTATION,
      version: FORENSICS_VERSION,
      events: eventSequence,
      summary: generateSummary()
    };
  };

  // Generate summary of key events
  function generateSummary() {
    const summary = {
      totalEvents: eventSequence.length,
      dataChannelEvents: eventSequence.filter(e => e.event.includes('datachannel')).length,
      iceEvents: eventSequence.filter(e => e.event.includes('ice')).length,
      stateChanges: eventSequence.filter(e => e.event.includes('state')).length
    };

    // Find key milestones
    const milestones = ['offer_received', 'answer_sent', 'datachannel_received', 'datachannel_open'];
    summary.milestones = {};

    milestones.forEach(milestone => {
      const event = eventSequence.find(e => e.event === milestone);
      summary.milestones[milestone] = event ? event.seq : 'NOT_REACHED';
    });

    return summary;
  }

  // Instrument RTCPeerConnection
  const OriginalRTCPeerConnection = window.RTCPeerConnection;

  window.RTCPeerConnection = function(config) {
    forensicLog('rtc_constructor', {
      config: JSON.stringify(config),
      hasIceServers: !!(config && config.iceServers && config.iceServers.length > 0),
      iceServerCount: config && config.iceServers ? config.iceServers.length : 0
    });

    const pc = new OriginalRTCPeerConnection(config);
    const pcId = Math.random().toString(36).substr(2, 9);

    // Track this peer connection
    timings.set(pcId, {
      created: Date.now(),
      events: []
    });

    // Instrument setRemoteDescription
    const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc);
    pc.setRemoteDescription = async function(desc) {
      forensicLog('setRemoteDescription_start', {
        pcId,
        type: desc.type,
        signalingStateBefore: pc.signalingState
      });

      try {
        const result = await originalSetRemoteDescription(desc);
        forensicLog('setRemoteDescription_success', {
          pcId,
          signalingStateAfter: pc.signalingState
        });
        return result;
      } catch (error) {
        forensicLog('setRemoteDescription_error', {
          pcId,
          error: error.message
        });
        throw error;
      }
    };

    // Instrument setLocalDescription
    const originalSetLocalDescription = pc.setLocalDescription.bind(pc);
    pc.setLocalDescription = async function(desc) {
      forensicLog('setLocalDescription_start', {
        pcId,
        type: desc.type,
        signalingStateBefore: pc.signalingState
      });

      try {
        const result = await originalSetLocalDescription(desc);
        forensicLog('setLocalDescription_success', {
          pcId,
          signalingStateAfter: pc.signalingState
        });
        return result;
      } catch (error) {
        forensicLog('setLocalDescription_error', {
          pcId,
          error: error.message
        });
        throw error;
      }
    };

    // Instrument createAnswer
    const originalCreateAnswer = pc.createAnswer.bind(pc);
    pc.createAnswer = async function(options) {
      forensicLog('createAnswer_start', {
        pcId,
        signalingState: pc.signalingState
      });

      try {
        const answer = await originalCreateAnswer(options);
        forensicLog('createAnswer_success', {
          pcId,
          sdpLength: answer.sdp ? answer.sdp.length : 0
        });
        return answer;
      } catch (error) {
        forensicLog('createAnswer_error', {
          pcId,
          error: error.message
        });
        throw error;
      }
    };

    // Instrument addIceCandidate
    const originalAddIceCandidate = pc.addIceCandidate.bind(pc);
    pc.addIceCandidate = async function(candidate) {
      const candidateInfo = candidate ? {
        type: candidate.candidate ? candidate.candidate.split(' ')[7] : 'unknown',
        foundation: candidate.candidate ? candidate.candidate.split(' ')[0] : 'unknown'
      } : { type: 'end-of-candidates' };

      forensicLog('addIceCandidate_start', {
        pcId,
        ...candidateInfo,
        iceConnectionState: pc.iceConnectionState
      });

      try {
        const result = await originalAddIceCandidate(candidate);
        forensicLog('addIceCandidate_success', {
          pcId,
          ...candidateInfo
        });
        return result;
      } catch (error) {
        forensicLog('addIceCandidate_error', {
          pcId,
          error: error.message,
          ...candidateInfo
        });
        throw error;
      }
    };

    // Track event listeners
    const originalAddEventListener = pc.addEventListener.bind(pc);
    pc.addEventListener = function(event, handler) {
      forensicLog('addEventListener', {
        pcId,
        event
      });

      if (event === 'datachannel') {
        // Wrap datachannel handler
        const wrappedHandler = function(e) {
          forensicLog('datachannel_event_fired', {
            pcId,
            channelLabel: e.channel.label,
            channelId: e.channel.id,
            channelProtocol: e.channel.protocol,
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState
          });

          // Instrument the data channel
          instrumentDataChannel(e.channel, pcId);

          return handler.call(this, e);
        };
        return originalAddEventListener(event, wrappedHandler);
      }

      if (event === 'icecandidate') {
        const wrappedHandler = function(e) {
          const candidateInfo = e.candidate ? {
            type: e.candidate.candidate.split(' ')[7],
            foundation: e.candidate.candidate.split(' ')[0],
            component: e.candidate.candidate.split(' ')[1],
            protocol: e.candidate.candidate.split(' ')[2],
            priority: e.candidate.candidate.split(' ')[3]
          } : { type: 'end-of-candidates' };

          forensicLog('icecandidate_generated', {
            pcId,
            ...candidateInfo
          });

          return handler.call(this, e);
        };
        return originalAddEventListener(event, wrappedHandler);
      }

      if (event === 'connectionstatechange') {
        const wrappedHandler = function(e) {
          forensicLog('connectionstatechange', {
            pcId,
            state: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState
          });
          return handler.call(this, e);
        };
        return originalAddEventListener(event, wrappedHandler);
      }

      if (event === 'iceconnectionstatechange') {
        const wrappedHandler = function(e) {
          forensicLog('iceconnectionstatechange', {
            pcId,
            state: pc.iceConnectionState,
            connectionState: pc.connectionState
          });
          return handler.call(this, e);
        };
        return originalAddEventListener(event, wrappedHandler);
      }

      return originalAddEventListener(event, handler);
    };

    return pc;
  };

  // Instrument DataChannel
  function instrumentDataChannel(channel, pcId) {
    forensicLog('datachannel_instrumented', {
      pcId,
      label: channel.label,
      readyState: channel.readyState
    });

    channel.addEventListener('open', () => {
      forensicLog('datachannel_open', {
        pcId,
        label: channel.label
      });
    });

    channel.addEventListener('close', () => {
      forensicLog('datachannel_close', {
        pcId,
        label: channel.label
      });
    });

    channel.addEventListener('error', (e) => {
      forensicLog('datachannel_error', {
        pcId,
        label: channel.label,
        error: e.error ? e.error.message : 'unknown'
      });
    });

    channel.addEventListener('message', (e) => {
      let messageInfo = { raw: true };
      try {
        const data = JSON.parse(e.data);
        messageInfo = {
          type: data.type,
          hasTimestamp: !!data.timestamp
        };
      } catch {}

      forensicLog('datachannel_message', {
        pcId,
        label: channel.label,
        ...messageInfo
      });
    });
  }

  // Instrument WebSocket messages
  if (window.WebSocket) {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url) {
      forensicLog('websocket_created', { url });

      const ws = new OriginalWebSocket(url);

      ws.addEventListener('message', function(e) {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice') {
            forensicLog(`websocket_${data.type}_received`, {
              source: data.source,
              target: data.target,
              hasData: !!data.data
            });
          }
        } catch {}
      });

      return ws;
    };
  }

  // Add comparison helper
  window.compareForensics = function(otherWindow) {
    if (!otherWindow || !otherWindow.exportForensics) {
      console.error('Other window must have forensics loaded');
      return;
    }

    const ourData = window.exportForensics();
    const theirData = otherWindow.exportForensics();

    console.log('=== FORENSICS COMPARISON ===');
    console.log(`${ourData.implementation} events: ${ourData.events.length}`);
    console.log(`${theirData.implementation} events: ${theirData.events.length}`);

    // Find divergence point
    let divergencePoint = -1;
    const minLength = Math.min(ourData.events.length, theirData.events.length);

    for (let i = 0; i < minLength; i++) {
      if (ourData.events[i].event !== theirData.events[i].event) {
        divergencePoint = i;
        break;
      }
    }

    if (divergencePoint >= 0) {
      console.log(`\n🔴 DIVERGENCE at event ${divergencePoint}:`);
      console.log(`${ourData.implementation}: ${ourData.events[divergencePoint].event}`);
      console.log(`${theirData.implementation}: ${theirData.events[divergencePoint].event}`);

      // Show context
      console.log('\nContext (5 events before divergence):');
      for (let i = Math.max(0, divergencePoint - 5); i < divergencePoint; i++) {
        console.log(`  [${i}] BOTH: ${ourData.events[i].event}`);
      }
    } else {
      console.log('\n✅ No divergence in common events');
      if (ourData.events.length !== theirData.events.length) {
        console.log(`But ${ourData.implementation} has ${Math.abs(ourData.events.length - theirData.events.length)} ${ourData.events.length > theirData.events.length ? 'more' : 'fewer'} events`);
      }
    }

    // Compare milestones
    console.log('\n=== MILESTONE COMPARISON ===');
    const allMilestones = new Set([
      ...Object.keys(ourData.summary.milestones),
      ...Object.keys(theirData.summary.milestones)
    ]);

    allMilestones.forEach(milestone => {
      const ourMilestone = ourData.summary.milestones[milestone];
      const theirMilestone = theirData.summary.milestones[milestone];
      const symbol = ourMilestone === theirMilestone ? '✅' : '🔴';
      console.log(`${symbol} ${milestone}: ${ourData.implementation}=${ourMilestone}, ${theirData.implementation}=${theirMilestone}`);
    });
  };

  forensicLog('forensics_initialized', { version: FORENSICS_VERSION });
})();
