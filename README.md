<div align="center">

  <h1><code>emcc-pack</code></h1>

  <strong>A cli package for build and pack emscripten library to es6 module </strong>

  <sub>Built with 🦀🕸 by <a href="https://rustwasm.github.io/">The Rust and WebAssembly Working Group</a></sub>
</div>

### 🐑 Use `yarn emcc-pack --exports=[<func_name>] [-I<include_dir>] <files> ` 

#### support options
 - `exports` exports functions join by `,`, eg. `--exports=_fn1,_fn2`
 - `wasmname` target package name, eg. `--wasmname=new_name`
 - `simd` build with simd support, eg. `--simd`
 - `I` include directory, eg. `-I../include -I./3rdparty`
 - `thread` enable pthread to build, eg. `--thread`
    
#### full example

`yarn emcc-pack --wasmname=mywasm --simd --exports=_foo1,_foo2 -I./include ./libs/libc.a foo.c main.c`