#!/usr/bin/env node

const path = require('path')
const { Command } = require('commander')
const shell = require('shelljs')
const fs = require('fs')
const os = require("os")

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
    .description('export current package as a standby into depository')
    .action(() => {
        // const pkgInfo = fs.readFileSync(path.join(currentDir, 'package.json'))
        // const pkgJson = JSON.stringify(pkgInfo)
        shell.exec(`mkdir -p ${homeDir}/.npm/drafts`)
        shell.exec(`cd "${cwd}" && npm pack --pack-destination="${homeDir}/.npm/drafts"`)
    })

program
    .command('import <pkg>')
    .description('import a package from depository')
    .action((pkg) => {
        let filename = pkg.replace(/\W/g, '-')
        if (filename[0] === '-') {
            filename = filename.substring(1)
        }

        const srcdir = `${homeDir}/.npm/drafts`
        const files = fs.readdirSync(srcdir)
        const items = files.filter(item => item.indexOf(filename) === 0)
        if (!items) {
            console.log('没有找到对应包', { pkg, filename })
            shell.exit()
        }

        items.sort()
        const file = items[0]
        const filepath = path.join(srcdir, file)
        shell.exec(`cd "${cwd}" && npm install --legacy-peer-deps --no-save --no-package-lock "${filepath}"`)
    })

program
    .parse(process.argv)
