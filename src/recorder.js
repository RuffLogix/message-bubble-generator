const VIDEO_ONLY = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const WITH_AUDIO = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// `withAudio` picks the candidate list: a container declaring an Opus track it
// never receives, or receiving one it never declared, is a recipe for a file
// that plays silently in some players and not at all in others.
export function pickMimeType(withAudio = false) {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of withAudio ? WITH_AUDIO : VIDEO_ONLY) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function createRecorder(canvas, mimeType, fps = 60, audioStream = null) {
  const stream = canvas.captureStream(fps);

  // Clone rather than adopt: `stop()` below stops every track on the stream,
  // and the audio track belongs to a MediaStreamDestination that lives for the
  // whole page. Stopping the original would silence every later recording.
  if (audioStream) {
    for (const track of audioStream.getAudioTracks()) stream.addTrack(track.clone());
  }

  const options = { mimeType, videoBitsPerSecond: 12_000_000 };
  if (audioStream) options.audioBitsPerSecond = 128_000;

  const recorder = new MediaRecorder(stream, options);
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  return {
    start() {
      recorder.start();
    },
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      });
    },
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
