const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

// Opens an ffmpeg process that reads a PNG sequence from stdin and writes
// H.264 MP4. Caller pushes PNG buffers via write() and finalizes with end().
//
// Quality knobs:
//   crf         Constant Rate Factor. 0 = lossless, 18 = "visually lossless",
//               15 = near-lossless, 23 = default. Lower = bigger file.
//   preset      libx264 speed/quality tradeoff. Slower presets give smaller
//               files at the same CRF. Values: ultrafast .. veryslow.
//   scaleTo     { width, height } to downscale to with Lanczos. Used when
//               frames are supersampled — produces antialiased output.
function openEncoder({
  outPath, fps,
  crf = 15,
  preset = 'slow',
  scaleTo = null,
  verbose = false,
}) {
  const args = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-i', '-',
  ];
  if (scaleTo) {
    args.push('-vf', `scale=${scaleTo.width}:${scaleTo.height}:flags=lanczos`);
  }
  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    '-preset', preset,
    // Tag the stream with standard HD color metadata so players render the
    // same colors we see in the browser (sRGB ≈ bt709 for typical content).
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-color_range', 'tv',
    '-movflags', '+faststart',
    outPath,
  );

  const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

  let stderrBuf = '';
  ff.stderr.on('data', (chunk) => {
    const s = chunk.toString();
    stderrBuf += s;
    if (verbose) process.stderr.write(s);
  });

  let killed = false;
  let exitInfo = null;
  ff.on('close', (code, signal) => { exitInfo = { code, signal }; });

  // Suppress EPIPE writes when ffmpeg has exited unexpectedly — we surface
  // the error via end() / write() rejections instead.
  ff.stdin.on('error', () => {});

  return {
    write: (pngBuffer) => new Promise((resolve, reject) => {
      if (exitInfo) return reject(new Error(`ffmpeg died early (code=${exitInfo.code} signal=${exitInfo.signal})\n${stderrBuf.slice(-2000)}`));
      const ok = ff.stdin.write(pngBuffer, (err) => {
        if (err && !killed) reject(err); else if (ok) resolve();
      });
      if (!ok) ff.stdin.once('drain', resolve);
    }),
    end: () => new Promise((resolve, reject) => {
      if (exitInfo) {
        if (exitInfo.code === 0) resolve();
        else reject(new Error(`ffmpeg exited code=${exitInfo.code} signal=${exitInfo.signal}\n${stderrBuf.slice(-2000)}`));
        return;
      }
      ff.once('close', (code, signal) => {
        if (killed) return resolve();
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited code=${code} signal=${signal}\n${stderrBuf.slice(-2000)}`));
      });
      ff.stdin.end();
    }),
    kill: () => { killed = true; try { ff.kill('SIGKILL'); } catch {} },
  };
}

module.exports = { openEncoder };
