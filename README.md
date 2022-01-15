# Entangler
A time-based one-time password (TOTP) generator and authenticator for Gun DB

Entangler generates a 6 digit passcode every 30 seconds. It generates an `otpauth://` URI and QR codes (both console and image) that can be linked with popular authenticator apps like Microsoft Authenticator, Google Authenticator, LastPass--and many others. But it is not limited to big tech authenticator apps.

## About
### How it works
Entangler generates a new token every 0 and 30 seconds of of every passing minute. When a peer passes in the correct token for that 30 second window, entangler will respond with the source instance's Gun SEA pair. The returned SEA pair may be used to sync Gun user accounts, reset passwords, or other purposes that might depend on passing SEA data over the network to another peer.

Entangler uses Bugoff (an extension built on Bugout) which also uses Gun's SEA suite to securely exchange ephemeral messages between peers without the need to store data in the Gun DB graph.

## Usage
### Install
```js
> npm i entangler
```

### Initiator example
```js
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

  // Create an entangler instance
  gun.entangler(ack.sea, {user: username, secret: password})

  // Return the whole entangler object
  console.log(await gun.entangler)

  // Return the OTP auth URI QR code image
  console.log(await gun.entangler.QR.image())

  // Print the OTP auth URI QR code to the terminal in ASCII
  console.log(await gun.entangler.QR.terminal())

  // Get the current token
  console.log(await gun.entangler.token())

  // Get tokens as they are generated
  gun.entangler.tokens(token => {
    console.log(token)
  })

})
```

### Peer example
```js
const Gun = require('gun')
const prompt = require('readline-sync')
require('./index')

let gun = new Gun()

// By alias
gun.entangler('~@alias')

// By pub key (no prepending '~')
gun.entangler(pubkey)

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
```

## API
Entangler's optional `opts` object can be tailored to aid in securing it further.

### `opts`
#### `opts.address = [string]` default = Gun.SEA.pair().pub
`opts.address` is an optional string that may be passed in as an identifier for peers to swarm around and connect to each other. It is converted to a SHA256 hash and announced to the Webtorrent network via Bugoff, which further hashes that hash to SHA256.

#### `opts.issuer = [string]` default = 'entangler Authenticator'
A TOTP issuer is used to describe the TOTP instance to authenticator apps.

#### `opts.user = [string]` default = randomly generated Base32 string
You may pass in your own string for `opts.user`. This is the TOTP user ID, which gets converted to a Base32 encoded SHA256 hash of the passed in string.

#### `opts.secret = [string]` default = randomly generated Base32 string
You may pass in your own string for `opts.password`. This is the TOTP secret, which gets converted to a Base32 encoded SHA256 hash of the passed in string.

#### `opts.pin = [string || number]` default = ''
You may supply a pin, which can be either a string or a number, as an optional additional security measure to protect the entangler instance.

#### `opts.timeout = [msec]` default = 5 minutes (1000 * 60 * 5 msec )
The amount of time in milliseconds since this peer's first passcode entry attempt. Once this timeout has been met or exceeded, this peer can no longer make attempts. 

> Note: A peeer may try again by establishing a new connection.

#### `opts.maxAttempts = [number]` default = 10
The maximum attempts for a peer to enter incorrect passcodes.
