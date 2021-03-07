const axios = require('axios')
const axiosRetry = require('axios-retry')
axiosRetry(axios, { retries: 3 });
const { parse } = require('node-html-parser')
const cmd = require('node-cmd')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const csv = require('csvtojson')
const path = require('path')
const fs = require('fs')
const flowParser = require('flow-parser');
const recast = require('recast');

const search = require('./search')

const AMOUNT_OF_PROJECTS = 200
const AMOUNT_OF_USERS = 1000000

const timeout = ms => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const auth = {
    username: 'romssilva',
    password: '1030psswrd'
}
const headers = {
    'Accept': 'application/vnd.github.v3+json'
}

// {
//     name: String,
//     count: Number,
//     jsdoc: Number,
//     comment: Number,
//     console: Number,
//     utility: Number,
//     prefix: {
//         identifier: String,
//         count: Number
//     }
// }

let projects = {}
let blackListedProjects = [
    
]

let visitingFile = '';

const runCmd = async (cmmd, callback = () => null) => {
    return new Promise((res, rej) => {
        cmd.get(cmmd, (err, data, stderr) => {
            if (err) {
                rej(callback.apply(null, [err, data, stderr]))
            } else {
                res(callback.apply(null, [err, data, stderr]))
            }
        })
    })
}

const writeToCSV = async (path, header, records) => {
    const csvWriter = createCsvWriter({
        path, 
        header,
    });
    csvWriter.writeRecords(records).then(res => console.log(`Wrote ${path}!`))
}

const parseProjects = () => {
    const NPM_PATH = './npm/lib/node_modules/bluebird'
    // const NPM_PATH = './npm/lib/node_modules'
    // const GIT_PATH = './git'
    // const fileCount = search.jsFilesCount(NPM_PATH)
    
    const projectOccurrences = search.projectSearch(NPM_PATH)
    // writeToCSV(`csv/occurrences/occurrences_${new Date().getTime()}.csv`, [
    //     {id: 'file', title: 'FILE PATH'},
    //     {id: 'matches', title: 'MATCHES'}
    // ], occurrences)
    
    Object.keys(projectOccurrences).map(projectName => {
        projects[projectName] = {
            count: projectOccurrences[projectName],
            jsdoc: 0,
            comment: 0,
            console: 0,
            utility: 0,
            prefix: {}  
        }
    })
    
    // const occurenciesASTS = search.searchOccurences(occurencies)
    // const projectsInfo = search.projectsOccurencies(occurencies, occurenciesASTS.occurrenciesMap)
    // writeToCSV(`csv/projects/projects_${new Date().getTime()}.csv`, [
    //     {id: 'project', title: 'PROJECT'},
    //     {id: '@deprecated', title: '@deprecated'},
    //     {id: 'deprecated', title: 'deprecated'},
    //     {id: 'deprecate', title: 'deprecate'}
    // ], projectsInfo)
    
    // console.log(`${occurencies.length} files of ${fileCount} found.`)
    // console.log(occurenciesASTS.occurrenciesMap)
    // console.log(`Total of ${Array.from(occurenciesASTS.occurrenciesMap.values()).reduce((a, b) => a + b, 0)} occurrencies.`)
    // console.log(`Failed parsing ${occurenciesASTS.errorFiles.length} files.`)
    // occurenciesASTS.ASTs.map(ast => ast.locations.map(loc => {
    //     if (loc.loc) {
    //         // console.log(loc.loc)
    //     } else {
    //         console.log(loc)
    //     }
    // }))
    
    const jsDocOccurrences = search.JSDoc(NPM_PATH)
    // writeToCSV(`csv/occurrences/jsdoc/occurrences_${new Date().getTime()}.csv`, [
    //     {id: 'file', title: 'FILE PATH'},
    //     {id: 'matches', title: 'MATCHES'}
    // ], jsDocOccurrences)
    
    jsDocOccurrences.forEach(occurrence => {
        const projectName = occurrence.file.split('/')[4]
        projects[projectName].jsdoc = projects[projectName].jsdoc + occurrence.matches

    })
    
    const commentsOccurrences = search.comments(NPM_PATH)
    // writeToCSV(`csv/occurrences/comments/occurrences_${new Date().getTime()}.csv`, [
    //     {id: 'file', title: 'FILE PATH'},
    //     {id: 'matches', title: 'MATCHES'}
    // ], commentsOccurrences)
    
    commentsOccurrences.forEach(occurrence => {
        const projectName = occurrence.file.split('/')[4]
        projects[projectName].comment = projects[projectName].comment + occurrence.matches

    })

    // const locations = search.keywordsSearch('./npm/lib/node_modules/axios/lib/helpers/')
    const locations = search.keywordsSearch(NPM_PATH)
    const filesContent = locations.map(location => ({
        file: location.file,
        content: search.getFileContent(location.file)
    }))
    const asts = filesContent.map(({ file, content }) => ({
        file,
        ast: flowParser.parse(content, {})
    }))
    const consoleMessages = []
    const utilities = []
    const identifiers = []
    const identifiersCount = {}
    asts.forEach(({ file, ast }) => {
        console.log(`Searching for console occurrences in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            visitCallExpression(path){
                // Chamadas diretas de console
                const calleeObjectName = path.node.callee && path.node.callee.object && path.node.callee.object.name
                if (calleeObjectName == 'console') {
                    recast.visit(path, {
                        visitLiteral(path){
                            const literalValue = path.node.value && path.node.value.toLocaleLowerCase ? path.node.value.toLocaleLowerCase() : ''
                            if (literalValue.indexOf('deprecat') > -1) {
                                consoleMessages.push({
                                    file: visitingFile,
                                    line: path.node.loc.start.line
                                });
                            }
                            return false;
                        }
                    })
                }
                return false;
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        console.log(`Searching for utilities occurrences in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            visitCallExpression(path){
                // deprecate('dont use this')
                const calleeName = path.node.callee && path.node.callee.name || ''
                if (calleeName.indexOf('deprecat') > -1) {
                    console.log('CallExpression', {
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }

                // oi.debug.deprecated("calling Promise.try with more than 1 argument");
                !!calleeName && recast.visit(path.node.callee, {
                    visitIdentifier(path) {
                        if (path.node.name.indexOf('deprecat') > -1) {
                            console.log('CallExpression>MemberExpression>Identifier', {
                                file: visitingFile,
                                line: path.node.loc.start.line
                            })
                            utilities.push({
                                file: visitingFile,
                                line: path.node.loc.start.line
                            })
                        }
                        return false
                    }
                })

                const arguments = path.node.arguments && path.node.arguments.filter(param => {
                    if (param.name && param.name.indexOf('deprecat') > -1) {
                        return true
                    }

                    if (param.property && param.property.name && param.property.name.indexOf('deprecat') > -1) {
                        return true
                    }

                })

                if (arguments && arguments.length) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('CallExpression>arguments',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }

                
                // const calleeObjectName = path.node.callee && path.node.callee.object && path.node.callee.object.name
                // if (calleeObjectName != 'console') {
                //     recast.visit(path, {
                //         visitLiteral(path){
                //             const literalValue = path.node.value && path.node.value.toLocaleLowerCase ? path.node.value.toLocaleLowerCase() : ''
                //             if (literalValue.indexOf('deprecat') > -1) {
                //                 utilities.push({
                //                     file: visitingFile,
                //                     line: path.node.loc.start.line
                //                 });
                //                 console.log('CallExpression>Literal', {
                //                     file: visitingFile,
                //                     line: path.node.loc.start.line
                //                 })
                //             }
                //             return false;
                //         }
                //     })
                // }
                return false;
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        // console.log(`Searching for utilities occurrences in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            visitVariableDeclarator(path){
                // Definição de variável em que o nome da função tem 'deprecat', possível util senda definida.
                const idName = path.node.id.name

                if (idName.indexOf('deprecat') > -1) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('VariableDeclaration>Identifier', {
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }
                
                path.node.init && recast.visit(path.node.init, {
                    visitLiteral(path){
                        if (path.node.value && path.node.value.indexOf && path.node.value.indexOf('deprecat') > -1) {
                            utilities.push({
                                file: visitingFile,
                                line: path.node.loc.start.line
                            })
                            console.log('VariableDeclaration>Init', {
                                file: visitingFile,
                                line: path.node.loc.start.line
                            })
                        }
                        return false
                    }
                })
                return false
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        // console.log(`Searching for utilities occurrences in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            visitFunctionDeclaration(path){
                // Definição de variável em que o nome da função tem 'deprecat', possível util senda definida.
                // console.log(path.node.id.name)
                if (path.node.id && path.node.id.name.indexOf('deprecat') > -1) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('FunctionDeclaration',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }
                // recast.visit(path, {
                    // visitIdentifier(path){
                    //     if (path.node.name.indexOf('deprecat') > -1) {
                    //         utilities.push({
                    //             file: visitingFile,
                    //             line: path.node.loc.start.line
                    //         })
                    //         console.log('FunctionDeclaration>Identifier',{
                    //             file: visitingFile,
                    //             line: path.node.loc.start.line
                    //         })
                    //     }
                    //     return false
                    // }
                // })
                return false
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        // console.log(`Searching for utilities occurrences in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            visitFunctionExpression(path){
                // Definição de variável em que o nome da função tem 'deprecat', possível util senda definida.
                if (path.node.id && path.node.id.name.indexOf('deprecat') > -1) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('FunctionExpression',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }

                const params = path.node.params && path.node.params.filter(param => {
                    if (param.name && param.name.indexOf('deprecat') > -1) {
                        return true
                    }
                    
                    if (param.left && param.left.name && param.left.name.indexOf('deprecat') > -1) {
                        return true
                    }

                    return false
                })

                if (params && params.length) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('FunctionExpression>Params',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }
                return false
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        // console.log(`Searching for utilities imports in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            // Imported elements, possibly utils
            visitImportDefaultSpecifier(path){
                const localName = path.node.local.name
                if (localName.indexOf('deprecat') > -1) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('ImportDefault',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }
                return false
            },
            visitImportSpecifier(path){
                const importedName = path.node.imported.name
                if (importedName.indexOf('deprecat') > -1) {
                    utilities.push({
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                    console.log('ImportSpecifier',{
                        file: visitingFile,
                        line: path.node.loc.start.line
                    })
                }
                return false
            }
        })
    })

    asts.forEach(({ file, ast }) => {
        // console.log(`Searching for utilities imports in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            // Imported elements, possibly utils
            visitThrowStatement(path){
                recast.visit(path, {
                    visitLiteral(path) {
                        if (path.node.value && path.node.value.indexOf && path.node.value.indexOf('deprecat') > -1) {
                            consoleMessages.push({
                                file: visitingFile,
                                line: path.node.loc.start.line
                            });
                            console.log('ThrowStatement',{
                                file: visitingFile,
                                line: path.node.loc.start.line
                            })
                        }
                        return false
                    }
                })
                return false
            }
        })
    })

    const allLocations = search.searchAllLocations(NPM_PATH)
    const allFilesContent = allLocations.map(location => ({
        file: location.file,
        content: search.getFileContent(location.file)
    }))
    const allAsts = allFilesContent.map(({ file, content }) => ({
        file,
        ast: flowParser.parse(content, {})
    }))

    allAsts.forEach(({ file, ast }) => {
        // console.log(`Searching for prefixes in ${file}.`)
        visitingFile = file;
        recast.visit(ast, {
            // Prefixes
            visitIdentifier(path){
                const index = path.node.name.indexOf('_')
                if(index > 0) {
                    const prefix = path.node.name.substring(0, index+1)
                    identifiers.push({
                        file: visitingFile,
                        prefix
                    })
                    identifiersCount[prefix] = identifiersCount[prefix] ? identifiersCount[prefix] + 1 : 1
                }
                return false
            }
        })
    })

    consoleMessages.forEach(occurrence => {
        const projectName = occurrence.file.split('/')[4]
        projects[projectName].console = projects[projectName].console + 1

    })

    utilities.forEach(occurrence => {
        const projectName = occurrence.file.split('/')[4]
        projects[projectName].utility = projects[projectName].utility + 1

    })

    identifiers.forEach(occurrence => {
        const projectName = occurrence.file.split('/')[4]
        if (projects[projectName]) {
            projects[projectName].prefix[occurrence.prefix] = projects[projectName].prefix[occurrence.prefix] ? projects[projectName].prefix[occurrence.prefix] + 1 : 1
        }
    })

    const identifiersArray = Object.keys(identifiersCount).map(identifierKey => {
        return {
            identifier: identifierKey,
            count: identifiersCount[identifierKey]
        }
    }).sort((i1, i2) => i1.count - i2.count)
    
    const projectsArray = Object.keys(projects).map(projectName => ({
        name: projectName,
        ...projects[projectName]
    }))

    writeToCSV(`csv/projects/projects_${new Date().getTime()}.csv`, [
        {id: 'name', title: 'name'},
        {id: 'count', title: 'count'},
        {id: 'jsdoc', title: 'jsdoc'},
        {id: 'comment', title: 'comment'},
        {id: 'console', title: 'console'},
        {id: 'utility', title: 'utility'}
    ], projectsArray)

    writeToCSV(`csv/prefix/prefix_${new Date().getTime()}.csv`, [
        {id: 'identifier', title: 'identifier'},
        {id: 'count', title: 'count'}
    ], identifiersArray)
} 

const fetchProjectList = async () => {
    // while(projects.length < AMOUNT_OF_PROJECTS) {
    // const offset = projects.length
    // const npmDependedUrl = offset > 0 ? `https://www.npmjs.com/browse/depended?offset=${offset}` : 'https://www.npmjs.com/browse/depended'
    // console.log(npmDependedUrl)
    try {
        // const { data } = await axios.get(npmDependedUrl, {
        //     headers: {
        //         'Cookie': '__cfduid=d8e7449deb2bf5204ea651bfb5c83a30d1612743927',
        //         'Cache-Control': 'no-cache',
        //         'Pragma': 'no-cache',
        //         'Expires': '0',
        //         'Connection': 'keep-alive',
        //         'Accept': '*/*'
        //     }
        // })
        // const root = parse(data)
        // const newProjects = Array.from(root.querySelectorAll('section.flex.flex-row-reverse')).map(el => {
        //     const project = {}
        //     project.name = el.querySelector('h3').rawText
        //     project.description = el.querySelector('p.lh-copy').rawText
        //     project.npmUrl = `https://www.npmjs.com${el.querySelector('a').rawAttrs.split(" ")[1].split("\"")[1]}`
        //     console.log(`Found ${project.name}`)
        //     return project
        // })
        
        const projectNames = [
            'lodash',
            'react',
            'chalk',
            'tslib',
            'request',
            'commander',
            'express',
            'moment',
            'axios',
            'react-dom',
            'prop-types',
            'fs-extra',
            'debug',
            'vue',
            'uuid',
            'async',
            'bluebird',
            'core-js',
            'classnames',
            'inquirer',
            'yargs',
            'rxjs',
            'webpack',
            'underscore',
            'typescript',
            'glob',
            'mkdirp',
            'dotenv',
            'body-parser',
            '@types/node',
            '@babel/runtime',
            'node-fetch',
            'colors',
            'minimist',
            'jquery',
            'aws-sdk',
            'semver',
            'babel-loader',
            'eslint',
            'babel-runtime',
            'redux',
            'css-loader',
            'winston',
            'rimraf',
            '@babel/core',
            'jsonwebtoken',
            'ora',
            'style-loader',
            'styled-components',
            'babel-core',
            'shelljs',
            'yeoman-generator',
            'react-redux',
            'js-yaml',
            'cheerio',
            'eslint-plugin-import',
            '@angular/core',
            'babel-eslint',
            'through2',
            'ramda',
            'file-loader',
            'vue-router',
            'eslint-plugin-react',
            '@angular/common',
            'node-sass',
            'zone.js',
            'react-router-dom',
            'reflect-metadata',
            'mongoose',
            'q',
            'handlebars',
            'html-webpack-plugin',
            '@angular/platform-browser',
            'url-loader',
            'webpack-dev-server',
            'ws',
            '@angular/compiler',
            '@angular/forms',
            'postcss-loader',
            'request-promise',
            'mongodb',
            '@angular/platform-browser-dynamic',
            'sass-loader',
            'bootstrap',
            '@angular/router',
            '@babel/preset-env',
            'gulp',
            'jest',
            'qs',
            'ejs',
            'babel-polyfill',
            'superagent',
            'object-assign',
            'mocha',
            'path',
            'autoprefixer',
            'graphql',
            'eslint-plugin-jsx-a11y',
            'cors',
            'babel-preset-es2015',
            'socket.io',
            'react-scripts',
            'redis',
            'chai',
            'immutable',
            'prettier',
            '@types/react',
            'xml2js',
            'vuex',
            'joi',
            'morgan',
            'moment-timezone',
            '@angular/animations',
            'chokidar',
            'date-fns',
            'gulp-util',
            'cookie-parser',
            'deepmerge',
            'fs',
            'yosay',
            'less',
            '@angular/http',
            'ember-cli-babel',
            'execa',
            'react-router',
            'resolve',
            '@alifd/next',
            'babel-jest',
            'postcss',
            'pg',
            'mysql',
            'ajv',
            'mini-css-extract-plugin',
            'redux-thunk',
            'query-string',
            '@material-ui/core',
            '@types/lodash',
            'whatwg-fetch',
            '@types/express',
            'marked',
            'cross-spawn',
            'eslint-loader',
            'nan',
            'loader-utils',
            'compression',
            'isomorphic-fetch',
            'mime',
            'react-dev-utils',
            'coffee-script',
            'co',
            'element-ui',
            'socket.io-client',
            'promise',
            'koa',
            'case-sensitive-paths-webpack-plugin',
            'eslint-plugin-flowtype',
            'meow',
            'babel-preset-react',
            '@typescript-eslint/parser',
            'extract-text-webpack-plugin',
            'source-map-support',
            'download-git-repo',
            '@babel/polyfill',
            'crypto-js',
            '@typescript-eslint/eslint-plugin',
            'validator',
            '@babel/preset-react',
            'babel-preset-env',
            'minimatch',
            'got',
            'webpack-manifest-plugin',
            'es6-promise',
            'postcss-flexbugs-fixes',
            'node-uuid',
            '@babel/plugin-proposal-class-properties',
            'extend',
            'babel-cli',
            'less-loader',
            'antd',
            '@types/react-dom'
        ]
        
        let projectPages = []
        
        while (projectPages.length < projectNames.length) {
            console.log(`Getting https://www.npmjs.com/package/${projectNames[projectPages.length]}`)
            const projectData = await axios.get(`https://www.npmjs.com/package/${projectNames[projectPages.length]}`)
            
            const npmUrl = projectData.config.url
            const root = parse(projectData.data)
            const project = {}
            project.name = root.querySelector('h2 span.truncate').rawText
            // project.description = newProjects[projectPages.length].description
            project.version = root.querySelector('p.truncate.black-80.f4').rawText
            project.lastPublished = root.querySelector('time').attributes.title
            project.dependents = parseInt(root.querySelectorAll('a span span')[3].rawText.replace(/,/g, ''))
            project.weeklyDownloads = parseInt(root.querySelector('p.flex-auto').rawText.replace(/,/g, ''))
            project.npmUrl = npmUrl
            project.repositoryUrl = root.querySelectorAll('a.truncate.black-80')[root.querySelectorAll('a.truncate.black-80').length-1].attributes.href
            project.isDeprecated = Boolean(root.querySelector('.bg-washed-red'))
            
            projectPages = [...projectPages, project]
            
            console.log(project)
            console.log(`${projectPages.length}/${projectNames.length}`)
        }
        
        projects = [...projectPages]
    } catch (error) {
        console.log(error)
    }
    
    
    console.log(`----- Fetched ${projects.length} projects from npm -----`)
    writeToCSV(`csv/projects/projects_${new Date().getTime()}.csv`, [
        { id: 'name', title: 'name' },
        { id: 'description', title: 'description' },
        { id: 'version', title: 'version' },
        { id: 'lastPublished', title: 'lastPublished' },
        { id: 'dependents', title: 'dependents' },
        { id: 'weeklyDownloads', title: 'weeklyDownloads' },
        { id: 'npmUrl', title: 'npmUrl' },
        { id: 'repositoryUrl', title: 'repositoryUrl' },
        { id: 'isDeprecated', title: 'isDeprecated' }
    ], projects.filter(project => project))
} 

const fetchProjects = async () => {
    const folderName = 'npm'
    
    await runCmd(`rm -rf ${folderName}`, (err, data, stderr) => {
        console.log(`----- Deleted ${folderName} folder -----`)
    })
    
    await runCmd(`mkdir ${folderName}`, (err, data, stderr) => {
        console.log(`----- Created ${folderName} folder -----`)
    })
    
    let projectsDownloadCount = 0
    const downloadErrors = []
    
    let projects = [
        'lodash',
    'react',
    'chalk',
    'commander',
    'express',
    'axios',
    'fs-extra',
    'debug',
    'vue',
    'uuid',
    'async',
    'bluebird',
    'core-js',
    'classnames',
    'inquirer',
    'yargs',
    'rxjs',
    'webpack',
    'underscore',
    'typescript',
    'glob',
    'mkdirp',
    'dotenv',
    'body-parser',
    '@babel/runtime',
    'node-fetch',
    'colors',
    'minimist',
    'jquery',
    'semver',
    'redux',
    'winston',
    'rimraf',
    'jsonwebtoken',
    'ora',
    'styled-components',
    'shelljs',
    'react-redux',
    'js-yaml',
    'cheerio',
    'through2',
    'ramda',
    'vue-router',
    'node-sass',
    'zone.js',
    'react-router-dom',
    'reflect-metadata',
    'mongoose',
    'q',
    'handlebars',
    'ws',
    'mongodb',
    'bootstrap',
    'gulp',
    'jest',
    'qs',
    'ejs',
    'superagent',
    'mocha',
    'graphql',
    'socket.io',
    'redis',
    'chai',
    'immutable',
    'xml2js',
    'vuex',
    'joi',
    'morgan',
    'chokidar',
    'date-fns',
    'cookie-parser',
    'deepmerge',
    'execa',
    'resolve',
    'pg',
    'mysql',
    'ajv',
    'redux-thunk',
    'query-string',
    '@material-ui/core',
    'whatwg-fetch',
    'marked',
    'cross-spawn',
    'nan',
    'loader-utils',
    'compression',
    'isomorphic-fetch',
    'mime',
    'co',
    'element-ui',
    'socket.io-client',
    'promise',
    'koa',
    'meow',
    'download-git-repo',
    'crypto-js',
    'validator',
    'got',
    'extend',
    'antd']
    
    // await runCmd('rm -rf git && mkdir git')
    
    for (let i = 0; i < projects.length; i++) {
        let project = projects[i]
        console.log(`Starting ${project} download.`)
        
        await runCmd(
            `npm install ${project} -g --prefix ./npm`,
            // `cd git && git clone ${project.repositoryUrl}.git`,
            (err, data, stderr) => {
                if(err) {
                    downloadErrors.push({
                        project,
                        err
                    })
                    console.log(`
                    
                    ----- Error on ${project} -----
                    
                    ${err}
                    
                    `)
                    return
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`)
                }
                if (data) {
                    console.log(`${data}
                    ----- Download complete: ${project} -----                        
                    `)
                    projectsDownloadCount++
                }
            }
            )
            console.log(`
            ${projectsDownloadCount} projects downloaded so far.
            `)
        }
        console.log('Download Errors', downloadErrors)
        
    }
    
    const fetchGitHubUsers = async () => {
        console.log('Getting ready...')
        for (let contributionsCount = 31; contributionsCount > -1; contributionsCount--) {
            console.log(`Requesting users with ${contributionsCount} contributions.`)
            const filePrefix = `github_users_${contributionsCount}_${new Date().getTime()}`
            let users = 0
            for (let page = 1; page < 11; page++) {
                console.log('Request #', page)
                const url = 'https://api.github.com/search/users'
                
                const [githubUsersResponse] = await Promise.all([axios({
                    method: 'GET',
                    url,
                    headers,
                    auth,
                    params: {
                        q: `repos:>10 language:javascript type:user followers:0..${contributionsCount}`,
                        per_page: 100,
                        page,
                        sort: 'followers',
                        order: 'desc'
                    }
                }), timeout(0)]);
                
                const { data: { items } } = githubUsersResponse
                console.log('Search complete!')
                const userURLs = items.map(user => user.url)
                
                let responses = []
                for (let i = 0; i < userURLs.length; i++) {
                    let currentUserUrl = userURLs[i]
                    
                    console.log(`Requesting ${i+1}th user (${currentUserUrl}) from page ${page}.`)
                    let [currentUserResponse] = await Promise.all([axios({
                        method: 'GET',
                        url: currentUserUrl,
                        headers,
                        auth
                    }), timeout(1000)]);
                    
                    responses = [...responses, currentUserResponse]
                }
                
                console.log('Users request complete!')
                const userEmails = responses.map(response => ({
                    login: response.data.login,
                    url: response.data.url,
                    html_url: response.data.html_url,
                    name: response.data.name,
                    email: response.data.email,
                    bio: response.data.bio,
                    followers: response.data.followers
                })).filter(user => user.email)
                users = users + userEmails.length
                const usersWithEmail = [...userEmails]
                console.log(`We found ${usersWithEmail.length}, users with email on this request.`)
                console.log(`Writing to csv/github_users/${filePrefix}_${page}.csv file...`)
                console.log(`We have ${users} users so far.`)
                writeToCSV(`csv/github_users/${filePrefix}_${page}.csv`, [
                    {id: 'login', title: 'login'},
                    {id: 'url', title: 'url'},
                    {id: 'html_url', title: 'html_url'},
                    {id: 'name', title: 'name'},
                    {id: 'email', title: 'email'},
                    {id: 'bio', title: 'bio'},
                    {id: 'followers', title: 'followers'}
                ], usersWithEmail)
            }
        }
    }
    
    const getEmails = async () => {
        const directoryPath = path.join(__dirname, 'csv/github_users')
        fs.readdir(directoryPath, async function (err, files) {
            if (err) {
                return console.log('Unable to scan directory: ' + err)
            }
            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                const file = files[fileIndex]
                console.log(`Checking ${file}`)
                const csvFilePath = `${directoryPath}/${file}`
                const users = await csv().fromFile(csvFilePath)
                const eligibleUsers = []
                for (let userIndex = 0; userIndex < users.length; userIndex++) {
                    const user = users[userIndex]
                    try {
                        const [response] = await Promise.all([axios.get(user.html_url), timeout(2000)])
                        const { data: userPage } = response;
                        const htmlPage = parse(userPage)
                        user.contributions = parseInt(htmlPage.querySelector('.js-yearly-contributions h2').rawText.replace(/\D/g,''))
                        console.log(`${user.name} has ${user.contributions} contributions.`)
                        // if (user.contributions >= 50) {
                        eligibleUsers.push(user)
                        // }
                    } catch (error) {
                        console.log(`*** Error fetching ${user.html_url} ***`)
                    }
                }
                writeToCSV(`csv/github_users_eligible/${file}`, [
                    {id: 'login', title: 'login'},
                    {id: 'url', title: 'url'},
                    {id: 'html_url', title: 'html_url'},
                    {id: 'name', title: 'name'},
                    {id: 'email', title: 'email'},
                    {id: 'bio', title: 'bio'},
                    {id: 'followers', title: 'followers'},
                    {id: 'contributions', title: 'contributions'}
                ], eligibleUsers)
            }
        })
    }
    
    const init = async () => {
        // await fetchProjectList()
        // await fetchProjects()
        parseProjects()
        // fetchGitHubUsers()
        // getEmails()
    }
    
    console.log('Starting...')
    init()