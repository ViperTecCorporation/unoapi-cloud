// Ambient declarations to allow compiling when @mmomtchev/ffmpeg is optional
// and not present on certain platforms (e.g., linux/arm64 musl).
// These modules are loaded at runtime conditionally; types are 'any'.

declare module '@mmomtchev/ffmpeg' {
  const ff: any
  export default ff
}

declare module '@mmomtchev/ffmpeg/stream' {
  export const Demuxer: any
  export const AudioDecoder: any
  export const AudioEncoder: any
  export const Muxer: any
  export const Discarder: any
}

