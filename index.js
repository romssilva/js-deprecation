const fs = require('fs');
const path = require('path')
const esprima = require('esprima');
const DEBUGGING = true;
const WRITE = true;
const FILE_NAME_ASTS = `asts/asts_${new Date().getTime()}.json`
const FILE_NAME_KEYWORDS = `keywords/keywords_${new Date().getTime()}.json`
const REGEX = /(deprecated|deprecate|obsolete|unsafe|unstable|(was|has been|will be) (renamed|moved|removed|deleted|replaced))/gmi
// const REGEX = /(deprecate|obsolete|unsafe|unstable|(was|has been|will be) (renamed|moved|removed|deleted|replaced))/gm
const errorFiles = []
const occurrenciesMap = new Map()

const debug = msg => {
    DEBUGGING && console.log(msg)
}

const isJSFile = filePath => {
    const extension = path.extname(filePath)
    return Boolean(extension.match(/\.jsx?\b/))
}

const getAST = rootPath => {
    const ASTs = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        debug(file.path)
        if (file.isDirectory) {
            getAST(file.path).map(ast => ASTs.push(ast))
        } else if (isJSFile(file.path)) {
            const fileContent = getFileContent(file.path)
            const AST = esprima.parseModule(fileContent, {comment: true, jsx: true})
            ASTs.push({
                filePath: file.path,
                comments: AST.comments
            })
        }
    })
    return ASTs;
}

const keywordsSearch = rootPath => {
    const keywordsOcurrencies = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            keywordsSearch(file.path).map(keywordsOcurrency => keywordsOcurrencies.push(keywordsOcurrency))
        } else if (isJSFile(file.path)) {
            console.log(`Searching any keywords in ${file.path}`)
            const fileContent = getFileContent(file.path)
            const keywordsOcurrency = fileContent.match(REGEX)
            if (keywordsOcurrency) {
                keywordsOcurrencies.push({
                    file: file.path,
                    matches: [...keywordsOcurrency]
                })
            }
        }
    })
    return keywordsOcurrencies;
}

const getFilesFromDirectory = (directory, onFileContent, onError) => {
    const files = fs.readdirSync(directory);
    const paths = files.map(file => `${directory}/${file}`);
    return paths.map(path => ({
        path,
        isDirectory: fs.statSync(path).isDirectory()
    }));
}

const getFileContent = filePath => {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return fileContent;
}

// const ASTs = getAST('./projects');
// const jsonASTs = JSON.stringify(ASTs, null, 2);
// fs.writeFile(FILE_NAME_ASTS, jsonASTs, err => {
//     if (err) console.log(err);
//     console.log(`Done! ${ASTs.length} files parsed.`);
// })

const keywordsOcurrencies = keywordsSearch('./projects');
const jsonKeywordsOcurrencies = JSON.stringify(keywordsOcurrencies, null, 2);
if (WRITE) {
    fs.writeFile(FILE_NAME_KEYWORDS, jsonKeywordsOcurrencies, err => {
        if (err) console.log(err);
        console.log(`Done! ${keywordsOcurrencies.length} files found.`);
    })
}

const searchLocations = (obj, parent) => {
    const locations = []
    obj && Object.keys(obj).map(key => {
        if (typeof obj[key] === 'object' && obj[key] && typeof obj[key].length === 'number') {
            obj[key].map(arrayObj => searchLocations(arrayObj, obj[key]).map(resObj => locations.push(resObj)))
        } else if (typeof obj[key] === 'object' && obj[key] && typeof obj[key].length === 'undefined') {
            searchLocations(obj[key], obj).map(resObj => locations.push(resObj))
        } else {
            const value = String(obj[key])
            const matches = value.match(REGEX)
            if (matches) {
                locations.push({...parent})
            }
        }
    })
    return locations
}

const ASTs = []
keywordsOcurrencies.map((keywordsOcurrency, index, array) => {
    keywordsOcurrency.matches.map(match => {
        const lowerCaseMatch = match.toLowerCase()
        if (occurrenciesMap.has(lowerCaseMatch)) {
            occurrenciesMap.set(lowerCaseMatch, occurrenciesMap.get(lowerCaseMatch) + 1)
        } else {
            occurrenciesMap.set(lowerCaseMatch, 1)
        }
    })
    console.log(`Parsing file ${index+1} of ${array.length}`)
    const fileContent = getFileContent(keywordsOcurrency.file)
    try {
        const AST = esprima.parseModule(fileContent, {comment: true, jsx: true})
        const locations = searchLocations(AST)
        ASTs.push({
            filePath: keywordsOcurrency.file,
            locations
        })
    } catch (error) {
        errorFiles.push(keywordsOcurrency.file)
    }
})

const jsonASTs = JSON.stringify(ASTs, null, 2);
if (WRITE) {
    fs.writeFile(FILE_NAME_ASTS, jsonASTs, err => {
        if (err) console.log(err);
        console.log(`Done! ${ASTs.length} files parsed. ${errorFiles.length} files (${(errorFiles.length/ASTs.length)*100}%) failed parsing.`);
    })
}

console.log(occurrenciesMap)
