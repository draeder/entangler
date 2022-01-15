const Gun = require('gun')
require('./')

let gun = new Gun()
let user = gun.user()

// create new user or authenticate existing one
let username = '...' // A secure username
let password = '.....' // A secure password

user.create(username, password, cb => {
  user.auth(username, password)
})

gun.on('auth', async ack => {
  console.log('Authenticated')

  // Create an Entanglement instance
  gun.entanglement(ack.sea, {user: username, secret: password})

  // Return the whole Entanglement object
  console.log(await gun.entanglement)

  // Return the OTP auth URI QR code image
  console.log(await gun.entanglement.QR.image())

  // Print the OTP auth URI QR code to the terminal in ASCII
  console.log(await gun.entanglement.QR.terminal())

  // Get the current token
  console.log(await gun.entanglement.token())

  // Get tokens as they are generated
  gun.entanglement.tokens(token => {
    console.log(token)
  })

})
