const fs = require('fs');
const path = require('path')
const esprima = require('esprima');
const flowParser = require('flow-parser');

const REGEX = /(@deprecated|deprecated|deprecate)/gmi

const isJSFile = filePath => {
    const extension = path.extname(filePath)
    return Boolean(extension.match(/\.jsx?\b/))
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

const jsFilesCount = rootPath => {
    let count = 0;
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            count = count + jsFilesCount(file.path)
        } else if (isJSFile(file.path)) {
            count++;
        }
    })
    return count
}

const keywordsSearch = (rootPath, regex = REGEX) => {
    const keywordsOcurrencies = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            keywordsSearch(file.path).map(keywordsOcurrency => keywordsOcurrencies.push(keywordsOcurrency))
        } else if (isJSFile(file.path)) {
            console.log(`Searching any keywords in ${file.path}`)
            const fileContent = getFileContent(file.path)
            const keywordsOcurrency = fileContent.match(regex)
            if (keywordsOcurrency) {
                keywordsOcurrencies.push({
                    file: file.path,
                    matches: [...keywordsOcurrency]
                })
            }
        }
    })
    return keywordsOcurrencies
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

const searchOccurences = keywordsOcurrencies => {
    const occurrenciesMap = new Map()
    const ASTs = []
    const errorFiles = []
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
            const AST = flowParser.parse(fileContent, {})
            const locations = searchLocations(AST)
            ASTs.push({
                filePath: keywordsOcurrency.file,
                locations
            })
        } catch (error) {
            console.log(error)
            errorFiles.push(keywordsOcurrency.file)
        }
    })

    return {
        occurrenciesMap,
        ASTs,
        errorFiles
    }
}

const projectsOccurencies = (keywordsOcurrencies, occurrenciesMap) => {
    const projectOccurrenciesMap = new Map()
    keywordsOcurrencies.map((keywordsOcurrency, index, array) => {
        let project = ''
        const projectName = keywordsOcurrency.file.substring(23)
        // if (projectName.indexOf('@') == 0) {
        //     project = projectName.substring(0, projectName.indexOf('/', projectName.indexOf('/') + 1))
        // } else {
            project = projectName.substring(0, projectName.indexOf('/'))
        // }
        if (!projectOccurrenciesMap.has(project)) {
            projectOccurrenciesMap.set(project, new Map([]))
            Array.from(occurrenciesMap.keys()).map(key => {
                projectOccurrenciesMap.get(project).set(key, 0)
            })
        }
        keywordsOcurrency.matches.map(match => {
            const lowerCaseMatch = match.toLowerCase()
            projectOccurrenciesMap.get(project).set(lowerCaseMatch, projectOccurrenciesMap.get(project).get(lowerCaseMatch) + 1)
        })
    })
    const projectsOccurencies = Array.from(projectOccurrenciesMap.keys()).map(project => {
        const projects = {
            project
        }
        Array.from(projectOccurrenciesMap.get(project).keys()).map(occ => {
            projects[occ] = projectOccurrenciesMap.get(project).get(occ)
        })
        return projects
    })
    return projectsOccurencies
}

module.exports = {
    jsFilesCount,
    keywordsSearch,
    searchOccurences,
    projectsOccurencies
}