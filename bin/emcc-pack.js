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
                  '-s ENVIRONMENT="web"', '-s MODULARIZE=1'];
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
process.env['DATA_PATH'] = path.join(PKG_DIR, '_api.wasm');
childProcess.execSync(`wasm-pack build --release --out-dir ${PKG_DIR} --out-name ${package.name} ${PACKER_DIR}`);
console.log(chalk.green('wasm pack done'));

// 重新配置文件
console.log(chalk.gray('final packing...'));
fs.unlinkSync(path.join(PKG_DIR, 'package.json'));
// 创建文件入口文件
fs.writeFileSync(path.join(PKG_DIR, 'index.js'), genIndexJs(package.name));
fs.writeFileSync(path.join(PKG_DIR, 'index.d.ts'), genIndexD());
// 创建package.json
fs.writeFileSync(path.join(PKG_DIR, 'package.json'), genPackageJson(package.name, package.version));

console.log(chalk.green('build and pack success to pkg dir, enjoy!!'));

function genIndexJs(name) {
    return `
import wasmInterface from './_api';
function load() {
    return new Promise((resolve, reject) => {
        const mod = {instance: undefined};
        mod.instance = wasmInterface({
            instantiateWasm(info, receiveInstance) {
                import('./${name}').then((loader) => {
                    WebAssembly.instantiate(loader.getData(), info).then(function(wasm) {
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
export default {
    load
};
`;
}

function genIndexD() {
    return `
export default class Module {
    public static async load(): any;
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
        "${name}_bg.js",
        "${name}_bg.wasm",
        "${name}.js",
        "${name}.d.ts"
    ],
    "module": "index.js",
    "types": "index.d.ts",
    "sideEffects": false
}
    `;
}
