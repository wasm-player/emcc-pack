#!/usr/bin/env node

const process = require('process');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const chalk = require('chalk'); // 颜色输出
const clear = require('clear'); // 清屏
const figlet = require('figlet'); // 字符图形
const minimist = require('minimist'); // 命令行参数

const PACKER_DIR = path.join(path.dirname(path.dirname(fs.realpathSync(__filename))), 'packer');
const ARGS = minimist(process.argv.slice(2));
const EMCC_CMD = ['emcc', '-Os', '-s ALLOW_MEMORY_GROWTH=1', '-s MALLOC=emmalloc', 
                  '-s EXPORT_ES6=1', '-s USE_ES6_IMPORT_META=0', '-s STRICT=1', 
                  '-s MODULARIZE=1', '-s ALLOW_TABLE_GROWTH',
                  '-s EXTRA_EXPORTED_RUNTIME_METHODS="[\'addFunction\',\'removeFunction\']"'];
const PROJECT_DIR = process.cwd();
const PKG_DIR = path.join(PROJECT_DIR, 'pkg');

clear();
console.log(
    chalk.yellow(
        figlet.textSync('emcc-pack', {
            horizontalLayout: 'full'
        })
    )
);
console.log(chalk.gray('emcc building...'));
// 检查创建打包目录
if (!fs.existsSync(PKG_DIR)) {
    console.log(chalk.gray('making pkg dir'));
    fs.mkdirSync(path.join(PROJECT_DIR, 'pkg'));
}
// 执行emcc编译
try {
    const args = [];
    // 导出函数通过 --exports= 指定，多个函数名通过逗号连接，自动生成_前缀
    if (ARGS.exports) {
        const exports = ARGS.exports.split(',').map(v => '"_' + v + '"').join(',');
        console.log(chalk.gray('emcc func exports: ' + exports));
        args.push('-s EXPORTED_FUNCTIONS=\'[' + exports + ']\'');
    } else {
        console.log(chalk.red('reuqire --exports argument'));
        return -1;
    }
	if (ARGS.simd) {
        console.log(chalk.green('---- simd128 enabled'));
		args.push('-msimd128');
        args.push('-msse');
	}
    if (ARGS.thread) {
        console.log(chalk.green('---- thread enabled'));
        args.push('-s USE_PTHREADS=1');
        args.push('-s ENVIRONMENT="web,worker"');
    } else {
        args.push('-s ENVIRONMENT="web"');
    }
    // 设置包含目录选项
    if (ARGS.I) {
		if (typeof(ARGS.I) === 'string') {
			ARGS.I = [ARGS.I];
		}
        ARGS.I.forEach(v => {
            args.push('-I ' + v);
        });
    }
    // 输出名称为 _api
    args.push('-o pkg/_api.js');
    childProcess.execSync([...EMCC_CMD, ...args, ...ARGS._].join(' '));
} catch (e) {
    console.log(chalk.red('emcc build failed status=' + e.status));
    return -1;
}
console.log(chalk.green('emcc build done'));

// 将_api.wasm打包到rust wasm中
console.log(chalk.gray('wasm packing...'));
const package = require(path.join(PROJECT_DIR, 'package.json'));
let wasmName = ARGS.wasmname;
if (!wasmName) {
    wasmName = package.name;
}
fs.renameSync(path.join(PKG_DIR, '_api.wasm'), path.join(PKG_DIR, '_api.wasm.dat'));
process.env['WASM_PATH'] = path.join(PKG_DIR, '_api.wasm.dat');
process.env['JS_PATH'] = path.join(PKG_DIR, '_api.js');
childProcess.execSync(`wasm-pack build --target=web --release --out-dir ${PKG_DIR} --out-name ${wasmName} ${PACKER_DIR}`);
console.log(chalk.green('wasm pack done'));

// 重新配置文件
console.log(chalk.gray('final packing...'));
fs.unlinkSync(path.join(PKG_DIR, 'package.json'));
// 创建文件入口文件
fs.writeFileSync(path.join(PKG_DIR, 'index.js'), genIndexJs(wasmName));
fs.writeFileSync(path.join(PKG_DIR, 'index.d.ts'), genIndexD());
// 创建package.json
fs.writeFileSync(path.join(PKG_DIR, 'package.json'), genPackageJson(wasmName, package.version));
fs.unlinkSync(path.join(PKG_DIR, '_api.wasm.dat'));
fs.unlinkSync(path.join(PKG_DIR, `${wasmName}_bg.wasm.d.ts`));
fs.renameSync(path.join(PKG_DIR, `${wasmName}_bg.wasm`), path.join(PKG_DIR, `${wasmName}_bg.png`));
// 替换JS内容（解决webpack打包报错问题）
const jsFilePath = path.join(PKG_DIR, `${wasmName}.js`);
const js = fs.readFileSync(jsFilePath);
fs.writeFileSync(jsFilePath, js.toString('utf-8').replace('import.meta.url', '""'));

console.log(chalk.green('build and pack success to pkg dir, enjoy!!'));

function genIndexJs(name) {
    return `
import wasmInterface from './_api';
import url from './${name}_bg.png';
import init, {getWasmData as getWasm,getJsData as getJs} from './${name}';
let inited = false;
function getData(fn) {
    return new Promise((resolve, reject) => {
        if (!inited) {
            fetch(url).then((res) => {
                init(res.arrayBuffer()).then(() => {
                    inited = true;
                    resolve(fn());
                }).catch(reject);
            }).catch(reject);
        } else {
            resolve(fn());
        }
    });
}
function load() {
    return new Promise((resolve, reject) => {
        const mod = {instance: undefined};
        mod.instance = wasmInterface({
            instantiateWasm(info, receiveInstance) {
                getData(getWasm).then((data) => {
                    WebAssembly.instantiate(data, info).then(function(wasm) {
						receiveInstance(wasm.instance, wasm.module);
					}, function (reason) {
                        console.err('failed to prepare wasm');
                        reject(reason);
                        throw reason;
                    });
                });
				return {};
            },
            onRuntimeInitialized() {
                resolve(mod.instance);
            }
        });
    });
}
function getWasmData() {
    return new Promise((resolve, reject) => {
        getData(getWasm).then((data) => {
            resolve(data);
        }).catch(err => reject(err));
    });
}
function getJsData() {
    return new Promise((resolve, reject) => {
        getData(getJs).then((data) => {
            resolve(data);
        }).catch(err => reject(err));
    });
}
export default {
    load,
    getWasmData,
    getJsData
};
`;
}

function genIndexD() {
    return `
export default class Module {
    public static load(): Promise<any>;
    public static getWasmData(): Promise<any>;
    public static getJsData(): Promise<any>;
}
`;
}

function genPackageJson(name, version) {
    return `
{
    "name": "${name}",
    "collaborators": [
        "zql"
    ],
    "version": "${version}",
    "files": [
        "index.js",
        "_api.js",
        "${name}_bg.png",
        "${name}.js",
        "${name}.d.ts"
    ],
    "module": "index.js",
    "types": "index.d.ts",
    "sideEffects": false
}
    `;
}
