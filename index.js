const crypto = require('crypto')
var EventEmitter = require('events').EventEmitter
const base32 = require('hi-base32')
const qrcode = require('qrcode')
const { authenticator } = require('@otplib/preset-default')
const Gun = require('gun')
const { SEA } = require('gun')
const Bugoff = require('bugoff')

Gun.chain.entangler = async function(sea, opts) {
  const emitter = new EventEmitter()

  this.entangler = {
    attempts: {},
    on: emitter.on.bind(emitter),
    once: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter)
  }

  let anon = true
  let instanceSEA

  this.entangler.verify = async (passcode) => {
    this.entangler.passcode = base64(passcode)
  }

  if(typeof sea === 'string'){
    anon = true
    let pubkey = this.get(sea).once((data, key)=>{}).then(data => {
      try {
        return Object.keys(data)[1]
      }
      catch (err){
        return new Promise((resolve, reject) => {this.user(sea).once((data, key) => resolve(key))})
      }
    })
    pubkey = await pubkey
    pubkey = pubkey.split('~')[1]    
    this.entangler.address = sha(pubkey)
    instanceSEA = await SEA.pair()
  } else {
    anon = false
  }

  if(anon === false) {
    this.entangler = {
      on: emitter.on.bind(emitter),
      once: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      address: opts && opts.address || sha(sea.pub),
      issuer: opts && opts.issuer || 'Entanglement Authenticator',
      user: opts && opts.user ? base32.encode(sha(opts.user)) : authenticator.generateSecret(),
      secret: opts && opts.secret ? base32.encode(sha(opts.secret)) : authenticator.generateSecret(),
      pin: opts && opts.pin || '',
      timeout: opts && opts.timeout || 1000 * 60 * 5,
      maxAttempts: opts && opts.maxAttempts || 10,
      attempts: {},
      period: opts && opts.period || 30,
      digits: opts && opts.digits || 6,
      algorithm: opts && opts.algorithm || 'SHA1',
      uri: `otpauth://totp/${encodeURI(this.entangler.issuer)}:${this.entangler.user}?secret=${this.entangler.secret}&period=${this.entangler.period||30}&digits=${this.entangler.digits||6}&algorithm=${this.entangler.algorithm||'SHA256'}&issuer=${encodeURI(this.entangler.issuer)}`,
      QR: {}
    }

    this.entangler.QR.terminal = async () => {
      try {
        return await qrcode.toString(this.entangler.uri,{type:'terminal', small: true})
      }
      catch (err){
        throw new Error(err)
      }
    }
    this.entangler.QR.image = async () => {
      try {
        return await qrcode.toDataURL(this.entangler.uri)
      } catch (err) {
        throw new Error(err)
      }
    }
    instanceSEA = sea
  }

  let bugoff = new Bugoff(this.entangler.address)
  bugoff.SEA(instanceSEA)

  bugoff.register('accepted', async (address, sea, cb) =>{
    this.entangler.emit('authorized', sea)
  })
  
  bugoff.register('rejected', async (address, err, cb) =>{
    this.entangler.emit('error', err)
    if(err.code === 401) bugoff.rpc(address, 'challenge', this.entangler.passcode)
    else {
      cb(bugoff.destroy())
      if(process) process.exit()
      else debugger
    }
  })

  bugoff.register('challenge', async (address, verify, cb) =>{
    if(!this.entangler.attempts[address]) {
      this.entangler.attempts[address] = {count: 1, first: new Date().getTime()}
    }
    
    let t = new Date().getTime() - this.entangler.attempts[address].first
    
    if(t >= this.entangler.timeout){
      bugoff.rpc(address, 'rejected', {code: 408, text: 'Attempts timed out'})
    } else
    if(this.entangler.attempts[address].count >= this.entangler.maxAttempts){
      bugoff.rpc(address, 'rejected', {code: 403, text: 'Maximum number of attempts reached'})
    } else 
    if(anon === false){
      let check = base64(verify)
      let token = await this.entangler.token()
      let pin = this.entangler.pin.toString()
      if(check.lastIndexOf(token.length + pin.length === check.length && await this.entangler.token()) >= 0 && check.includes(pin)){
        bugoff.rpc(address, 'accepted', sea)
        this.entangler.passcode = undefined
      } else {
        bugoff.rpc(address, 'rejected', {code: 401, text: 'Incorrect passcode'})
        this.entangler.attempts[address].count++
        this.entangler.passcode = undefined
      }
    }
  })

  bugoff.on('seen', address => {
    if(this.entangler.passcode) bugoff.rpc(address, 'challenge', this.entangler.passcode)
  })

  this.entangler.token = async () => authenticator.generate(this.entangler.secret)

  let secret = this.entangler.secret
  this.entangler.tokens = async function(cb) {
    const interval = setInterval(() => {
      let sec = new Date().getSeconds()
      if (sec === 0 || sec === 30) {
        cb(authenticator.generate(secret))
      }
    }, 1000)
  }

  function sha(input){
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
  }

  function base64(string){
    let regx = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;  
    if(regx.test(string) === false){
      return new Buffer.from(string).toString('base64')
    } else {
      let data = new Buffer.from(string, 'base64')
      return new Buffer.from(data).toString()
    }
  }

  return this
}