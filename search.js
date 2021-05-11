const fs = require('fs');
const path = require('path')
const esprima = require('esprima');
const flowParser = require('flow-parser');

const REGEX = /deprecat/gmi

const isJSFile = filePath => {
    const extension = path.extname(filePath)
    return Boolean(extension.match(/\.jsx?\b/))
}

const isMinFile = filePath => {
    const pathParts = filePath.split('/')
    const fileName = pathParts[pathParts.length - 1]
    const isMinFile = fileName.indexOf('.min.js') > -1
    const isBundleFile = fileName.indexOf('.bundle.js') > -1
    const fileContent = getFileContent(filePath)
    const hasMinStart = fileContent.indexOf('!function(') == 0
    const hasFewLines = fileContent.split('\n').length < 3

    return isMinFile || isBundleFile || hasMinStart || hasFewLines
}

const getFilesFromDirectory = (directory, onFileContent, onError) => {
    try {
        const files = fs.readdirSync(directory);
        const paths = files.map(file => `${directory}/${file}`);
        return paths.map(path => {
            const isDirectory = fs.statSync(path).isDirectory()
            if (isDirectory && path.substring(23).split('/').includes('node_modules')) {
                return null
            }

            return ({
                path,
                isDirectory
            })
        }).filter(path => !!path);
    } catch (error) {
        return []
    }
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
    const keywordsOccurrences = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            keywordsSearch(file.path).map(keywordsOccurrence => keywordsOccurrences.push(keywordsOccurrence))
        } else if (isJSFile(file.path) && !isMinFile(file.path)) {
            console.log(`Searching any keywords in ${file.path}`)
            const fileContent = getFileContent(file.path)
            const keywordsOccurrence = fileContent.match(regex)
            if (keywordsOccurrence) {
                keywordsOccurrences.push({
                    file: file.path,
                    matches: [...keywordsOccurrence]
                })
            }
        }
    })
    return keywordsOccurrences
}

const searchAllLocations = (rootPath) => {
    const keywordsOccurrences = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            searchAllLocations(file.path).map(keywordsOccurrence => keywordsOccurrences.push(keywordsOccurrence))
        } else if (isJSFile(file.path) && !isMinFile(file.path)) {
            keywordsOccurrences.push({
                file: file.path
            })
        }
    })
    return keywordsOccurrences
}

let allFilesCount = 0;

const projectSearch = (rootPath, regex = REGEX, projects = {}) => {
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            const folderFindings = projectSearch(file.path, REGEX, projects)
            projects = {
                ...projects,
                ...folderFindings
            }
        } else if (isJSFile(file.path) && !isMinFile(file.path)) {
            // console.log(`Searching any keywords in ${file.path}`)
            allFilesCount++;
            let projectName = file.path.split('/')[4] || ''
            if (projectName.indexOf('@') === 0) {
                projectName = projectName + '/' + (file.path.split('/')[5] || '')
            }
            const fileContent = getFileContent(file.path)
            const occurrences = fileContent.match(regex)
            if (occurrences) {
                console.log(`Searching any keywords in ${file.path}`)
                projects = {
                    ...projects,
                    [projectName]: projects[projectName] ? projects[projectName] + occurrences.length : occurrences.length
                }
            }
        }
    })
    return {
        ...projects,
        allFilesCount
    }
}

const searchLocations = (obj, parent) => {
    const locations = []
    if (obj) {
        Object.keys(obj).map(key => {
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
    }
    return locations
}
const searchLocations2 = (obj, parents) => {
    const locations = []
    if (obj) {
        Object.keys(obj).map(key => {
            if (typeof obj[key] === 'object' && obj[key] && typeof obj[key].length === 'number') {
                obj[key].map(arrayObj => searchLocations2(arrayObj, [obj[key], parents[0]]).map(resObj => locations.push(resObj)))
            } else if (typeof obj[key] === 'object' && obj[key] && typeof obj[key].length === 'undefined') {
                searchLocations2(obj[key], [obj, parents[0]]).map(resObj => locations.push(resObj))
            } else {
                const value = String(obj[key])
                const matches = value.match(REGEX)
                if (matches && key != 'raw') {
                    locations.push([...parents])
                }
            }
        })
    }
    return locations
}

const searchOccurrences = keywordsOcurrencies => {
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
            const locations = searchLocations2(AST, [])
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

const projectsOccurrences = (keywordsOcurrencies, occurrenciesMap) => {
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
    const projectsOccurrences = Array.from(projectOccurrenciesMap.keys()).map(project => {
        const projects = {
            project
        }
        Array.from(projectOccurrenciesMap.get(project).keys()).map(occ => {
            projects[occ] = projectOccurrenciesMap.get(project).get(occ)
        })
        return projects
    })
    return projectsOccurrences
}

const getLocationASTs = PATH => {
    const occurrences = keywordsSearch(PATH)
    return searchOccurrences(occurrences)
} 

const JSDoc = rootPath => {
    const JS_DOC_REGEX = /@deprecated/gmi
    const jsDocOccurrencies = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            JSDoc(file.path).map(occurrencies => jsDocOccurrencies.push(occurrencies))
        } else if (isJSFile(file.path) && !isMinFile(file.path)) {
            console.log(`Searching JSDoc occurrences in ${file.path}`)
            const fileContent = getFileContent(file.path)
            
            const AST = flowParser.parse(fileContent, {})
            const occurrencesInFile = AST.comments.filter(({ value = '' }) => {
                const location = value.match(JS_DOC_REGEX) || []
                return location.length
            }) || []

            if (occurrencesInFile.length) {
                occurrencesInFile.forEach(({ loc }) => {
                    jsDocOccurrencies.push({
                        file: file.path,
                        lineStart: loc.start.line,
                        lineEnd: loc.end.line,
                        context: 'Comment',
                        category: 'JSdoc annotation'
                    })
                })
            }
        }
    })
    return jsDocOccurrencies
}

const comments = rootPath => {
    const occurrences = keywordsSearch(rootPath, /deprecate/gmi)

    const commentsOccurrences = []
    const errorFiles = []
    occurrences.map((occurrence, index, array) => {
        console.log(`Parsing file ${index+1} of ${array.length}`)
        const fileContent = getFileContent(occurrence.file)
        try {
            const AST = flowParser.parse(fileContent, {})
            
            const commentsWithOccurrences = AST.comments.filter(({ value }) => {
                const commentWithNoJSDoc = value.replace('@deprecate', '').replace('@Deprecate', '')
                return commentWithNoJSDoc.toLowerCase().indexOf('deprecat') > -1
            })

            if (commentsWithOccurrences.length) {
                commentsWithOccurrences.forEach(({value: comment, loc}) => {
                    const commentWithNoJSDoc = comment.replace('@deprecate', '')
                    const occurrences = commentWithNoJSDoc.match(REGEX)
                    if (occurrences.length) {
                        for (let i = 0; i < occurrences.length; i++) {
                            commentsOccurrences.push({
                                file: occurrence.file,
                                lineStart: loc.start.line,
                                lineEnd: loc.end.line,
                                context: 'Comment',
                                category: 'Code comment'
                            })
                        }
                    }
                })
            }
        } catch (error) {
            console.log(error)
            errorFiles.push(occurrence.file)
        }
    })

    return commentsOccurrences
}

const consoleMessage = rootPath => {
    const occurrences = keywordsSearch(rootPath, /deprecate/gmi)

    const consoleMessagesOccurrences = []
    const errorFiles = []
    occurrences.map((occurrence, index, array) => {
        console.log(`Parsing file ${index+1} of ${array.length}`)
        const fileContent = getFileContent(occurrence.file)
        try {
            const AST = flowParser.parse(fileContent, {})
            
            const occurrencesInFile = AST.comments.filter(({ value }) => {
                const location = value.search('deprecate')
                return location > -1 && value[location-1] != '@'
            })

            if (occurrencesInFile.length) {
                consoleMessagesOccurrences.push({
                    file: occurrence.file,
                    matches: occurrencesInFile.length
                })
            }
        } catch (error) {
            console.log(error)
            errorFiles.push(occurrence.file)
        }
    })

    return commentsOccurrences
}

module.exports = {
    jsFilesCount,
    keywordsSearch,
    searchOccurrences,
    projectsOccurrences,
    getLocationASTs,
    JSDoc,
    comments,
    getFileContent,
    projectSearch,
    searchAllLocations
}