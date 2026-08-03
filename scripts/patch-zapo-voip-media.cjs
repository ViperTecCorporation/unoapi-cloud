const fs = require('node:fs')
const path = require('node:path')

const patchRelay = (source) => {
  if (!source.includes('class WaSctpRelay')) throw new Error('@zapo-js/voip WaSctpRelay anchor not found')

  let patched = source
  if (!patched.includes('this.selfPid = 0;')) {
    patched = patched.replace(
      '        this.subscriptionSsrc = 0;\n',
      '        this.subscriptionSsrc = 0;\n        this.selfPid = 0;\n        this.peerPid = 0;\n',
    )
  }
  if (!patched.includes('setParticipantPids(selfPid, peerPid)')) {
    const anchor = /    setSubscriptionSsrc\(ssrc\) \{[\s\S]*?^    \}\n(?=    resendSubscriptions\(\))/m
    const match = patched.match(anchor)
    if (!match) throw new Error('@zapo-js/voip setSubscriptionSsrc anchor not found')
    patched = patched.replace(
      anchor,
      `${match[0]}    setParticipantPids(selfPid, peerPid) {\n        this.selfPid = Number.isFinite(selfPid) ? Number(selfPid) : 0;\n        this.peerPid = Number.isFinite(peerPid) ? Number(peerPid) : 0;\n        this.logger.debug('sctp participant pids set', { selfPid: this.selfPid, peerPid: this.peerPid });\n    }\n`,
    )
  }
  patched = patched.replace(
    /buildSSRCSubscriptionList\)\(\[selfSsrc\], peerSsrcs, 0, 0\)/g,
    'buildSSRCSubscriptionList)([selfSsrc], peerSsrcs, this.selfPid, this.peerPid)',
  )
  patched = patched.replace(
    /buildSSRCSubscriptionList\(\[selfSsrc\], peerSsrcs, 0, 0\)/g,
    'buildSSRCSubscriptionList([selfSsrc], peerSsrcs, this.selfPid, this.peerPid)',
  )
  if (!patched.includes('this.subscriptionSsrc = 0;\n        this.selfPid = 0;\n        this.peerPid = 0;')) {
    throw new Error('@zapo-js/voip participant PID fields were not patched')
  }
  const cleanupAnchor = '        this.audioSsrc = 0;\n        this.subscriptionSsrc = 0;\n        this.pongCount = 0;'
  const cleanupPatched = '        this.audioSsrc = 0;\n        this.subscriptionSsrc = 0;\n        this.selfPid = 0;\n        this.peerPid = 0;\n        this.pongCount = 0;'
  if (patched.includes(cleanupAnchor)) patched = patched.replace(cleanupAnchor, cleanupPatched)
  return patched
}

const relayVariants = `        const WA_RELAY_PORT = 3478;
        const WEB_RELAY_PORT = 3480;
        const relays = uniqueEndpoints
            .filter((ep) => ep.key && ep.rawToken)
            .flatMap((ep) => {
            const variants = [{
                    ip: ep.ip,
                    port: WA_RELAY_PORT,
                    token: ep.token,
                    authToken: ep.authToken,
                    rawAuthToken: ep.rawAuthToken,
                    rawToken: ep.rawToken,
                    key: ep.key,
                    relayId: ep.relayId,
                    name: ep.relayName || \`\${ep.ip}:\${WA_RELAY_PORT}\`,
                    authTokenId: ep.authTokenId,
                    isFna: ep.isFna
                }];
            if (ep.authTokenId === '0' || /^fops/i.test(ep.relayName || '')) {
                variants.push({
                    ip: ep.ip,
                    port: WEB_RELAY_PORT,
                    token: ep.token,
                    authToken: undefined,
                    rawAuthToken: undefined,
                    rawToken: ep.rawToken,
                    key: ep.key,
                    relayId: ep.relayId,
                    name: \`\${ep.relayName || ep.ip}-web-token\`,
                    authTokenId: \`\${ep.authTokenId || '0'}-web-token\`,
                    isFna: ep.isFna
                });
            }
            return variants;
        });`

const incomingMediaMapping = (cjs) => {
  const toUserJid = cjs ? '(0, protocol_1.toUserJid)' : 'toUserJid'
  return `        const relayData = this.info.relayData;
        if (!this.info.isInitiator && relayData?.participantJids?.length) {
            const credentials = this.deps.authClient.getCurrentCredentials();
            const ourCredJid = credentials?.meLid || credentials?.meJid || '';
            const ourBaseJids = new Set([credentials?.meLid, credentials?.meJid, ourCredJid].filter(Boolean).map((jid) => ${toUserJid}(jid)));
            const ourDeviceJid = this.ensureDeviceJid(relayData.participantJids.find((jid) => ourBaseJids.has(${toUserJid}(jid)) && /:\\d+@/.test(jid)) || ourCredJid);
            const peerParticipantJid = relayData.participantJids.find((jid) => !ourBaseJids.has(${toUserJid}(jid)));
            const newSelfSsrc = generateSecureSsrc(this.info.callId, ourDeviceJid);
            if (newSelfSsrc !== this.selfSsrc) {
                this.selfSsrc = newSelfSsrc;
                this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc);
            }
            if (peerParticipantJid) {
                this.peerSsrcs = [generateSecureSsrc(this.info.callId, this.ensureDeviceJid(peerParticipantJid))];
            }
            this.logger.debug('incoming relay participant media mapped', {
                callId: this.info.callId,
                ourDeviceJid,
                peerParticipantJid
            });
        }
        this.sctpRelay.setSsrc(this.selfSsrc);
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);
        this.sctpRelay.setParticipantPids(
            this.info.isInitiator ? relayData?.selfPid : 0,
            this.info.isInitiator ? relayData?.peerPid : 0
        );`
}

const patchMediaSession = (source) => {
  if (!source.includes('class WaCallMediaSession')) throw new Error('@zapo-js/voip WaCallMediaSession anchor not found')
  let patched = source.replace('const key = `${ep.ip}:${ep.port}`;', 'const key = `${ep.ip}:${ep.port}:${ep.authTokenId || \'\'}`;')

  if (!patched.includes('const WEB_RELAY_PORT = 3480;')) {
    const relaysBlock = /        const WA_RELAY_PORT = 3478;\n        const relays = uniqueEndpoints[\s\S]*?^        \}\)\);/m
    if (!relaysBlock.test(patched)) throw new Error('@zapo-js/voip relay normalization block not found')
    patched = patched.replace(relaysBlock, relayVariants)
  }

  const cjs = patched.includes('protocol_1.toUserJid')
  const toUserJid = cjs ? '(0, protocol_1.toUserJid)' : 'toUserJid'
  const callDirection = cjs ? 'types_js_1.CallDirection' : 'CallDirection'
  const endCallReason = cjs ? 'types_js_1.EndCallReason' : 'EndCallReason'
  if (!patched.includes('stopping mirrored local call leg')) {
    const anchor = '        this.acceptedByJid = acceptingDeviceJid;'
    if (!patched.includes(anchor)) throw new Error('@zapo-js/voip accepted device anchor not found')
    patched = patched.replace(anchor, `        const acceptingBase = ${toUserJid}(acceptingDeviceJid);
        if (this.info.direction === ${callDirection}.Incoming && acceptingBase === ourBase) {
            this.logger.info('incoming call accepted by another local device; stopping mirrored local call leg', {
                callId,
                acceptingDeviceJid
            });
            try {
                this.info.applyTransition({
                    type: 'terminated',
                    reason: ${endCallReason}.UserEnded
                });
            }
            catch (err) {
                this.logger.trace('call transition skipped', { message: ${cjs ? '(0, util_1.toError)' : 'toError'}(err).message });
            }
            this.delegate.emitEnded(this.info);
            this.delegate.emitState(this.info);
            this.cleanup();
            return;
        }
${anchor}`)
  }
  const mapBlock = incomingMediaMapping(cjs)
      .replaceAll('generateSecureSsrc', cjs ? '(0, ssrc_js_1.generateSecureSsrc)' : 'generateSecureSsrc')
      .replaceAll('RtpSession.whatsappOpus', cjs ? 'rtp_js_1.RtpSession.whatsappOpus' : 'RtpSession.whatsappOpus')
  if (patched.includes("incoming relay participant media mapped")) {
    const existingMapping = /        const relayData = this\.info\.relayData;[\s\S]*?(?=        this\.sctpRelay\.setSsrc\(this\.selfSsrc\);)/
    if (!existingMapping.test(patched)) throw new Error('@zapo-js/voip existing media mapping block not found')
    const mappingOnly = mapBlock.slice(0, mapBlock.indexOf('        this.sctpRelay.setSsrc'))
    patched = patched.replace(existingMapping, mappingOnly)
  } else {
    const anchor = '        this.sctpRelay.setSsrc(this.selfSsrc);\n        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);'
    if (!patched.includes(anchor)) throw new Error('@zapo-js/voip relay SSRC anchor not found')
    patched = patched.replace(anchor, mapBlock)
  }
  return patched
}

const patchRelayTypes = (source) => {
  if (source.includes('setParticipantPids(selfPid?: number, peerPid?: number): void;')) return source
  const anchor = '    setSubscriptionSsrc(ssrc: number): void;\n'
  if (!source.includes(anchor)) throw new Error('@zapo-js/voip WaSctpRelay types anchor not found')
  return source.replace(anchor, `${anchor}    setParticipantPids(selfPid?: number, peerPid?: number): void;\n`)
}

const patchFile = (file, transform) => {
  const source = fs.readFileSync(file, 'utf8')
  const patched = transform(source)
  if (patched !== source) fs.writeFileSync(file, patched)
}

const patchInstalledZapoVoip = (root = process.cwd()) => {
  const dist = path.join(root, 'node_modules', '@zapo-js', 'voip', 'dist')
  for (const format of ['', 'esm']) {
    const base = path.join(dist, format)
    patchFile(path.join(base, 'relay', 'WaSctpRelay.js'), patchRelay)
    patchFile(path.join(base, 'call', 'WaCallMediaSession.js'), patchMediaSession)
  }
  patchFile(path.join(dist, 'relay', 'WaSctpRelay.d.ts'), patchRelayTypes)
}

if (require.main === module) patchInstalledZapoVoip()

module.exports = { patchRelay, patchMediaSession, patchRelayTypes, patchInstalledZapoVoip }
