const utils = require('./utils.js');
const fs = require('fs');

let renders = {
    // will be filled later
};

module.exports = {
    create: (categoryId, blob) => {
        let artifactId = utils.make('artifactId');
        while(fs.existsSync('./storage/artifacts/'+categoryId+'_'+artifactId+'.json')) artifactId = utils.make('artifactId');
        fs.writeFileSync('./storage/artifacts/'+categoryId+'_'+artifactId+'.json', JSON.stringify(blob), 'utf8');
        if(global.jbg.artifacts.uploadEnabled){
            request({
                method: 'POST',
                url: global.jbg.artifacts.uploadUrl+'?categoryId='+categoryId+'&artifactId='+artifactId,
                headers: {
                    'x-internal-token': global.jbg.internalToken
                },
                json: true,
                body: blob
            }, (error, response, body) => {
                if(response.statusCode === 200) console.log('Artifact '+artifactId+' uploaded');
                else console.log('Artifact '+artifactId+' upload error: '+response.statusCode);
            });
        }
        return artifactId;
    },
    get: (categoryId, artifactId) => {
        if(fs.existsSync('./storage/artifacts/'+categoryId+'_'+categoryId+'.json')){
            return JSON.parse(fs.readFileSync('./storage/artifacts/'+categoryId+'_'+artifactId+'.json', 'utf8'));
        }else return null;
    },
    render: (categoryId, artifactId) => {
        if(fs.existsSync('./storage/artifacts/'+categoryId+'_'+categoryId+'.json')){
            let blob = JSON.parse(fs.readFileSync('./storage/artifacts/'+categoryId+'_'+artifactId+'.json', 'utf8'));
            return renders[categoryId] ? renders[categoryId](blob) : null;
        }else return null;
    },
    renders: Object.keys(renders)
}
