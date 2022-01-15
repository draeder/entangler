const Gun = require('gun')
const prompt = require('readline-sync')
require('./index')

let gun = new Gun()

// By alias
gun.entangler('~@...')

// By pub key (no prepending '~')
//gun.entangler(pubkey)

let passcode = prompt.question('Enter your pin + token: ')

gun.entangler.request(passcode)

gun.events.once('authorized', (sea)=>{
  gun.user().auth(sea)
})

gun.on('auth', ack => {
  console.log('Authenticated!!')
})

gun.events.on('error', err => {
  if(err) console.log(err)
  let passcode = prompt.question('Pleae try again: ')
  gun.entangler.request(passcode)
})