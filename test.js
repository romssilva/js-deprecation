const fs = require('fs');
const path = require('path')
const esprima = require('esprima');

const isJSFile = filePath => {
    const extension = path.extname(filePath)
    return Boolean(extension.match(/\.jsx?\b/))
}

const getAST = rootPath => {
    const ASTs = [];
    const files = getFilesFromDirectory(rootPath)
    files.map(file => {
        if (file.isDirectory) {
            ASTs.push(getAST(file.path))
        } else if (isJSFile(file.path)) {
            const fileContent = getFileContent(file.path)
            const AST = esprima.parseModule(fileContent, {comment: true, jsx: true})
            ASTs.push({
                filePath: file.path,
                ast: AST
            })
        }
    })
    return ASTs;
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

const ASTs = getAST('./folder');
const fileName = `asts/asts_${new Date().getTime()}.json`
const jsonASTs = JSON.stringify(ASTs, null, 2);
fs.writeFile(fileName, jsonASTs, err => {
    if (err) console.log(err);
    console.log(`Done! ${ASTs.length} files parsed.`);
})