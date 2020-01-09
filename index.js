const axios = require('axios')
const { parse } = require('node-html-parser')

const AMOUNT_OF_PROJECTS = 100

let projects = []

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
}

fetchProjects()