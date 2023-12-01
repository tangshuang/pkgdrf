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
    .description('将当前包导出到草稿库中')
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
    .option('-r, --watch-run <run>', '开启观察模式的同时，运行命令，代码变更后重启命令')
    .description('从草稿库中解压覆盖一个包')
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

        const install = (pkginfo) => {
            const { name, file } = pkginfo
            const target = path.resolve(cwd, 'node_modules', name)
            pkginfo.target = target
            tar.x({
                cwd: target,
                file,
                sync: true,
                strip: 1,
            })
        }

        pkginfos.forEach(install)

        console.log(`[${new Date().toLocaleString()}]`, '已安装：', pkginfos)

        if (options.watch || options.run) {
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

            let child = options.run && shell.exec(options.run, { async: true })

            let installing = false
            setInterval(() => {
                if (installing) {
                    return
                }
                if (!queue.size) {
                    return
                }
                installing = true
                const nextPkginfos = Array.from(queue).map(file => pkginfomapping[file]).filter(Boolean)
                nextPkginfos.forEach(install)
                console.log(`[${new Date().toLocaleString()}]`, '已安装：', nextPkginfos)
                queue.clear()

                if (options.run) {
                    child.kill()
                    child = shell.exec(options.watchRun, { async: true })
                }

                installing = false
            }, 1000)
        }
    })

program
    .command('install <pkgs...>')
    .option('-c, --cleanup', '是否清除该包自身依赖中与当前项目重名的包，即从该包的node_modules中移除某些包，注意，该操作仅做调试用')
    .description('从草稿库中安装一个包，它所依赖的其他包也会被一并安装')
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
        if (options.cleanup) {
            pkgs.forEach((pkg) => {
                pkgs.forEach((p) => {
                    if (fs.existsSync(path.resolve(cwd, `node_modules/${pkg}/node_modules/${p}`))) {
                        fs.rmSync(path.resolve(cwd, `node_modules/${pkg}/node_modules/${p}`), { recursive: true, force: true })
                    }
                })
            })
        }

        shell.exec(`cd "${cwd}" && npm install --legacy-peer-deps --no-save --no-package-lock ${pkginfos.map(item => `"${item.file}"`).join(' ')}`)

        console.log(`[${new Date().toLocaleString()}]`, '已安装：', pkginfos)
    })

program
    .parse(process.argv)
