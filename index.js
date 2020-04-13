const axios = require('axios')
const { parse } = require('node-html-parser')
const cmd = require('node-cmd')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const search = require('./search')

const AMOUNT_OF_PROJECTS = 100

let projects = []

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
    const PATH = './npm/lib/node_modules'
    const fileCount = search.jsFilesCount(PATH)

    const occurencies = search.keywordsSearch(PATH)
    writeToCSV(`csv/ocurrencies/ocurrencies_${new Date().getTime()}.csv`, [
        {id: 'file', title: 'FILE PATH'},
        {id: 'matches', title: 'MATCHES'}
    ], occurencies)
    
    const occurenciesASTS = search.searchOccurences(occurencies)
    const projectsInfo = search.projectsOccurencies(occurencies, occurenciesASTS.occurrenciesMap)
    writeToCSV(`csv/projects/projects_${new Date().getTime()}.csv`, [
        {id: 'project', title: 'PROJECT'},
        {id: '@deprecated', title: '@deprecated'},
        {id: 'deprecated', title: 'deprecated'},
        {id: 'deprecate', title: 'deprecate'}
    ], projectsInfo)
    
    console.log(`${occurencies.length} files of ${fileCount} found.`)
    console.log(occurenciesASTS.occurrenciesMap)
    console.log(`Total of ${Array.from(occurenciesASTS.occurrenciesMap.values()).reduce((a, b) => a + b, 0)} occurrencies.`)
    console.log(`Failed parsing ${occurenciesASTS.errorFiles.length} files.`)
    occurenciesASTS.ASTs.map(ast => ast.locations.map(loc => {
        if (loc.loc) {
            // console.log(loc.loc)
        } else {
            console.log(loc)
        }
    }))

} 

const fetchProjects = async () => {
    while(projects.length < AMOUNT_OF_PROJECTS) {
        const offset = projects.length
        const npmDependedUrl = offset ? `https://www.npmjs.com/browse/depended?offset=${offset}` : 'https://www.npmjs.com/browse/depended'
        const { data } = await axios.get(npmDependedUrl)
        const root = parse(data)
        const newProjects = Array.from(root.querySelectorAll('.flex.flex-row.items-end')).map(el => {
            const project = {}
            project.name = el.querySelector('h3').rawText
            project.npmUrl = `https://www.npmjs.com${el.querySelector('a').rawAttrs.split(" ")[1].split("\"")[1]}`
            return project
        })
        projects = [...projects, ...newProjects]
    }

    projects = projects.splice(0, AMOUNT_OF_PROJECTS)

    console.log(`----- Fetched ${projects.length} projects from npm -----`)

    const folderName = 'npm'

    await runCmd(`rm -rf ${folderName}`, (err, data, stderr) => {
        console.log(`----- Deleted ${folderName} folder -----`)
    })

    await runCmd(`mkdir ${folderName}`, (err, data, stderr) => {
        console.log(`----- Created ${folderName} folder -----`)
    })
    
    let projectsDownloadCount = 0
    const downloadErrors = []
    
    for (let i = 0; i < projects.length; i++) {
        let project = projects[i]
        console.log(`Starting ${project.name} download.`)
        
        await runCmd(
            `npm install ${project.name} -g --prefix ./npm`,
            (err, data, stderr) => {
                if(err) {
                    downloadErrors.push({
                        project,
                        err
                    })
                    console.log(`

                    ----- Error on ${project.name} -----

                    ${err}

                    `)
                    return
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`)
                }
                if (data) {
                    console.log(`${data}
                        ----- Download complete: ${project.name} -----                        
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

const init = async () => {
    // await fetchProjects()
    parseProjects()
}

console.log('Starting...')
init()