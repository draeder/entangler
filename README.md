# Entangler
A time-based one-time password (TOTP) generator and authenticator for Gun DB

Entangler generates a 6 digit passcode every 30 seconds. It generates an `otpauth://` URI and QR codes (both console and image) that can be linked with popular authenticator apps like Microsoft Authenticator, Google Authenticator, LastPass--and many others. But it is not limited to big tech authenticator apps.

## About
### How it works
Entangler generates a new token every 0 and 30 seconds of of every passing minute. When a peer passes in the correct token for that 30 second window, entangler will respond with the source instance's Gun SEA pair. The returned SEA pair may be used to sync Gun user accounts, reset passwords, or other purposes that might depend on passing SEA data over the network to another peer.

Entangler uses [Bugoff](https://github.com/draeder/bugoff) (an extension built on [Bugout](https://github.com/chr15m/bugout)) which also uses Gun's SEA suite to securely exchange ephemeral messages between peers without the need to store data in the Gun DB graph.

## Usage
### Install
```js
> npm i entangler
```

## Examples
### Initiator Peer Instance
This is an example of creating and authenticating a Gun user, then creating an Entangler instance. The insance does not necessarily need to be an existing user. Engangler will accept any SEA pair, for example one created with `Gun.SEA.pair()`

```js
const Gun = require('gun')
require('entangler')

let gun = new Gun()
let user = gun.user()

// Create new Gun user or authenticate existing one
let username = '...' // A secure username
let password = '.....' // A secure password

user.create(username, password, cb => {
  user.auth(username, password)
})

gun.on('auth', async ack => {
  console.log('Authenticated')

  // Create an entangler instance with an SEA pair
  // The username and password here does not need, and probably shouldn't, match a Gun user's username and password!
  gun.entangler(ack.sea, {user: username, secret: password})

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

### Anonymous Peer
This is a peer that will be attempting to authenticate to the initiating peer's Entangler instance with the TOTP passcode.

```js
const Gun = require('gun')
const prompt = require('readline-sync')
require('entangler')

let gun = new Gun()

// Look up user by alias
gun.entangler('~@alias')

// Look up user by pub key (no prepending '~')
gun.entangler(pubkey)

// Prompt for a passcode
let passcode = prompt.question('Enter your pin + token: ')

// Verify the passed passcode 
gun.entangler.verify(passcode)

// If the passcode is accepted, the initiator's SEA is returned and can be used to log the user in
gun.entangler.once('authorized', (sea)=>{
  gun.user().auth(sea)
})

// The user has been logged in successfully
gun.on('auth', ack => {
  console.log('Authenticated!!')
})

// If the passcode is rejected, handle the error events
gun.entangler.on('error', err => {
  if(err) console.log(err)
  if(err.code === 401){
    let passcode = prompt.question('Pleae try again: ')
    gun.entangler.verify(passcode)
  }
})
```

## API
### Events
#### `authorized`
The peer successfully authenticated the TOTP passcode, so the initiating peer's SEA is passed as a callback to this event.

#### `error`
There was an error authenticating the TOTP passcode.

**Error codes**
- Incorrect passcode: `{code: 401, text: 'Incorrect passcode'}`
- Maximum number of attempts reached: `{code: 403, text: 'Maximum number of attempts reached'}`
- Attempts timed out: `{code: 408, text: 'Attempts timed out'}`

### Methods
#### `gun.entangler((sea, [opts]) || (alias || pubkey))`
For an Entangler initiator, creates an Entangler instance for the passed in `Gun.SEA.pair` and optional `opts`.

**Example:** `gun.entangler(ack.sea, {user: username, secret: password})`

For an Entangler peer, connects to an Engangler instance and attempts authorization with that instance and the TOTP passoce.

**Example (by alias):** `gun.entangler(~@alias)`
**Example (by pubkey):** `gun.entangler(pubkey)`
> The pubkey should not start with a preceding `~`

#### `gun.entangler.QR.image()`
Return the OTP auth URI QR code image. This is an asynchronous call and must be used with `await`.
  
**Example:** `console.log(await gun.entangler.QR.image())`

#### `gun.entangler.QR.terminal()`
Print the OTP auth URI QR code to the console/terminal using ascii output. This is an asynchronous call and must be used with `await`.
  
**Example:** `console.log(await gun.entangler.QR.terminal())`

#### `gun.entangler.token()`
Return the current authenticator token. This may be called at any time and will return the token for the current time window. This is an asynchronous call and must be used with `await`.

**Example:** `console.log(await gun.entangler.token())`

#### `gun.entangler.tokens(callback)`
Return tokens as they are generated. This method will return a new token every 0 and 30 seconds of every minute.

**Example:**
```js
  gun.entangler.tokens(token => {
    console.log(token)
  })
```

### Optional parameters `opts`
Entangler's optional `opts` object can be tailored to aid in securing Entangler further.

#### `opts.address = [string]` default = Gun.SEA.pair().pub
`opts.address` is an optional string that may be passed in as an identifier for peers to swarm around and connect to each other. It is converted to a SHA256 hash and announced to the Webtorrent network via Bugoff, which further hashes that hash to SHA256. A SHA256 hash of a SHA256 hash!

#### `opts.issuer = [string]` default = 'entangler Authenticator'
A TOTP issuer is used to describe the TOTP instance to authenticator apps.

#### `opts.user = [string]` default = randomly generated Base32 string
You may pass in your own string for `opts.user`. This is the TOTP user ID, which gets converted to a Base32 encoded SHA256 hash of the passed in string.

#### `opts.secret = [string]` default = randomly generated Base32 string
You may pass in your own string for `opts.password`. This is the TOTP secret, which gets converted to a Base32 encoded SHA256 hash of the passed in string.

#### `opts.pin = [string || number]` default = ''
You may supply a pin, which can be either a string or a number, as an optional additional security measure to protect the Entangler instance.

#### `opts.timeout = [msec]` default = 5 minutes (1000 * 60 * 5 msec )
The amount of time in milliseconds since this peer's first passcode entry attempt. Once this timeout has been met or exceeded, this peer can no longer make attempts. 

> Note: A peeer may try again by establishing a new connection.

#### `opts.maxAttempts = [number]` default = 10
The maximum attempts for a peer to enter incorrect passcodes.
