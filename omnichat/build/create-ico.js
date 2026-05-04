const pngToIco = require('png-to-ico')
const fs = require('fs')
const path = require('path')

const srcPath = path.join(__dirname, '..', 'Stepwell_Chat_icon.png')
const icoPath = path.join(__dirname, 'icon.ico')

pngToIco.default(srcPath)
  .then(function(buf) {
    fs.writeFileSync(icoPath, buf)
    console.log('icon.ico created successfully!')
  })
  .catch(function(err) {
    console.error('Error:', err)
    process.exit(1)
  })
