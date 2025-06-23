// SDP Comparison and Fixing Tool for WebRTC Data Channel Issues
// This script helps diagnose and potentially fix SDP negotiation problems

class SDPAnalyzer {
  constructor() {
    this.offerSDP = null;
    this.answerSDP = null;
  }

  /**
   * Parse SDP into structured format
   */
  parseSDP(sdp) {
    const lines = sdp.split('\n').map(line => line.trim());
    const parsed = {
      version: null,
      origin: null,
      sessionName: null,
      timing: null,
      media: [],
      globalAttributes: []
    };

    let currentMedia = null;

    for (const line of lines) {
      if (line.startsWith('v=')) {
        parsed.version = line.substring(2);
      } else if (line.startsWith('o=')) {
        parsed.origin = line.substring(2);
      } else if (line.startsWith('s=')) {
        parsed.sessionName = line.substring(2);
      } else if (line.startsWith('t=')) {
        parsed.timing = line.substring(2);
      } else if (line.startsWith('m=')) {
        currentMedia = {
          line: line,
          type: line.split(' ')[0].substring(2),
          port: line.split(' ')[1],
          protocol: line.split(' ')[2],
          formats: line.split(' ').slice(3),
          attributes: [],
          rawIndex: lines.indexOf(line)
        };
        parsed.media.push(currentMedia);
      } else if (line.startsWith('a=')) {
        if (currentMedia) {
          currentMedia.attributes.push(line);
        } else {
          parsed.globalAttributes.push(line);
        }
      }
    }

    return parsed;
  }

  /**
   * Find data channel media section
   */
  findDataChannelMedia(parsedSDP) {
    return parsedSDP.media.find(m =>
      m.type === 'application' &&
      (m.protocol === 'UDP/DTLS/SCTP' || m.protocol === 'DTLS/SCTP')
    );
  }

  /**
   * Extract SCTP attributes from media section
   */
  extractSCTPAttributes(mediaSection) {
    if (!mediaSection) return {};

    const attrs = {};

    for (const attr of mediaSection.attributes) {
      if (attr.includes('sctp-port')) {
        attrs.sctpPort = attr.split(':')[1];
      } else if (attr.includes('sctpmap')) {
        attrs.sctpmap = attr;
      } else if (attr.includes('setup')) {
        attrs.setup = attr.split(':')[1];
      } else if (attr.includes('mid')) {
        attrs.mid = attr.split(':')[1] || attr.split('=')[1];
      } else if (attr.includes('max-message-size')) {
        attrs.maxMessageSize = attr.split(':')[1];
      }
    }

    return attrs;
  }

  /**
   * Analyze SDP for data channel support
   */
  analyzeSDP(sdp, label) {
    console.log(`\n=== Analyzing ${label} ===`);

    const parsed = this.parseSDP(sdp);
    const dcMedia = this.findDataChannelMedia(parsed);

    if (!dcMedia) {
      console.log('❌ No data channel media section found');
      return { hasDataChannel: false };
    }

    console.log('✅ Data channel media section found:');
    console.log(`   Line: ${dcMedia.line}`);
    console.log(`   Port: ${dcMedia.port} ${dcMedia.port === '0' ? '❌ REJECTED' : '✅ ACCEPTED'}`);

    const sctpAttrs = this.extractSCTPAttributes(dcMedia);
    console.log('   SCTP Attributes:', sctpAttrs);

    // Check for required attributes
    const issues = [];
    if (!sctpAttrs.sctpPort && dcMedia.port !== '0') {
      issues.push('Missing a=sctp-port attribute');
    }
    if (!sctpAttrs.setup) {
      issues.push('Missing a=setup attribute');
    }

    if (issues.length > 0) {
      console.log('⚠️  Issues found:', issues);
    }

    return {
      hasDataChannel: dcMedia.port !== '0',
      port: dcMedia.port,
      sctpAttributes: sctpAttrs,
      issues: issues,
      mediaSection: dcMedia
    };
  }

  /**
   * Compare offer and answer SDPs
   */
  compareSDPs(offerSDP, answerSDP) {
    console.log('\n🔍 COMPARING OFFER AND ANSWER 🔍');

    this.offerSDP = offerSDP;
    this.answerSDP = answerSDP;

    const offerAnalysis = this.analyzeSDP(offerSDP, 'OFFER');
    const answerAnalysis = this.analyzeSDP(answerSDP, 'ANSWER');

    console.log('\n=== Compatibility Check ===');

    // Check if both have data channels
    if (!offerAnalysis.hasDataChannel) {
      console.log('❌ Offer does not include data channels');
      return false;
    }
    if (!answerAnalysis.hasDataChannel) {
      console.log('❌ Answer rejected data channels (port=0)');
      return false;
    }

    // Check DTLS setup roles
    const offerSetup = offerAnalysis.sctpAttributes.setup;
    const answerSetup = answerAnalysis.sctpAttributes.setup;

    console.log(`DTLS Setup - Offer: ${offerSetup}, Answer: ${answerSetup}`);

    const validSetupCombos = [
      ['actpass', 'active'],
      ['actpass', 'passive'],
      ['active', 'passive'],
      ['passive', 'active']
    ];

    const setupValid = validSetupCombos.some(([o, a]) => o === offerSetup && a === answerSetup);
    if (!setupValid) {
      console.log('❌ Invalid DTLS setup combination');
    } else {
      console.log('✅ Valid DTLS setup combination');
    }

    // Check SCTP ports
    if (offerAnalysis.sctpAttributes.sctpPort && answerAnalysis.sctpAttributes.sctpPort) {
      console.log(`SCTP Ports - Offer: ${offerAnalysis.sctpAttributes.sctpPort}, Answer: ${answerAnalysis.sctpAttributes.sctpPort}`);
    }

    return offerAnalysis.hasDataChannel && answerAnalysis.hasDataChannel && setupValid;
  }

  /**
   * Attempt to fix answer SDP if data channels are rejected
   */
  fixAnswerSDP(answerSDP, offerSDP) {
    console.log('\n🔧 ATTEMPTING TO FIX ANSWER SDP 🔧');

    const offerParsed = this.parseSDP(offerSDP);
    const answerParsed = this.parseSDP(answerSDP);

    const offerDC = this.findDataChannelMedia(offerParsed);
    const answerDC = this.findDataChannelMedia(answerParsed);

    if (!offerDC) {
      console.log('❌ Cannot fix: Offer has no data channel');
      return answerSDP;
    }

    if (!answerDC || answerDC.port === '0') {
      console.log('⚠️  Answer rejected data channels or missing media section');

      // Extract offer's SCTP attributes
      const offerAttrs = this.extractSCTPAttributes(offerDC);

      // Build fixed answer media section
      let fixedLines = answerSDP.split('\n');

      if (answerDC && answerDC.port === '0') {
        // Replace the rejected m=application line
        const dcIndex = fixedLines.findIndex(line => line.trim().startsWith('m=application'));
        if (dcIndex !== -1) {
          // Use same port as offer or 9 (common for WebRTC)
          fixedLines[dcIndex] = `m=application 9 ${offerDC.protocol} webrtc-datachannel`;

          // Ensure proper DTLS setup
          let setupIndex = -1;
          for (let i = dcIndex + 1; i < fixedLines.length; i++) {
            if (fixedLines[i].startsWith('m=')) break;
            if (fixedLines[i].includes('a=setup')) {
              setupIndex = i;
              break;
            }
          }

          if (setupIndex === -1) {
            // Insert setup after the media line
            const setup = offerAttrs.setup === 'actpass' ? 'active' :
                         offerAttrs.setup === 'active' ? 'passive' : 'active';
            fixedLines.splice(dcIndex + 1, 0, `a=setup:${setup}`);
          }

          console.log('✅ Fixed m=application line and DTLS setup');
        }
      } else {
        console.log('❌ No data channel section found in answer to fix');
      }

      return fixedLines.join('\n');
    }

    console.log('ℹ️  Answer already accepts data channels');
    return answerSDP;
  }

  /**
   * Extract data channel info from SDP
   */
  extractDataChannelInfo(sdp) {
    const lines = sdp.split('\n');
    const info = {
      hasDataChannel: false,
      mediaLine: null,
      sctpPort: null,
      maxMessageSize: null,
      protocol: null
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('m=application')) {
        info.hasDataChannel = true;
        info.mediaLine = line;
        const parts = line.split(' ');
        info.port = parts[1];
        info.protocol = parts[2];
      } else if (line.includes('a=sctp-port:')) {
        info.sctpPort = line.split(':')[1];
      } else if (line.includes('a=max-message-size:')) {
        info.maxMessageSize = line.split(':')[1];
      }
    }

    return info;
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.SDPAnalyzer = SDPAnalyzer;

  // Convenience functions
  window.analyzeSDP = function(sdp, label = 'SDP') {
    const analyzer = new SDPAnalyzer();
    return analyzer.analyzeSDP(sdp, label);
  };

  window.compareSDPs = function(offerSDP, answerSDP) {
    const analyzer = new SDPAnalyzer();
    return analyzer.compareSDPs(offerSDP, answerSDP);
  };

  window.fixAnswerSDP = function(answerSDP, offerSDP) {
    const analyzer = new SDPAnalyzer();
    return analyzer.fixAnswerSDP(answerSDP, offerSDP);
  };

  console.log('🔧 SDP Analyzer loaded. Available functions:');
  console.log('  - analyzeSDP(sdp, label)');
  console.log('  - compareSDPs(offerSDP, answerSDP)');
  console.log('  - fixAnswerSDP(answerSDP, offerSDP)');
  console.log('  - new SDPAnalyzer() for full API');
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SDPAnalyzer;
}
