#!/usr/bin/env node

const path = require('path')
const { Command } = require('commander')
const shell = require('shelljs')
const fs = require('fs')
const os = require("os")
const tar = require('tar')

const cwd = process.cwd()
// const currentDir = path.basename(cwd)
const pkg = require('./package.json')
const homeDir = os.homedir()
const program = new Command()

program
    // https://github.com/tj/commander.js/pull/1102
    .storeOptionsAsProperties(false)

program
    .name(pkg.name)
    .version(pkg.version)

program
    .command('export')
    .option('-w, --watch', '开启观察模式，开启后每3秒自动导出一次')
    .description('export current package as a standby into depository')
    .action((options) => {
        // const pkgInfo = fs.readFileSync(path.join(currentDir, 'package.json'))
        // const pkgJson = JSON.stringify(pkgInfo)
        shell.exec(`mkdir -p ${homeDir}/.npm/drafts`)
        const build = () => shell.exec(`cd "${cwd}" && npm pack --pack-destination="${homeDir}/.npm/drafts"`)
        build()

        if (options.watch) {
            setInterval(build, 3000)
        }
    })

program
    .command('import <pkgs...>')
    .option('-w, --watch', '开启观察模式，开启后自动安装最新代码')
    .description('import a package from depository')
    .action((pkgs, options) => {
        const srcdir = `${homeDir}/.npm/drafts`
        const files = fs.readdirSync(srcdir)

        const pkginfos = []

        pkgs.forEach((pkg) => {
            let filename = pkg.replace(/\W/g, '-')
            if (filename[0] === '-') {
                filename = filename.substring(1)
            }

            const items = files.filter(item => item.indexOf(filename) === 0)
            if (!items) {
                console.log('没有找到对应包', { pkg, filename })
                shell.exit()
                return
            }

            items.sort()
            const file = items[items.length - 1]
            const filepath = path.join(srcdir, file)

            pkginfos.push({
                name: pkg,
                file: filepath,
            })
        })

        // 移除可能的循环依赖，注意，这里仅仅是为了调试，正常安装时会补充回来
        pkgs.forEach((pkg) => {
            pkgs.forEach((p) => {
                if (fs.existsSync(path.resolve(cwd, `node_modules/${pkg}/node_modules/${p}`))) {
                    fs.rmSync(path.resolve(cwd, `node_modules/${pkg}/node_modules/${p}`), { recursive: true, force: true })
                }
            })
        })

        const install = (pkginfo) => {
            // shell.exec(`cd "${cwd}" && npm install --legacy-peer-deps --no-save --no-package-lock ${tarbolls.map(item => `"${item}"`).join(' ')}`)
            const { name, file } = pkginfo
            const target = path.resolve(cwd, 'node_modules', name)
            pkginfo.target = target
            tar.x({
                cwd: target,
                file,
                sync: true,
            })
        }

        pkginfos.forEach(install)

        console.log('已安装：', pkginfos)

        if (options.watch) {
            const queue = new Set()
            const setupWatch = (file) => {
                fs.watchFile(file, { ninterval: 1000 }, (curr, prev) => {
                    if (curr.size !== prev.size) {
                        queue.add(file)
                    }
                })
            }
            pkginfos.map(item => item.file)
                .forEach(setupWatch)

            const pkginfomapping = pkginfos.reduce((mapping, item) => {
                mapping[item.file] = item
                return mapping
            }, {})
            let installing = false
            setInterval(() => {
                if (installing) {
                    return
                }
                if (!queue.size) {
                    return
                }
                installing = true
                Array.from(queue)
                    .map(file => pkginfomapping[file])
                    .forEach(install)
                queue.clear()
                installing = false
            }, 1000)
        }
    })

program
    .parse(process.argv)
