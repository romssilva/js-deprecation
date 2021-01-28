const axios = require('axios')
const { parse } = require('node-html-parser')
const cmd = require('node-cmd')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const csv = require('csvtojson')
const path = require('path')
const fs = require('fs')

const search = require('./search')

const AMOUNT_OF_PROJECTS = 100
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
    // await fetchProjects()
    // parseProjects()
    // fetchGitHubUsers()
    // getEmails()
}

console.log('Starting...')
init()