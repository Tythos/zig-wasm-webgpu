# zig-wasm-webgpu

Goal is to adapt some part of the WebGPU interface to invoke from a Zig-compiled WASM module.

Starting point is Codelabs WebGPU exercise / kata, which has been adapted to a Vite-based template for automating build and reload actions.

Manual build of `src/main.zig` can be done from the command line:

```sh
zig build-exe src/main.zig -target wasm32-freestanding -fno-entry --export=onInit --export=onAnimationFrame
```
