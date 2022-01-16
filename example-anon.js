const Gun = require('gun')
const prompt = require('readline-sync')
require('./index')

let gun = new Gun()

// Look up user by alias
gun.entangler('~@A secure username123')

// Look up user by pub key (no prepending '~')
//gun.entangler(pubkey)

let passcode = prompt.question('Enter your pin + token: ')

gun.entangler.verify(passcode)

gun.entangler.once('authorized', (sea)=>{
  gun.user().auth(sea)
})

gun.on('auth', ack => {
  console.log('Authenticated!!')
})

gun.entangler.on('error', err => {
  if(err) console.log(err)
  if(err.code === 401){
    let passcode = prompt.question('Pleae try again: ')
    gun.entangler.verify(passcode)
  }
})