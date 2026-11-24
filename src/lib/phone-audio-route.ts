// Browser-safe: use the negotiated audio sender, never add a second RTP lane.
export async function bindPhoneSender(peer: RTCPeerConnection, stream: MediaStream) {
  const track = stream.getAudioTracks()[0];
  if (!track || track.readyState !== "live") throw new Error("مسار الصوت توقف");
  const transceiver = peer.getTransceivers?.().find(item =>
    item.receiver.track.kind === "audio" && item.currentDirection !== "stopped" && item.direction !== "recvonly" && item.direction !== "inactive",
  );
  const sender = transceiver?.sender ?? peer.getSenders().find(item => item.track?.kind === "audio");
  if (!sender) throw new Error("مسار إرسال الصوت مو جاهز");
  if (sender.track !== track) await sender.replaceTrack(track);
  track.enabled = true;
  for (const other of peer.getSenders()) {
    if (other !== sender && other.track?.kind === "audio") other.track.enabled = false;
  }
  return sender;
}